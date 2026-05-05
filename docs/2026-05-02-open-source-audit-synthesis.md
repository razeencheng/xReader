# xReader 开源前审查综合报告

日期：2026-05-02

输入报告：

- ClaudeCode 报告：`docs/open-source-audit-report.md`
- Codex 多 Agent 报告：`docs/2026-05-02-open-source-readiness-audit.md`

本报告目标：

- 复核 ClaudeCode 报告中的关键结论。
- 合并两份报告中确认成立的问题。
- 修正或降级未完全成立、语境变化或优先级偏高的结论。
- 给出开源发布前的执行顺序。

## 总体结论

当前不建议直接开源发布。

主要原因不是架构方向错误，而是当前仓库处于“发布前整理中”的状态：测试红灯、工作区未收敛、安全硬化存在明显缺口、公开部署文档与当前单二进制架构不一致，并且 Go module、`.gitignore`、deploy 示例、README/ops/AGENTS 等开源入口信息还没有统一。

开源前最低门槛：

1. CI 必须变绿：后端、前端单测都要通过。
2. 安全底线要补齐：RSS SSRF、弱 secret、状态归属校验、Cookie/CSRF/security headers。
3. 公开身份要统一：Go module、README clone URL、发布镜像、deploy env、GitHub repo 名一致。
4. 文档要匹配当前架构：以 `cmd/xreader` 单进程 + Postgres + 静态前端为准，删除旧 Redis/api/worker/web 分服务描述。
5. 发布内容要干净：不能把本地 `.env`、内部 audit 截图、原型文件、私有 remote/内部域名带进公开发布流程。

## 对 ClaudeCode 报告的复核结论

### 确认成立，应进入新报告

- 本地 `.env` 中存在真实密钥；虽然 `.env` 被 `.gitignore` 忽略且未被 Git 跟踪，但不能用工作区压缩包方式发布。
- `SESSION_SECRET` 与 secret 加密有弱默认或硬编码 fallback。
- `server/go.mod` 仍是 `github.com/jin/xreader-web`，而 README 指向 `github.com/razeencheng/xreader`。
- Git remote 当前指向 `git.isw.app` 私有 Gitea；它不在 Git 跟踪内容中，但发布/迁移流程需要处理。
- `.gitignore` 忽略 `.github`，会隐藏未来新增 workflow 或模板。
- Admin allowlist 删除接口路由参数不匹配。
- `Makefile` 使用 `xargs -r`，macOS/BSD xargs 不兼容。
- 测试中存在私人 API 域名 `newapi.razeen.cn`。
- Setup wizard 缺少失败尝试速率限制。
- GitHub API 调用使用 `http.DefaultClient`，没有专用 timeout。
- Fever handler 多处手写 `rows.Next()` 后未检查 `rows.Err()`。
- `server/internal/ai/config.go`、`parseBatchTranslation()`、`sessionTTL`、`BodyRetryHandler.pool` 等旧接口/字段存在死代码或兼容残留。
- `web/README.md` 仍是 create-next-app 模板。
- `CODE_OF_CONDUCT.md`、`SECURITY.md` 缺失。
- migration `006_source_category.up.sql` 缺少对应 down 文件。
- 根 `Dockerfile` 运行阶段以 root 用户运行，compose 缺 healthcheck。

### 需要修正或降级的结论

- ClaudeCode 报告的总体评价“整体质量良好，可以通过少量整理达到开源标准”偏乐观。当前测试红灯和安全问题足以阻塞发布。
- “Docker 发布路径 P0 断裂”需要修正：当前 release workflow 使用根目录 `Dockerfile`，它复制的是 `web/out`，与静态导出方向一致。真正过期的是 `web/Dockerfile`，它仍按 `.next/standalone` 打包。除非仍计划单独发布前端镜像，否则应降级为 P2 清理项。
- “缺少 `'use client'` 指令”不应作为确认阻塞项。相关组件使用 hook，但目前主要处在 client component 导入图里；只有被 server component 直接导入时才会触发 Next 边界问题。建议作为代码边界清晰度检查，而不是发布阻塞。
- “Git remote 指向私有 Gitea 泄露内部基础设施”不是 Git tracked 内容风险，但会影响发布操作。把它放到发布 checklist，而不是代码缺陷。
- “轮换所有密钥”应更精确：如果这些密钥只存在本地且从未被提交、打包或共享，开源前删除本地 `.env` 并确保只发布 Git tracked 内容即可；若曾经外泄或会从工作区打包发布，则必须轮换。
- “许可证 100% 兼容 AGPL”未在本次复核中完整重跑许可证扫描。现有依赖没有发现明显冲突，但仍建议发布前生成第三方许可证清单。

## P0：发布阻塞项

### 1. CI 当前会失败

后端失败：

