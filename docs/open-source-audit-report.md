# xReader 开源前综合审查报告

**审查日期：** 2026-05-02  
**审查方法：** 两轮独立审查合并去重  
- **第一轮（6 Agent 并行）：** 安全、Go 后端质量、前端质量、文档完整性、依赖许可证、配置部署  
- **第二轮（Codex 4 Agent）：** 后端行为、前端行为、文档/仓库卫生、安全深度扫描  

**结论：尚不具备开源发布条件。** 需要先解决测试红灯、安全加固等阻塞项，并从干净 commit/tag 发布（不得从 raw workspace archive 发布）。

---

## 总体评估

项目架构清晰、类型安全出色（前端零 `any`）、SQL 全部 sqlc 参数化、直接依赖许可证未发现明显冲突。但当前存在测试失败、安全回退漏洞、文档与代码不一致等问题，需分阶段修复后才能公开发布。必须从干净的 Git commit/tag 发布，不能从包含 `.env`、untracked 资源的工作区压缩包发布。

---

## P0：阻塞发布

### 1. 后端测试失败

`go test ./...` 失败：

- `server/internal/source/service_test.go:236` — `TestSourceService_RefreshRunsEagerAIForInsertedArticles` 期望两次 AI 调用，但实现已合并为一次

**修复方向：** 确认合并调用是否为预期行为，相应更新测试断言或恢复分离调用。

### 2. 前端测试失败（8 个）

`pnpm vitest run` 失败：

| 文件 | 失败数 | 原因 |
|------|--------|------|
| `TweaksPanel.test.tsx` | 3 | 面板不再有内部打开按钮，由外部控制 |
| `FeedList.test.tsx` | 3 | 空状态文案/行为变更 |
| `SourcesPage.test.tsx` | 1 | mock 缺少 `ApiError` 导出 |
| `SettingsPage.test.tsx` | 1 | `readOnly` vs `disabled` 属性不匹配 |

**修复方向：** 区分过时测试和真正回归，按当前行为更新测试。

### 3. .gitignore 排除了 .github

`.gitignore:14` 包含 `.github`，导致 CI workflows 和 issue templates 可能被忽略。

**修复方向：** 从 `.gitignore` 中移除 `.github` 条目。

---

## P1：安全与正确性

### 4. Go module 路径不匹配

`server/go.mod` 声明 `github.com/jin/xreader-web`，但实际仓库为 `github.com/razeencheng/xreader`。全局 105 处 import 需要批量替换。

**修复方向：** `go mod edit -module github.com/razeencheng/xreader`，然后批量替换所有 import 路径。

### 5. Admin 删除端点 Bug

路由注册为 `/admin/allowlist/:username`，但 handler 读取 `c.Param("github_username")`。删除操作永远传空字符串。

- `server/internal/platform/router.go:146`
- `server/internal/admin/allowlist_handler.go:56`

**修复方向：** 统一 param 名称，添加 handler 级集成测试。

### 6. RSS 发现/抓取缺少 SSRF 防护

- `server/internal/source/discovery.go:39,93`
- `server/internal/source/rss_adapter.go:22,49`

source discovery 和 RSS adapter 使用默认 HTTP 客户端，无内网 IP 拦截。项目已有 `original_fetcher.go` / `image_proxy_handler.go` 的 SSRF 防护模式，应提取复用。

**修复方向：** 提取共享 `SafeHTTPClient`，拒绝 localhost/private/link-local/multicast，重验证 redirect，限制响应大小。

### 7. 弱 Session/加密密钥回退

| 位置 | 问题 |
|------|------|
| `server/cmd/xreader/main.go:38` | `SESSION_SECRET` 未设置时回退 `"change-me"` |
| `server/internal/crypto/secrets.go:25` | 加密密钥回退到公开字符串 `"xreader-local-ai-settings-v1"` |
| `docker-compose.yml:8` | 示例中包含弱默认值 |

**修复方向：** 非 dev 模式下缺少强 secret 则 `log.Fatal` 拒绝启动。移除 docker-compose 中的弱默认。文档提供 `openssl rand -hex 32` 生成命令。

### 8. 文章状态写入缺少所有权检查

- `server/internal/article/service.go:193,216`
- `server/db/queries/states.sql:1`
- `server/internal/fever/handler.go:372`

