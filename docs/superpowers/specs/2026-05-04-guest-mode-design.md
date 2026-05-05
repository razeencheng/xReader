# Guest Mode Design Spec

## Overview

为 xReader 添加访客模式，允许未登录用户以只读+交互的方式体验完整产品功能，用于 demo 展示。访客数据与 admin 完全隔离，1 天后自动清理。

## 核心决策

| 决策项 | 选择 |
|--------|------|
| 内容来源 | 共享 admin 的源和文章 |
| 进入方式 | 无需操作，未登录即浏览 |
| 功能范围 | 已读/进度/高亮/AI翻译/源浏览(只读)/用户设置 全开放 |
| Admin 面板 | 对访客隐藏 |
| 源管理 | 只读（可浏览/刷新，不可增删） |
| AI 翻译限制 | 无限制 |
| 数据生命周期 | 1 天过期，自动清理 |
| 启用方式 | Admin 手动在设置中开启 |
| 实现方案 | 数据库匿名用户（role=guest） |

## 数据模型

### Users 表扩展

现有 schema：
```sql
CREATE TABLE users (
    id              bigserial PRIMARY KEY,
    github_id       bigint UNIQUE NOT NULL,  -- 问题：UNIQUE + NOT NULL
    github_username text UNIQUE NOT NULL,    -- 问题：UNIQUE
    ...
);
```

**修改方案：** 将 `github_id` 改为 nullable，并将 UNIQUE 约束改为 partial index（仅对非 null 值生效）。Guest 用户 `github_id = NULL`。

```sql
-- Migration: add_guest_mode_support

-- 1. Relax github_id constraint for guest users
ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;
DROP INDEX IF EXISTS users_github_id_key;
CREATE UNIQUE INDEX users_github_id_key ON users (github_id) WHERE github_id IS NOT NULL;

-- 2. github_username: guest uses 'guest-<random>' which won't conflict with real GitHub usernames
-- (existing UNIQUE constraint is fine — each guest gets a unique random suffix)

-- 3. Add expires_at column
ALTER TABLE users ADD COLUMN expires_at TIMESTAMPTZ;

-- 4. Index for cleanup query
CREATE INDEX idx_users_guest_expires ON users (role, expires_at)
  WHERE role = 'guest';

-- 5. Index on auth_sessions(user_id) for cleanup performance
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions (user_id);
```

Guest 用户记录：
- `role = 'guest'`
- `github_id = NULL`
- `github_username = 'guest-<16位随机hex>'`（足够避免碰撞）
- `avatar_url = NULL`
- `expires_at = NOW() + INTERVAL '1 day'`
- `native_language` / `density_pref` / `theme_pref` 继承 admin 当前值作为默认，访客可修改

### Settings 表

```sql
-- 使用现有 settings KV 表，通过代码插入默认值
-- key: 'guest_mode_enabled', value: 'false'
```

### 数据归属（修正后）

基于实际 schema：
- `reading_progress` 是 `article_states.reading_progress` 字段（jsonb），不是独立表
- 用户设置（language/density/theme）是 `users` 表的字段，不是独立表

| 表/字段 | Guest 访问方式 |
|----|---------------|
| `sources` | 读取 admin 的源（WHERE user_id = admin_id） |
| `articles` | 读取 admin 源关联的文章（JOIN sources WHERE sources.user_id = admin_id） |
| `article_states` | Guest 自己的记录（user_id = guest_id），含 is_read/is_starred/reading_progress |
| `article_state_changes` | Guest 自己的记录（user_id = guest_id） |
| `highlights` | Guest 自己的记录（article_id 引用 admin 的文章） |
| `users` 表字段 | Guest 的 native_language/density_pref/theme_pref 独立于 admin |

### Admin 识别

取 `users` 表中 `role = 'admin'` 的第一个用户（按 `id ASC`）作为内容源。

**前置条件：** Guest mode 只在存在至少一个已登录的 admin 用户时才生效。`/api/guest/status` 端点需要同时检查 `guest_mode_enabled = true` AND 存在 `role = 'admin'` 的 user row。如果 admin 从未完成 OAuth 登录（仅在 allowlist 中），则 guest mode 自动不可用。