- `go test ./...` 失败。
- `go test ./... -race -count=1` 失败。
- 失败点：`server/internal/source/service_test.go:236`
- 原因：测试仍期望 eager AI title/summary 两次调用，但实现已经合并为一次调用。

前端失败：

- `pnpm vitest run` 失败 8 个测试。
- 涉及文件：
  - `web/src/components/reader/TweaksPanel.test.tsx`
  - `web/src/components/feed/FeedList.test.tsx`
  - `web/src/components/sources/SourcesPage.test.tsx`
  - `web/src/components/settings/SettingsPage.test.tsx`

处理要求：

- 先判断失败是测试陈旧还是功能回归。
- 不要简单降低断言强度。
- 修复后重跑 backend normal/race tests 和 frontend vitest。

### 2. 当前工作区未收敛，不能作为发布源

审查时状态：

- `main...origin/main [ahead 41]`
- 工作区已有多处 modified/deleted/untracked 文件。
- `deploy/`、open-source launch docs、favicon/manifest 等仍未跟踪。
- `xReader.html`、`server/cmd/xreader/static/.gitkeep` 处于 deleted tracked 状态。

处理要求：

- 开源前必须明确哪些改动属于发布内容。
- 不要用 raw workspace archive 发布。
- 只从干净 Git commit/tag 生成公开内容和镜像。

## P1：开源前必须修复

### 1. RSS discovery/fetch 存在 SSRF 风险

位置：

- `server/internal/source/discovery.go:39`
- `server/internal/source/discovery.go:93`
- `server/internal/source/rss_adapter.go:22`
- `server/internal/source/rss_adapter.go:49`

问题：

- 添加订阅源属于用户可控 URL。
- discovery 和 RSS adapter 使用默认 HTTP/gofeed 抓取。
- 缺少 private/loopback/link-local/multicast 拦截、redirect 重校验、响应大小限制和 content-type 限制。

修复：

- 抽取 `original_fetcher` / `image_proxy_handler` 中已有的 safe dialer / safe URL 模式。
- 统一用于 source discovery、feed validate、worker fetch。
- 补 IPv4、IPv6、DNS rebinding、redirect、localhost、内网地址测试。

### 2. Secret 默认值不安全

位置：

- `server/cmd/xreader/main.go:38`
- `server/internal/crypto/secrets.go:25`
- `docker-compose.yml:8`

问题：

- `SESSION_SECRET` 缺失时回退到公开固定值。
- AI/GitHub secret 加密路径也有公开 fallback。
- 开源用户容易直接部署出可伪造 session/OAuth state 的实例。

修复：

- 非测试模式下缺少强 secret 直接启动失败。
- 禁止 `change-me`、`change-me-to-a-random-string` 等占位值。
- compose 改为 `${SESSION_SECRET:?set SESSION_SECRET}`。
- README/deploy 文档提供生成命令。

### 3. 文章状态写入缺少归属校验

位置：

- `server/internal/article/service.go:193`
- `server/internal/article/service.go:216`
- `server/db/queries/states.sql:1`
- `server/internal/fever/handler.go:372`

问题：

- 单篇 read/star/progress upsert 只依赖 `article_id`。
- Fever item mark 也存在类似路径。
- 已登录用户可能对猜到的其他用户 article id 写入状态。

修复：

- SQL 改成 `INSERT ... SELECT ... JOIN articles ... JOIN sources WHERE sources.user_id = $user_id`。
- 未命中用户拥有的 article 时返回 404。
- 添加跨用户负测。

### 4. Admin allowlist 删除接口失效

位置：

- `server/internal/platform/router.go:146`
- `server/internal/admin/allowlist_handler.go:56`

问题：

- router 注册 `:username`。
- handler 读取 `github_username`。
- 删除请求会传空用户名。

修复：

- 统一参数名。
- 增加 handler/router 测试。

### 5. Go module 与公开仓库身份不一致

位置：

- `server/go.mod:1`
- 多处 `github.com/jin/xreader-web/...` import
- README clone URL 使用 `github.com/razeencheng/xreader`

问题：

- 作为开源 Go 项目，module path 与公开仓库路径不一致会影响外部贡献、引用和文档可信度。

修复：

- 若公开仓库确定为 `github.com/razeencheng/xreader`，统一修改 module path 和 imports。
- 重跑 `go test ./...`、`go mod tidy`。

### 6. 开源部署文档仍是旧架构

位置：

- `ops/deploy.md`
- `ops/restore.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/superpowers/specs/2026-04-18-xreader-web-v1-design.md`

问题：

- 文档仍提 Redis、`cmd/api`、`cmd/worker`、`config/ai.yaml`、`XREADER_AI_CONFIG`、`server/api/openapi.yaml`、`docker-compose.prod.yml`。
- 当前方向是单 Go binary + Postgres + 静态前端 + DB/setup wizard 配置。