单篇文章的 read/star/progress 写入直接 upsert，不验证文章是否属于当前用户。攻击者可修改其他用户的文章状态。

**修复方向：** 改为 `INSERT ... SELECT ... JOIN sources WHERE sources.user_id = $user_id`，无匹配时返回 404。添加跨用户负面测试。

### 9. 本地 .env 含真实凭证

`.env` 中包含 GitHub OAuth secret、Session secret、OpenAI API key。该文件已 gitignore 且从未被提交，不会随 Git 仓库内容公开。

**修复方向：**
- 禁止通过工作区压缩包发布，只从干净 commit/tag 推送；
- 开源前删除本地 `.env`（或确认不会被打包进 Docker build context）；
- 如果这些凭证曾被提交、共享、打包进镜像上下文或上传过，则需要轮换；
- 添加 pre-commit hook 阻止 `.env` 被 stage。

### 10. 发布 checklist：Git remote 与内部 URL

当前 remote 指向私有 Gitea（`git.isw.app`）。remote 配置不会进入 Git commit，不会随 GitHub 仓库内容公开，但属于发布流程风险。

**修复方向：** 切换/新增 GitHub remote；检查 README、docs、CI 中没有内部 URL（`git.isw.app`、`newapi.razeen.cn` 等）。私人 API 地址不属于 credential，归类为内部域名清理。

### 11. 部署文档描述旧架构

`ops/deploy.md`、`ops/restore.md`、`AGENTS.md` 仍引用 Redis、`cmd/api`、`cmd/worker`、`config/ai.yaml`、`server/api/openapi.yaml`（文件不存在）、独立 api/web/worker 服务。

**修复方向：** 更新为当前 single-binary + Postgres 架构。移除或标记遗留内容。

### 12. Deploy Compose 与代码/CI 不一致

| 问题 | 位置 |
|------|------|
| 镜像用 Docker Hub 但 CI 推 GHCR | `deploy/docker-compose.yml:3` vs `.github/workflows/release.yml:41` |
| 使用 `GITHUB_OAUTH_CALLBACK` 但代码读 `GITHUB_CALLBACK_URL` | `deploy/.env.example:10` vs `server/internal/platform/router.go:47` |

**修复方向：** 统一镜像名和环境变量名。

---

## P2：质量与体验

### Cookie、CSRF 与安全头

| # | 问题 | 位置 |
|---|------|------|
| 15 | Session cookie 应为 `SameSite=Strict` | `server/internal/auth/handler.go:57` |
| 16 | SSE 翻译端点是 GET 但会写入状态/触发 AI，绕过 CSRF | `server/internal/article/sse_handler.go:194,221` |
| 17 | 缺少 CSP、X-Content-Type-Options、Referrer-Policy 等安全头 | 全局中间件 |
| 18 | Secure cookie 依赖 `COOKIE_SECURE` 环境变量，反向代理下可能失效 | `server/internal/auth/handler.go:17` |

### Go 后端

| # | 问题 | 位置 |
|---|------|------|
| 19 | Fever handler 缺少 `rows.Err()` 检查（5处） | `server/internal/fever/handler.go:159,249,336,363` |
| 20 | GitHub API 调用使用无超时的 `http.DefaultClient` | `server/internal/auth/github.go:63` |
| 21 | SSE goroutine 用 `context.Background()` 无超时，DB 宕机永久阻塞 | `server/internal/article/sse_handler.go:239-244` |
| 22 | Article stream 分页仅用 `published_at < cursor`，同时间戳会丢数据 | `server/db/queries/articles.sql:70` |
| 23 | Highlight 验证按索引取翻译段落，稀疏 lazy cache 会误判 | `server/internal/highlight/service.go:133` |
| 24 | Fetch 逻辑在 `source/service.go` 和 `sync/fetchjob.go` 重复 | 两文件 |
| 25 | `stripHTML()`、`maskAPIKey()`、`normalizeEndpoint()` 跨包重复 | ai/ + setup/ + source/ + sync/ |
| 26 | 大量死代码 | `platform/jobs.go`（整文件）、`parseBatchTranslation()`、`Config`/`ProviderConfig`、`sessionTTL`、`BodyRetryHandler.pool` |
| 27 | Handler struct 导出 `Service` 字段破坏封装 | admin/article/highlight/source handler |
| 28 | `countWords()` 双次 `strings.Fields()` | `server/internal/article/handler.go:455-462` |
| 29 | Eager AI 对 N 篇 × M 语言串行阻塞 | `server/internal/source/service.go:190-209` |