## 后端设计

### 1. 中间件层：`OptionalAuth`

新增中间件 `OptionalAuth`，**仅替代 `/api` 路由组的 `RequireAuth`**。其他公开路由（`/health`、`/api/setup/*`、OAuth routes、`/fever/`）不受影响。

```
请求到达 /api/* → 有 session cookie？
  ├─ 是 → 验证 session → 用户存在？
  │    ├─ 是 → 检查 user.expires_at（如果非 null 且已过期 → 删除 session → 走"否"分支）
  │    └─ 否 → 走"否"分支
  └─ 否 → guest_mode_enabled？ AND admin 存在？
       ├─ 是 → 创建 guest user + session → Set-Cookie → 继续
       └─ 否 → 返回 401（现有行为）
```

关键细节：
- **过期检查内置于 auth middleware**：不仅依赖 cleanup job，middleware 本身检查 `expires_at`，过期用户立即 401
- Guest 创建后，后续请求通过 cookie 走正常 session 验证路径
- Session 的 `last_seen_at` 不用于 guest TTL——使用 `user.expires_at` 作为唯一过期判断
- `GetUser(c)` 返回的 user 对象带 `role=guest`，handler 据此判断权限

### 2. SessionStore 扩展

现有 `PgSessionStore` 的 `Create` 方法不接受自定义 TTL。需要新增：

```go
// 新方法：创建带自定义 TTL 的 session（guest 用）
func (s *PgSessionStore) CreateWithTTL(ctx context.Context, userID int64, userAgent string, ttl time.Duration) (string, error)
```

或者更简单：guest session 复用现有 `Create`，过期判断完全依赖 `users.expires_at`（middleware 已检查），不依赖 session 本身的 TTL。这样 SessionStore 无需改动。

**推荐：不改 SessionStore。** 过期逻辑集中在 `users.expires_at`，简单可靠。

### 3. 权限控制层：`GuestReadOnly`

新增中间件，用于需要限制 guest 写操作的路由：

```go
func GuestReadOnly() gin.HandlerFunc {
    return func(c *gin.Context) {
        user := GetUser(c)
        if user != nil && user.Role == "guest" {
            c.JSON(403, gin.H{"error": "guests cannot modify this resource"})
            c.Abort()
            return
        }
        c.Next()
    }
}
```

### 4. 路由变更（修正后完整路由表）

**中间件替换范围：** 仅 `/api` group 的 `RequireAuth` → `OptionalAuth`

被 `GuestReadOnly` 保护的路由（guest 不可写）：
```
POST   /sources              （添加源）
PUT    /sources/:id          （重命名）
PATCH  /sources/:id/category （修改分类）
DELETE /sources/:id          （删除源）
POST   /sources/import       （导入 OPML）
POST   /users/me/fever       （设置 Fever 密码 — guest 不得创建 Fever key）
```

保持 `RequireAdmin`（guest 不可见不可访问）：
```
GET    /admin/allowlist
POST   /admin/allowlist
DELETE /admin/allowlist/:username
PATCH  /ai/settings          （AI 配置修改）
PATCH  /api/settings/guest   （Guest mode 开关）
```

Guest 可正常使用的路由：
```
GET    /sources              → 返回 admin 的源列表
GET    /sources/export       → 导出 admin 的 OPML
POST   /sources/:id/refresh  → 触发刷新 admin 的源
GET    /sources/jobs/:jobID  → 查看刷新任务状态
GET    /articles             → 返回 admin 源下的文章
GET    /articles/:id         → 文章详情
POST   /articles/:id/original → 加载原始正文（修改的是 admin 的 article 数据，见下方说明）
PATCH  /articles/:id/state   → guest 自己的已读/收藏状态
PUT    /articles/:id/progress → guest 自己的阅读进度
POST   /articles/batch/state → guest 批量修改自己的状态
GET    /articles/changes     → guest 自己的状态变更记录
GET    /articles/:id/ai      → AI 元数据（共享数据，只读）
GET    /articles/:id/body-translation → AI 翻译 SSE
POST   /articles/:id/body-translation/retry → 触发 AI 重翻译
POST   /highlights           → guest 自己的高亮
GET    /highlights           → guest 自己的高亮
GET    /articles/:id/highlights → guest 自己的高亮
PUT    /highlights/:id/note  → 修改 guest 自己的高亮备注
DELETE /highlights/:id       → 删除 guest 自己的高亮
GET    /users/me             → guest 自己的设置
PATCH  /users/me             → guest 修改自己的设置
GET    /api/auth/me          → 返回 guest user 信息
POST   /api/auth/logout      → 清除 guest session
```