修复：

- 以 2026-04-30 open-source launch spec 为当前公开文档基准。
- 旧 v1 spec 标记为 legacy 或移入历史文档。
- ops 文档改为当前 `Dockerfile` / GHCR / `deploy/docker-compose.yml` / setup wizard 流程。

### 7. deploy 示例与代码/CI 不一致

位置：

- `deploy/docker-compose.yml:3`
- `deploy/docker-compose.yml:12`
- `deploy/.env.example:10`
- `.github/workflows/release.yml:41`
- `server/internal/platform/router.go:47`

问题：

- deploy 示例使用 Docker Hub 风格镜像名。
- release workflow 推送 GHCR。
- deploy 使用 `GITHUB_OAUTH_CALLBACK`，代码读取 `GITHUB_CALLBACK_URL`。

修复：

- 统一镜像为 `ghcr.io/<owner>/<repo>:<tag>`。
- env 名统一为 `GITHUB_CALLBACK_URL`。
- 决定 `deploy/` 是否进入发布提交。

### 8. 本地/内部信息需要清理

位置：

- `.env`
- Git remote
- `web/src/components/settings/SettingsPage.test.tsx`
- `docs/Codex/devlog/`
- `docs/claude/devlog/`
- tracked `audit/*.png`

问题：

- `.env` 有真实密钥，虽然未跟踪。
- remote 指向私有 Gitea。
- 测试和开发日志中出现私人 API 域名。
- 内部审计截图和 AI devlog 不一定适合公开。

修复：

- 开源发布从干净 Git tag 生成，不打包工作区。
- 删除本地 `.env` 或确保不会被复制进镜像上下文之外的发布物。
- 私有域名改为 `api.example.com`。
- internal devlog/audit 截图移出公开 repo，或明确选择保留。

## P2：发布前强烈建议修复

### 1. Cookie、CSRF、安全响应头

位置：

- `server/internal/auth/handler.go`
- `server/internal/middleware/csrf.go`
- `server/internal/article/sse_handler.go`
- `server/internal/platform/router.go`
- `server/internal/platform/static.go`

建议：

- session cookie 显式 `SameSite=Strict`。
- 生产默认 Secure，或正确处理反代 `X-Forwarded-Proto`。
- GET endpoint 保持只读；body translation SSE 若会写库/耗 AI，应先用 POST 创建任务并校验 CSRF。
- 添加 CSP、nosniff、Referrer-Policy、frame-ancestors/X-Frame-Options、Permissions-Policy、HSTS。

### 2. Setup wizard 与 GitHub API 硬化

位置：

- `server/internal/setup/handler.go:52`
- `server/internal/auth/github.go:63`

建议：

- setup complete 对失败 token 尝试加速率限制。
- GitHub API 使用带 timeout 的专用 client，不用 `http.DefaultClient`。

### 3. Fever handler rows.Err 与错误处理

位置：

- `server/internal/fever/handler.go`

建议：

- 所有手写 `rows.Next()` 循环后检查 `rows.Err()`。
- `Scan` 失败不要静默 `continue`，至少记录或返回错误。

### 4. Backend 边界 bug

位置：

- `server/internal/highlight/service.go:133`
- `server/db/queries/articles.sql:70`
- `server/internal/article/sse_handler.go:221`

问题：

- 翻译高亮用 paragraph index 当 slice offset，稀疏 lazy cache 会失败。
- feed stream cursor 只用 `published_at`，同 timestamp 文章可能分页漏掉。
- SSE 翻译失败后可能仍发送 done，状态停在 processing。

建议：

- 翻译段落按 `TranslatedParagraph.Index` 建 map。
- cursor 改为 `(published_at, id)`。
- 翻译失败发送 error event，并持久化 failed 状态。

### 5. Frontend spec drift 与可访问性

位置：

- `web/src/app/(app)/page.tsx`
- `web/src/components/reader/ArticleView.tsx`
- `web/src/hooks/useReaderShortcuts.ts`
- `web/src/hooks/useReaderGestures.ts`
- `web/src/components/feed/FeedRowComfortable.tsx`
- `web/src/components/feed/FeedRowCompact.tsx`

问题：

- reader route 当前是 `/?article=`，部分 spec/E2E 期待 `/read/:id`。
- prev/next reader chrome 已有组件但未接入。
- 快捷键与规格不一致。
- 移动 swipe 是否保留与新 spec 不一致。
- feed row `role="button"` 容器内嵌按钮，a11y 语义不理想。

建议：

- 先确认当前产品规格，以 2026-04-30 open-source launch spec 为准。
- 再统一 route、快捷键、reader navigation、E2E。
- feed row 打开动作和 read/star 按钮拆成同级交互元素。

### 6. Docker 与 compose 打磨

位置：