### 前端

| # | 问题 | 位置 |
|---|------|------|
| 30 | 缺少 `error.tsx` / `not-found.tsx` 错误边界 | `src/app/` |
| 31 | TweaksPanel useEffect 无依赖数组，每次渲染重注册 listener | `TweaksPanel.tsx:94` |
| 32 | 移动端菜单缺 `role="menu"` / `aria-label` | `ReaderHeader.tsx:137-170` |
| 33 | Feed row 用 `role="button"` 嵌套交互按钮，a11y 违规 | `FeedRowComfortable.tsx:39`、`FeedRowCompact.tsx` |
| 34 | `<html lang>` 固定为 `zh-CN`，应跟随用户语言 | `src/app/layout.tsx:54` |
| 35 | 3 个死组件未使用 | `FeedTabs.tsx`、`DensityToggle.tsx`、`PrevNextBar.tsx` |
| 36 | 可选补 `'use client'` 指令以明确边界 | `KeyPointsCallout.tsx`、`SourceExcerptNotice.tsx`、`ReadFilterSegmentedControl.tsx`（当前构建通过，因由 client component 导入；若未来被 server component 直接导入会报错） |
| 37 | i18n 字典全量打包（872行/9语言/~30KB） | `web/src/lib/i18n.ts` |
| 38 | 401 多并发请求重复重定向 | `web/src/lib/api-client.ts:32-34` |
| 39 | Reader/前端行为偏离 spec（路由 `/?article=` vs `/read/:id`，快捷键、手势导航） | 多处 |
| 40 | Source 添加流程客户端拼接 URL 而非提交给后端 discovery | `sources/page.tsx:529` |
| 41 | `metadataBase` 缺失，社交图片解析为 localhost | `next.config.ts` |

### 依赖

| # | 问题 | 位置 |
|---|------|------|
| 42 | goquery v1.8.0 严重过时（4年+，安全敏感 HTML 解析） | `server/go.mod` |
| 43 | `@types/dompurify` 已废弃（DOMPurify 自带类型） | `web/package.json` |
| 44 | `whatlanggo` 7 年未维护（单人维护） | `server/go.mod` |
| 45 | `golang.org/x/net` v0.51→v0.53 可评估升级（govulncheck 未报告漏洞，但新版含 HTTP/2 和 HTML 处理改进） | `server/go.mod` |
| 46 | postcss <8.5.10 有中等安全通告（via Next） | `pnpm-lock.yaml` |

### 配置与部署

| # | 问题 | 位置 |
|---|------|------|
| 47 | 旧 `web/Dockerfile` 期望 standalone 输出但代码用 `output: "export"`（根 Dockerfile 正确复制 `web/out`） | `web/Dockerfile` |
| 48 | Dockerfile 以 root 运行 | `Dockerfile` |
| 49 | xreader 服务无 healthcheck（端点已存在） | `docker-compose.yml` |
| 50 | Migration 006 缺 down 文件 | `server/db/migrations/` |
| 51 | Makefile 无 help target + `xargs -r` macOS 不兼容 | `Makefile` |
| 52 | `.env.example` DATABASE_URL 仅适用 Docker 网络 | `.env.example` |

---

## P3：打磨

| # | 问题 | 说明 |
|---|------|------|
| 53 | 缺少 `CODE_OF_CONDUCT.md` | 添加 Contributor Covenant |
| 54 | 缺少 `SECURITY.md` | 安全漏洞披露策略 |
| 55 | README 缺截图/Demo | 添加应用截图 |
| 56 | `web/README.md` 仍为 create-next-app 模板 | 替换或删除 |
| 57 | AI 开发日志应清理 | `docs/claude/devlog/`、`docs/Codex/devlog/` |
| 58 | 测试文件含内部域名 | `SettingsPage.test.tsx` 中 `https://newapi.razeen.cn/v1` → `https://api.example.com/v1`（非 credential，属内部域名清理） |
| 59 | 导出 Go 类型缺 godoc 注释 | 全局 |
| 60 | 无 `THIRD-PARTY-LICENSES` 通知文件 | AGPL 项目最佳实践，需覆盖 transitive deps |
| 61 | Setup token 输出到 stdout（云日志可见） | 考虑文件输出或 TTL 后清除 |