**关于 `POST /articles/:id/original`：** 此端点拉取原文并更新 `articles` 表（共享数据）。Guest 调用此操作的结果对所有人可见（与 source refresh 类似）。可接受——只是提前拉取内容，无破坏性。

### 5. 查询层适配（核心难点）

**问题：** 现有 sqlc 查询中 `s.user_id = $1` 和 `st.user_id = $1` 使用同一个参数。Guest 模式需要拆分为两个参数：`content_owner_id`（admin）和 `state_owner_id`（guest）。

**方案：添加新的 sqlc 查询用于 guest 模式**，而非修改已有查询（避免影响正式用户路径）。

```sql
-- name: ListArticlesTodayEnrichedGuest :many
-- 与 ListArticlesTodayEnriched 相同，但分离 source owner 和 state owner
WITH ranked AS (
  SELECT ...
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = @target_language
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id   -- admin's sources
    AND s.deleted_at IS NULL
    ...
)
...
```

需要新增 Guest 变体的查询（约 8-10 个）：
- `ListArticlesTodayEnrichedGuest`
- `ListArticlesStreamEnrichedGuest`
- `ListArticlesStarredEnrichedGuest`
- `ListArticlesBySourceEnrichedGuest`
- `ListArticlesStreamGuest`
- `ListArticlesBySourceGuest`
- `ListArticlesStarredGuest`
- `CountTodayByReadStateGuest`
- `CountStreamByReadStateGuest`
- `CountBySourceReadStateGuest`

**Service 层适配：**

```go
func (s *ArticleService) ListTodayEnriched(ctx context.Context, userID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
    // 现有逻辑不变
}

func (s *ArticleService) ListTodayEnrichedAsGuest(ctx context.Context, guestID, contentOwnerID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
    rows, err := s.queries.ListArticlesTodayEnrichedGuest(ctx, gen.ListArticlesTodayEnrichedGuestParams{
        ContentOwnerID: contentOwnerID,
        StateOwnerID:   guestID,
        TargetLanguage: lang,
        ReadFilter:     normalizeReadFilter(readFilter),
    })
    // ...
}
```

**Handler 层调度（推荐封装）：**

```go
// 在 handler 中统一判断
func (h *ArticleHandler) resolveOwners(c *gin.Context) (stateOwnerID, contentOwnerID int64) {
    user := middleware.GetUser(c)
    if user.Role == "guest" {
        return user.ID, h.adminID  // adminID 启动时缓存
    }
    return user.ID, user.ID
}
```

### 6. Highlight ownership 适配

**问题：** `highlight.Service.paragraphText()` 中有 `source.UserID != userID` 的检查，guest 创建高亮时会因 source 不属于自己而失败。

**修复：** 将 `paragraphText` 的 ownership 检查改为接受 content owner ID：

```go
func (s *HighlightService) paragraphText(ctx context.Context, contentOwnerID int64, params CreateParams) (string, error) {
    article, err := s.queries.GetArticleByID(ctx, params.ArticleID)
    if err != nil {
        return "", errNotFound
    }
    source, err := s.queries.GetSourceByID(ctx, article.SourceID)
    if err != nil || source.UserID != contentOwnerID {
        return "", errNotFound
    }
    // ...
}
```