- `Dockerfile`
- `web/Dockerfile`
- `docker-compose.yml`

结论：

- 根 `Dockerfile` 与静态导出方向一致，release workflow 使用它。
- `web/Dockerfile` 是旧 standalone Next 路径，应删除或标记废弃。
- 根 `Dockerfile` runtime 仍以 root 运行。
- compose 缺 healthcheck。
- 当前 `docker-compose.yml` 暴露 Postgres host port，开源默认应谨慎处理。

建议：

- 删除旧 `web/Dockerfile`，除非仍需要单独前端镜像。
- runtime 增加 non-root user。
- 添加 `/health` healthcheck。
- 对 Postgres host port 做 dev-only 说明，或默认只暴露给 compose 网络。

## P3：开源整洁度与维护性

### 文档与治理

- 添加 `SECURITY.md`。
- 添加 `CODE_OF_CONDUCT.md`，或在 `CONTRIBUTING.md` 明确暂不采用。
- README 增加发布级截图和真实部署路径。
- `web/README.md` 替换 create-next-app 模板。
- `server/api/openapi.yaml` 被文档引用但不存在：生成或删除引用。

### 代码清理

- 删除或重命名旧 AI config API：`server/internal/ai/config.go` 中 `Config` / `ProviderConfig` 目前只保留废弃报错。
- 删除 `parseBatchTranslation()` 兼容 wrapper，或标注保留原因。
- 删除未使用的 `sessionTTL`。
- 删除 `BodyRetryHandler.pool` 字段。
- 检查 `FeedTabs`、`DensityToggle`、`PrevNextBar` 是否应接入或删除。
- 提取重复工具函数：`stripHTML`、`maskAPIKey`、`normalizeEndpoint`、fetch 逻辑。

### 依赖与元信息

- `pnpm audit --prod` 有 1 个 moderate `postcss <8.5.10` advisory。
- `pnpm build` 提示缺少 `metadataBase`。
- `goquery v1.8.0`、`whatlanggo v1.0.1` 偏旧，建议评估升级或替换。
- `@types/dompurify` 已废弃，可移除。
- 发布前生成第三方依赖许可证清单。

## 已验证命令与结果

通过：

- `go vet ./...`
- `go build ./...`
- `sqlc compile -f db/sqlc.yaml`
- `pnpm lint`，但有 unused warnings
- `pnpm build`，但有 `metadataBase` warning
- `govulncheck ./...`，未发现 Go 漏洞

失败：

- `go test ./...`
- `go test ./... -race -count=1`
- `pnpm vitest run`

供应链：

- `pnpm audit --prod` 报 1 个 moderate PostCSS advisory。

人工/静态复核：

- `git remote -v` 确认当前 remote 是私有 Gitea。
- `server/go.mod` 确认 module path 为 `github.com/jin/xreader-web`。
- `Makefile` 确认使用 `xargs -r`。
- `.gitignore` 确认忽略 `.github` 和 `audit/`。
- release workflow 确认使用根目录 `Dockerfile`。
- 根 `Dockerfile` 确认复制 `web/out`，不是 `.next/standalone`。
- `web/Dockerfile` 确认仍是旧 standalone Next 路径。

## 建议执行顺序

### Phase 1：让仓库可发布

- 修复后端测试。
- 修复前端测试。
- 清理/提交当前工作区，形成干净 release branch。
- 确认根 `Dockerfile` 可实际 build，并把 Docker image build 加入 CI。

### Phase 2：安全底线

- RSS safe fetcher。
- 强制强 `SESSION_SECRET`。
- 状态写入所有权校验。
- Admin allowlist delete 修复。
- Cookie/CSRF/security headers。
- setup rate limit 和 GitHub client timeout。

### Phase 3：公开身份与部署

- Go module path 改为公开 repo。
- 更新 import。
- 统一 GHCR image、deploy compose、env 名。
- 删除 `.github` ignore。
- 删除/修复旧 `web/Dockerfile`。
- 移除私有 remote 或在发布流程中切换到 GitHub remote。

### Phase 4：文档和仓库清洁

- 重写 ops docs、AGENTS、CLAUDE。
- 清理内部 devlog/audit 原型资产。
- 添加 `SECURITY.md`、code of conduct guidance。
- README 增加截图、部署路径、真实配置说明。
- 替换 `web/README.md` 模板。

### Phase 5：维护性打磨

- 清理死代码和重复工具函数。
- 修复 backend edge cases。
- 对前端 reader/spec drift 做产品决策并同步测试。
- 升级/评估老旧依赖。
- 生成第三方许可证清单。

## 最终发布建议

完成 Phase 1 和 Phase 2 前，不建议公开仓库或打 release tag。

完成 Phase 1-3 后，可以发布为 beta/open preview。

完成 Phase 4 后，才适合正式宣布开源。