---

## ✅ 做得好的方面

| 方面 | 详情 |
|------|------|
| TypeScript 严格性 | 零 `any`、零 `@ts-ignore`、零 `eslint-disable`、strict 全开 |
| 许可证合规 | 直接依赖未发现与 AGPL-3.0 冲突（MIT/BSD/Apache/ISC）；发布前需生成 `THIRD-PARTY-LICENSES` 覆盖 transitive deps |
| SQL 安全 | sqlc 参数化查询，无注入风险；`go vet` 通过 |
| XSS 防护 | 双层：后端 bluemonday + 前端 DOMPurify（FORBID_TAGS/ATTR） |
| 图片/文章 SSRF | original_fetcher + image_proxy 有完整 IP 拦截 + DNS rebinding 防护 |
| OAuth | HMAC 签名 state token + TTL，32字节 crypto/rand session ID |
| Cookie | HttpOnly + SameSite=Lax + 条件 Secure |
| AI 密钥 | AES-256-GCM 加密存储，密钥用 SHA-256 派生 |
| 供应链 | go.sum + pnpm-lock.yaml 已提交，无 git commit 固定，无 replace |
| 架构 | 包边界清晰、testcontainers 真实 Postgres |
| Go 构建 | `go build` + `go vet` + `govulncheck` 均通过 |
| 前端构建 | `pnpm build` 通过，`pnpm lint` 通过 |
| 状态管理 | Zustand + React Query 搭配合理，乐观更新 |
| i18n | 9 种语言覆盖 |
| 开发体验 | Setup Wizard 零配置启动、auto-migration |

---

## 当前工作区状态与发布源要求

审查时观测到的状态：

- **分支：** `main`，ahead of origin 41 commits
- **工作区：** dirty（多个 modified、deleted、untracked 文件）
- **Untracked 待决定：** `deploy/`、新 docs、favicon/manifest 资源、`verify-reader-improvements.png`
- **Deleted (tracked)：** `server/cmd/xreader/static/.gitkeep`、`xReader.html`

**发布要求：**

1. **只从干净 commit/tag 发布**，不得从 raw workspace archive 或 `git archive` 未审查的快照发布；
2. 决定 `deploy/`、新 docs、favicon 资源是否纳入首次发布 commit；
3. 确认 `.env` 不在 Docker build context 中（或已添加 `.dockerignore`）；
4. 调试截图（`verify-reader-improvements.png`）不应进入公开仓库。

---

## 统计摘要

| 指标 | 数值 |
|------|------|
| P0 阻塞项（CI/test 红灯 + 发布产物不可用） | 3 |
| P1 安全/正确性/必要 bug | 9 |
| P2 质量/体验 | 39 |
| P3 打磨 | 9 |
| 合计 | 60 |
| 优秀实践 | 15 |
| Go 直接依赖 | 11（全部 MIT/BSD） |
| JS 生产依赖 | 9（全部 MIT/ISC/Apache） |
| 前端测试 | 122 个（8 失败） |
| 后端测试 | 1 个失败（AI 调用次数断言） |

---

## 建议执行顺序

### Phase 1 — 使发布技术上可行（CI 绿灯 + 发布产物可用）

```
[ ] 修复后端失败测试（确认 eager AI 合并调用是否为预期行为）
[ ] 修复 8 个前端失败测试
[ ] 移除 .gitignore 中的 .github 条目
[ ] 验证根 Dockerfile 镜像构建正确；删除/修复旧 web/Dockerfile
[ ] 添加 CI 镜像构建验证
```

### Phase 2 — 关闭安全缺口 + 修复必要 bug