`Create` 方法签名变为：
```go
func (s *HighlightService) Create(ctx context.Context, userID, contentOwnerID int64, params CreateParams) (*gen.Highlight, error)
```

正式用户调用时 `userID == contentOwnerID`；guest 调用时 `contentOwnerID = adminID`。

### 7. Fever API 隔离

**问题：** `/fever/` 使用独立的 API key 认证，不经过 session middleware。如果 guest 通过 `POST /users/me/fever` 设置了密码，理论上可通过 Fever API 绕过 guest 限制。

**修复：** `POST /users/me/fever` 已被 `GuestReadOnly` 中间件拦截（见路由表），guest 无法设置 Fever 密码。无需额外处理。

### 8. 自动清理（修正后）

在 `sync` worker 的循环中添加清理逻辑（每小时执行一次）：

```go
func (w *Worker) cleanupExpiredGuests(ctx context.Context) error {
    // 按依赖顺序删除（无 CASCADE 的表先删）
    // 1. highlights (无 ON DELETE CASCADE)
    // 2. article_state_changes (无 FK 回 users，必须显式删)
    // 3. article_states (有 ON DELETE CASCADE，但显式删更安全)
    // 4. auth_sessions (有 ON DELETE CASCADE)
    // 5. users WHERE role = 'guest' AND expires_at < NOW()

    _, err := w.pool.Exec(ctx, `
        WITH expired AS (
            SELECT id FROM users WHERE role = 'guest' AND expires_at < NOW()
        )
        DELETE FROM highlights WHERE user_id IN (SELECT id FROM expired);

        WITH expired AS (
            SELECT id FROM users WHERE role = 'guest' AND expires_at < NOW()
        )
        DELETE FROM article_state_changes WHERE user_id IN (SELECT id FROM expired);

        DELETE FROM users WHERE role = 'guest' AND expires_at < NOW();
    `)
    return err
}
```

注意：`article_states` 和 `auth_sessions` 有 `ON DELETE CASCADE`，删 user 时自动清理。但 `highlights` 和 `article_state_changes` 没有 CASCADE，必须显式删除。

### 9. Guest Mode 配置 API

```
GET  /api/guest/status   → { enabled: bool }
```
- **公开端点**（不经过 OptionalAuth），前端判断是否需要 redirect to login
- 检查逻辑：`settings['guest_mode_enabled'] == 'true'` AND `EXISTS(SELECT 1 FROM users WHERE role = 'admin')`

Admin 管理端点（需 RequireAdmin）：
```
GET   /api/settings/guest  → { enabled: bool }
PATCH /api/settings/guest  → body: { enabled: bool }
```

## 前端设计

### 1. Auth 流程变更

**问题：** 现有 `api-client.ts` 对任何 401 响应直接 `window.location.href = '/login'`，`(app)/layout.tsx` 在 `!user` 时 `router.replace('/login')`。两处都需要修改。

**修改后流程：**

```
页面加载 → fetchMe()
  ├─ 200 + user (role=guest|user|admin) → 正常渲染
  └─ 401 → fetch /api/guest/status（公开端点）
       ├─ enabled: true → 再次 fetchMe()
       │   （此时 OptionalAuth 已创建 guest + Set-Cookie，第二次请求应成功）
       │   如果仍然 401 → redirect to /login（异常情况）
       └─ enabled: false → redirect to /login
```

**api-client.ts 修改：**
- 移除 401 时的自动 redirect
- 改为抛出 `ApiError`，由上层（layout/store）决定是否 redirect
- 或：增加一个 flag `isGuestBootstrapping` 期间不 redirect

**AppLayout 修改：**
- `!user && !isLoading` 时，先检查 guest status 再决定是否 redirect
- 也可以简化为：如果 `fetchMe()` 返回了 user（含 guest），正常渲染；只有明确得到 401 + guest mode disabled 时才 redirect

**更精确的实现（推荐）：**

由于 `OptionalAuth` 在第一次请求时就会创建 guest 并 Set-Cookie，实际上前端 `fetchMe()` 不应收到 401（因为中间件已经处理）。但存在一个 timing 问题：Set-Cookie 在 response header 中，response body 是 200 + guest user。所以：

- Guest mode 开启时：首次 `GET /api/auth/me` → OptionalAuth 创建 guest → 200 + guest user
- Guest mode 关闭时：首次 `GET /api/auth/me` → OptionalAuth fallback 到 401

所以前端只需要：
1. `fetchMe()` → 200 → 拿到 user，正常渲染
2. `fetchMe()` → 401 → redirect to /login

**这意味着前端 401 处理逻辑不需要大改。** 唯一的改动是 AppLayout 不再在 401 后立即跳转，而是尝试一次 guest bootstrap：

```typescript
// useAuthStore.ts
fetchMe: async () => {
    try {
        const user = await apiGet('/api/auth/me');
        set({ user, isLoading: false });
    } catch (e) {
        // 不再立即 redirect，让 layout 处理
        set({ user: null, isLoading: false });
    }
}
```

```typescript
// (app)/layout.tsx
if (!isLoading && !user) {
    router.replace('/login');  // 此时 guest mode off 或异常
}
```

**api-client.ts 修改：**
- 移除 `apiFetch` 中 401 时的 `window.location.href = '/login'` 自动跳转
- 改为只抛出 `ApiError`，由调用方处理
- `fetchMe` 调用 catch 后 set user=null，layout 负责 redirect

### 2. UI 状态适配

Auth store 新增 getter：

```typescript
// useAuthStore.ts
get isGuest(): boolean { return this.user?.role === 'guest' }
```

条件渲染规则：
| 元素 | Guest 行为 |
|------|-----------|
| Admin 面板入口（sidebar/nav） | 隐藏 |
| 源列表：添加/导入/删除按钮 | 隐藏 |
| 源列表：浏览/刷新 | 正常显示 |
| 设置页：Fever 密码区域 | 隐藏 |
| 文章已读/收藏 | 正常交互 |
| 高亮功能 | 正常交互 |
| AI 翻译 | 正常交互 |
| 用户设置（语言/主题/密度） | 正常交互 |
| 顶部提示条 | 显示访客模式信息 |

**具体需要修改的文件（based on Codex review）：**
- `web/src/app/(app)/sources/page.tsx` — 隐藏 add/import/delete 按钮
- `web/src/app/(app)/settings/page.tsx` — 隐藏 Fever key 区域
- Sidebar/nav component — 隐藏 admin 入口

### 3. 访客提示条

页面顶部显示一个低调的提示条：
- 文案：「Guest Mode · Data expires in 24h」（跟随用户语言设置）
- 附带一个「Sign in with GitHub」链接
- 可被用户关闭（关闭状态存 localStorage，key: `guest_banner_dismissed`）
- 关闭后不再显示，直到 guest session 过期重新创建

### 4. Login 页面

当 guest mode 开启时：
- Login 页面不再是必经之路（用户直接进入内容）
- 但保留 `/login` 路由，供 guest 主动登录升级身份用
- Guest 登录成功后，OAuth callback 创建/匹配正式用户，旧 guest session 自然过期被 cleanup

## 数据库迁移

完整 migration（`012_guest_mode.up.sql`）：

```sql
-- 1. Relax github_id for guest users
ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;
DROP INDEX IF EXISTS users_github_id_key;
CREATE UNIQUE INDEX users_github_id_key ON users (github_id) WHERE github_id IS NOT NULL;

-- 2. Add expires_at
ALTER TABLE users ADD COLUMN expires_at TIMESTAMPTZ;

-- 3. Partial index for cleanup
CREATE INDEX idx_users_guest_expires ON users (role, expires_at)
  WHERE role = 'guest';

-- 4. Index for session cleanup by user_id
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions (user_id);
```

Down migration（`012_guest_mode.down.sql`）：