```
[ ] 修复 Go module 路径 → github.com/razeencheng/xreader（105处 import）
[ ] 修复 Admin 删除端点 param 名称 bug
[ ] 提取共享 SafeHTTPClient，复用到 RSS discovery/fetch
[ ] 移除弱 secret 回退，缺失时拒绝启动
[ ] 添加文章状态写入的所有权检查 + Fever item mark
[ ] 确认 .env 未被提交/打包，必要时轮换凭证
[ ] 切换/新增 GitHub remote，清除 docs/CI 中内部 URL
[ ] 加固 Cookie（SameSite=Strict）+ 安全头（CSP 等）
[ ] SSE 翻译改为 POST 触发或强制 CSRF token
[ ] GitHub API 调用加超时
[ ] Fever handler 添加 rows.Err() 检查
```

### Phase 3 — 对齐产品与规范

```
[ ] 确定当前有效 spec，对齐路由/快捷键/手势/reader 导航
[ ] 修复 article stream 复合游标分页
[ ] 修复 highlight 翻译段落索引映射
[ ] SSE 翻译错误正确传播 + 状态持久化
[ ] 更新 ops 文档为 single-binary 架构
[ ] 修复 deploy compose 镜像名/环境变量名
[ ] 更新 goquery → v1.12.0
[ ] 评估 golang.org/x/net 升级（govulncheck 当前无报告）
[ ] 修复 Makefile macOS 兼容性（xargs -r）
```

### Phase 4 — 准备公开仓库

```
[ ] 添加 error.tsx / not-found.tsx 错误边界
[ ] 修复 TweaksPanel useEffect 依赖数组
[ ] 删除死代码（platform/jobs.go、死组件、废弃类型）
[ ] 消除跨包重复（stripHTML、maskAPIKey、normalizeEndpoint、fetch 逻辑）
[ ] 添加 CODE_OF_CONDUCT.md + SECURITY.md
[ ] 替换 web/README.md 模板
[ ] 清理 AI 开发日志
[ ] 替换测试中的私人 API 地址
[ ] 添加 metadataBase
[ ] Dockerfile 非 root 用户 + healthcheck
[ ] 添加截图到 README
[ ] 添加 THIRD-PARTY-LICENSES
[ ] Handler struct 字段改为 unexported
[ ] 添加 godoc 注释
```

---

## 附录：依赖许可证一览

### Go 直接依赖

| 包 | 版本 | 许可证 |
|---|---|---|
| gin-gonic/gin | v1.12.0 | MIT |
| golang-migrate/migrate/v4 | v4.19.1 | MIT |
| jackc/pgx/v5 | v5.9.2 | MIT |
| PuerkitoBio/goquery | v1.8.0 | BSD-3 |
| microcosm-cc/bluemonday | v1.0.27 | BSD-3 |
| mmcdole/gofeed | v1.3.0 | MIT |
| abadojack/whatlanggo | v1.0.1 | MIT |
| stretchr/testify | v1.11.1 | MIT |
| testcontainers/testcontainers-go | v0.42.0 | MIT |
| golang.org/x/net | v0.51.0 | BSD-3 |
| golang.org/x/oauth2 | v0.36.0 | BSD-3 |

### JS 生产依赖

| 包 | 版本 | 许可证 |
|---|---|---|
| next | 16.2.4 | MIT |
| react / react-dom | 19.2.4 | MIT |
| @tanstack/react-query | 5.99.1 | MIT |
| zustand | 5.0.12 | MIT |
| framer-motion | 12.38.0 | MIT |
| lucide-react | 1.8.0 | ISC |
| dompurify | 3.4.1 | MPL-2.0 OR Apache-2.0 |
| react-intersection-observer | 10.0.3 | MIT |

**直接依赖未发现明显许可证冲突；发布前应生成 `THIRD-PARTY-LICENSES` 并保留 transitive license 扫描证据。**

---

## 审查工具执行记录

| 命令 | 结果 |
|------|------|
| `go build ./...` | PASS |
| `go vet ./...` | PASS |
| `go test ./...` | FAIL (1 test) |
| `go test ./... -race -count=1` | FAIL (same) |
| `govulncheck ./...` | PASS (0 vulnerabilities) |
| `sqlc compile` | PASS |
| `pnpm build` | PASS (metadataBase warning) |
| `pnpm lint` | PASS (warnings only) |
| `pnpm vitest run` | FAIL (8 tests) |
| `pnpm audit --prod` | 1 moderate (postcss) |
| Playwright | 1 pass, 3 fail, 4 skip (missing auth state) |