```sql
DROP INDEX IF EXISTS idx_auth_sessions_user_id;
DROP INDEX IF EXISTS idx_users_guest_expires;
ALTER TABLE users DROP COLUMN IF EXISTS expires_at;
-- Restore github_id constraint (delete guests first)
DELETE FROM users WHERE role = 'guest';
DROP INDEX IF EXISTS users_github_id_key;
ALTER TABLE users ALTER COLUMN github_id SET NOT NULL;
CREATE UNIQUE INDEX users_github_id_key ON users (github_id);
```

## 测试策略

### 后端

- `middleware_test.go`：
  - OptionalAuth + guest mode off → 401
  - OptionalAuth + guest mode on + no admin row → 401
  - OptionalAuth + guest mode on + admin exists → 创建 guest + 200
  - OptionalAuth + expired guest session → 401 + 清理
- `guest_cleanup_test.go`：
  - 过期 guest 的 highlights/article_state_changes/article_states/sessions/user 全部清除
  - 未过期 guest 不受影响
  - 正式用户不受影响
- `article_service_test.go`：guest 查询返回 admin 的文章 + guest 自己的 states
- `source_service_test.go`：guest 查询返回 admin 的源
- `highlight_service_test.go`：guest 可对 admin 的文章创建高亮，ownership check 通过 contentOwnerID
- 权限测试：guest 访问 GuestReadOnly 路由返回 403
- 权限测试：guest 访问 RequireAdmin 路由返回 403

### 前端

- 组件测试：guest 角色下 admin 入口隐藏、源管理按钮隐藏、Fever 区域隐藏
- Auth flow 测试：guest mode on 时 fetchMe 返回 guest user
- 提示条渲染、关闭逻辑、localStorage 持久化

## 边界情况

1. **Guest mode 关闭时已有 guest session** → middleware 检查 `guest_mode_enabled`，如果关闭，对 guest role 用户返回 401
2. **Admin 未完成 OAuth 登录**（仅在 allowlist 中但无 user row）→ `/api/guest/status` 返回 `enabled: false`，guest mode 不可用
3. **Admin 删除账户** → 同上，guest mode 自动降级
4. **并发大量访客** → 每个访客一条 user 记录 + session + 少量 state 数据，1 天清理，数据量可控
5. **Guest 尝试登录** → OAuth 成功后创建/匹配正式用户，旧 guest session 过期后被 cleanup 清理
6. **源刷新** → guest 可触发 admin 源的刷新，刷新结果所有人可见——可接受，只是提前拉取新文章
7. **Guest session cookie + Guest mode 关闭** → OptionalAuth 中增加检查：如果 user.role == 'guest' 且 guest_mode_enabled == false → 401
8. **多个 admin** → 取 id 最小的 admin 作为 content owner（未来可配置）
9. **GitHub username 碰撞** → `guest-<16位hex>` 碰撞概率可忽略；即使碰撞，INSERT 会报 unique violation，retry 一次即可

## 实现复杂度评估

| 模块 | 难度 | 说明 |
|------|------|------|
| DB Migration | 低 | 简单 ALTER + INDEX |
| OptionalAuth middleware | 中 | 需要处理 guest 创建 + expires_at 检查 + guest_mode 开关 |
| GuestReadOnly middleware | 低 | 几行代码 |
| sqlc Guest 查询变体 | 中-高 | 8-10 个新查询，基本是 copy + 拆分参数 |
| Service 层 AsGuest 方法 | 中 | 每个 service 新增 guest 变体方法 |
| Handler 层 owner 分发 | 中 | 统一 resolveOwners helper |
| Highlight ownership 修复 | 低 | paragraphText 增加 contentOwnerID 参数 |
| Cleanup goroutine | 低 | 周期删除逻辑 |
| 前端 auth flow | 中 | 移除 401 自动 redirect，改为 store 驱动 |
| 前端 UI 条件渲染 | 低-中 | 3-4 个页面加 isGuest 条件 |
| Guest 提示条组件 | 低 | 新组件 + localStorage |

## 不在范围内

- Guest 之间的数据共享
- Guest 升级为正式用户时的数据迁移（登录后从零开始）
- Rate limiting（未来可加，当前 demo 用途流量小）
- 多 admin 场景的灵活 content owner 选择
- Guest 的 OPML 导入
