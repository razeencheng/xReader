# xReader Web UI/UX 审查报告

- **版本**: v1.0
- **日期**: 2026-04-30
- **审查人**: Claude (Opus 4.6) + Playwright 自动化浏览器测试
- **审查范围**: 全站 7 个页面 × 3 个视口尺寸

## 审查方法

| 方法 | 覆盖 |
|------|------|
| Playwright 浏览器截图 | 桌面 1440×900、平板 768×1024、手机 375×812 |
| 代码静态分析 | 所有 components/、app/、globals.css |
| 对照标准 | Apple HIG 44px 触摸目标、WCAG 2.5.5、50–75 字符行长 |

### 审查页面

1. 登录页 (`/login`)
2. Feed 列表 (`/`)
3. 文章阅读器 (`/?article=...`)
4. 源管理 (`/sources`)
5. 设置 (`/settings`)
6. 高亮笔记 (`/highlights`)
7. 管理后台 (`/admin`)

---

## 总结评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 整体设计质感 | 8.5/10 | 纸质温暖风格很有特色，配色和排版品味一流 |
| 桌面端体验 | 8/10 | 三栏布局清晰，sidebar + feed + reader 结构合理 |
| 平板端体验 | 7/10 | TopNav 略拥挤，阅读器体验良好 |
| 手机端体验 | 6.5/10 | 触摸目标偏小是主要短板，底部菜单设计不错 |
| 暗色模式 | 6/10 | 多处硬编码颜色，切换后会出现白色色块 |
| 无障碍 | 7/10 | ARIA 基本到位，focus trap 有，触摸目标是弱项 |

---

## 严重问题 (Critical)

### C1. Feed 列表内嵌按钮触摸目标严重不足

- **文件**: `web/src/components/feed/FeedRowComfortable.tsx:80-119`、`FeedRowCompact.tsx:62-85`
- **现状**: "标记已读"按钮高度约 22px，收藏星标按钮约 19px，远低于 44px 最小触摸目标
- **影响**: 移动端高频操作，极易误触打开文章
- **建议**: 按钮增加 padding 保证最小 44px 高度，或使用 `::before` 伪元素扩展点击热区

### C2. 高亮工具栏按钮触摸目标不足

- **文件**: `web/src/components/reader/HighlightToolbar.tsx:89-98` (32×32px)、`HighlightLayer.tsx:53-65` (约 28px)
- **现状**: 高亮/笔记按钮 `p-2` 实际约 32×32px；取消/保存按钮 `py-1.5` 高度约 28px
- **影响**: 高亮工具栏是移动端核心交互入口，选中文字后需精准点击，32px 目标在单手持机时很难命中
- **建议**: 图标按钮改为 `p-3` (44×44px)；文字按钮增加 `min-h-[44px]`

### C3. 管理后台 "Invalid Date" 显示 Bug

- **页面**: `/admin`
- **截图**: `audit/12-admin-mobile-375.png`、`audit/15-admin-desktop-1440.png`
- **现状**: 白名单用户的"添加时间"列显示 "Invalid Date"，桌面端和移动端都有此问题
- **影响**: 功能性 bug，影响管理员判断用户添加时间
- **建议**: 检查 admin 页面的日期格式化逻辑，确认 API 返回的 `created_at` 字段格式

---

## 重要问题 (Important)

### I1. TweaksPanel / 固定按钮未处理 iOS 安全区域

- **文件**: `web/src/components/reader/TweaksPanel.tsx:81` (`fixed bottom-5 right-5`)
- **现状**: `bottom-5` = 20px，iPhone 底部 home indicator 区域约 34px，按钮会被遮挡
- **同类问题**:
  - `KeyboardShortcutsModal.tsx:55` — `fixed bottom-4 left-4`
  - `PrevNextBar.tsx:90` — `fixed bottom-*`
  - SourcesPage toast — `bottom: 32px`
- **建议**: 统一改为 `bottom-[max(20px,env(safe-area-inset-bottom)+8px)]`

### I2. 全局缺少 safe-area-inset 处理

- **文件**: `web/src/app/layout.tsx:33` 设置了 `viewportFit: "cover"`（正确）
- **现状**: 仅 `ResponsiveAppNav.tsx:236`（移动菜单底部抽屉）使用了 `env(safe-area-inset-bottom)`，其他所有 fixed 元素和页面底部均未适配
- **建议**: 在 `globals.css` 中为 body 添加 `padding-bottom: env(safe-area-inset-bottom)`，或逐个修复所有 `fixed bottom-*` 元素

### I3. Wide 布局在桌面端行长无限制

- **文件**: `web/src/components/reader/ArticleReader.tsx:317`
- **现状**: Wide 布局使用 `max-w-none`，在 1440px 宽度下英文行长可达 120+ 字符，远超 50–75 字符舒适范围
- **影响**: 严重影响长文阅读体验
- **建议**: Wide 布局添加 `max-w-[960px]` 内容宽度限制

### I4. PrevNextBar 在移动端完全隐藏，缺少替代导航

- **文件**: `web/src/components/reader/PrevNextBar.tsx:90` (`hidden md:block`)
- **现状**: <768px 时前后文章导航完全隐藏，移动用户只能依赖左右滑动手势
- **影响**: 手势缺乏视觉可发现性，新用户不知道可以滑动切换文章。`ReaderGestureHint` 仅在手势触发时才出现
- **建议**: 移动端显示简化版导航（仅前后箭头），或在阅读器底部添加持久的导航提示

### I5. ReadFilterSegmentedControl 触摸目标不足

- **文件**: `web/src/components/feed/ReadFilterSegmentedControl.tsx:35` (`min-h-8` = 32px)
- **现状**: 未读/全部/已读 分段按钮高度 32px，低于 44px 标准
- **影响**: 移动端 feed 列表最频繁使用的控件之一
- **建议**: 移动端增大到 `min-h-11` (44px)

### I6. 平板端 (768px) TopNav 按钮拥挤

- **截图**: `audit/05-feed-tablet-768.png`
- **文件**: `web/src/components/layout/ResponsiveAppNav.tsx:100-178`
- **现状**: 768px 宽度下，顶栏包含 logo + 4 个主导航 + 5 个工具按钮 = 10 个元素挤在一行
- **影响**: 窄平板端按钮间距极小，视觉拥挤
- **建议**: 768–900px 范围将部分工具按钮折叠到下拉菜单，或仅显示图标

### I7. Settings / Admin / Highlights 页面滚动截断风险

- **文件**:
  - `web/src/app/(app)/settings/page.tsx:65` (`min-h-screen`)
  - `web/src/app/(app)/admin/page.tsx:56`
  - `web/src/app/(app)/highlights/page.tsx:11`
- **现状**: 在 AppLayout 的 `h-screen overflow-hidden` 容器内使用 `min-h-screen`，可能导致内容溢出但无法滚动
- **建议**: 改为 `h-full overflow-y-auto` 确保在 AppLayout 内正确滚动

---

## 一般问题 (Minor)

### M1. 暗色模式多处颜色硬编码

| 文件 | 行号 | 硬编码值 | 建议 |
|------|------|----------|------|
| `KeyboardShortcutsModal.tsx` | 55 | `rgba(248,244,238,0.92)` | 用 `glass-effect` 类 |
| `KeyboardShortcutsModal.tsx` | 117 | `rgba(255,255,255,0.6)` | 用 `var(--bg-panel)` |
| `PrevNextBar.tsx` | 90 | `rgba(248,244,238,0.92)` | 用 `glass-effect` 类 |
| `PrevNextBar.tsx` | 47 | `rgba(255,255,255,0.86)` | 用 CSS 变量 |
| `NextUpCard.tsx` | 59 | 白色渐变 | 用 CSS 变量构建 |
| `SourceExcerptNotice.tsx` | 47 | `#b42318` | 用 `var(--text-error)` |

### M2. CSS 断点不一致

- **现状**: Tailwind 使用 `md:` (768px) / `lg:` (1024px)，Sources 页 CSS Module 使用 900px / 720px
- **影响**: 768–900px 范围内布局行为不一致（其他页面已进入平板模式，Sources 页仍为桌面模式）
- **建议**: 统一使用 Tailwind 断点体系

### M3. `hide-mobile` 类未定义

- **文件**: `web/src/components/reader/PrevNextBar.tsx:49,64`
- **现状**: 使用了 `hide-mobile` 类但 globals.css 中未定义
- **建议**: 改用 Tailwind 的 `hidden md:inline-flex`

### M4. FeedSkeleton 布局与实际 FeedList 不匹配

- **文件**: `web/src/components/feed/FeedSkeleton.tsx:5` (`max-w-5xl mx-auto`)
- **现状**: 骨架屏使用居中 1024px 容器，实际 FeedList 宽度为 300px，加载完成后视觉跳跃明显
- **建议**: 移除 `max-w-5xl mx-auto`，匹配列表容器宽度

### M5. 手机端右上角按钮与头像视觉冲突

- **截图**: `audit/06-feed-mobile-375.png`
- **现状**: 375px 宽度下，"今日"下拉按钮与用户头像距离极近，有视觉重叠感
- **建议**: 调整布局间距或在移动端缩小头像

### M6. OriginalArticleButton 触摸目标极小

- **文件**: `web/src/components/reader/OriginalArticleButton.tsx:23-27`
- **现状**: "阅读原文"内联文字按钮实际高度约 18px
- **建议**: 添加 `min-h-[44px] inline-flex items-center`

### M7. 阅读器加载骨架屏 padding 与实际内容不一致

- **文件**: `web/src/components/reader/ArticleReader.tsx:273` (`px-8`)
- **现状**: 骨架屏 `px-8` (32px) vs 实际文章 `px-7` (28px)，加载完成后有视觉跳跃
- **建议**: 统一为 `px-7`

### M8. LanguageModal 在移动端布局可能不够宽

- **文件**: `web/src/components/layout/LanguageModal.tsx:49` (`py-[9px]`, 约 36px 高)
- **现状**: 9 个语言选项以 2 列排列，375px 下每个按钮宽约 120px，中文+英文标签可能不够
- **建议**: 移动端改为单列 `grid-cols-1`

### M9. Sidebar 按钮触摸目标偏小

- **文件**: `web/src/components/layout/Sidebar.tsx:59-112` (`h-9 w-9` = 36×36px)
- **现状**: 虽然 Sidebar 仅在 `lg:` (1024px+) 显示，但在触控屏笔记本上 36px 仍偏小
- **建议**: 增大到 `h-10 w-10` (40px) 或用伪元素扩展点击区域

### M10. DensityToggle / FeedTabs 按钮触摸目标

- **文件**: `DensityToggle.tsx:27`、`FeedTabs.tsx:39` (`py-1.5`, 约 30px)
- **建议**: 移动端增大最小高度

---

## 优先修复建议

| 优先级 | 编号 | 工作量 | 说明 |
|--------|------|--------|------|
| P0 立即修复 | C3 | 小 | Invalid Date bug，最简单也最影响专业感 |
| P1 高优先 | C1, C2 | 中 | 触摸目标，移动端核心体验 |
| P1 高优先 | I1, I2 | 中 | safe-area 适配，iPhone 用户必遇问题 |
| P2 中优先 | M1 | 小 | 暗色模式 6 处硬编码颜色，统一修复即可 |
| P2 中优先 | I3 | 小 | wide 布局行长限制，一行 CSS |
| P2 中优先 | M3 | 小 | `hide-mobile` 类缺失 |
| P3 后续优化 | I4-I7, M2-M10 | 各项小–中 | 按开发节奏逐步修复 |

---

## 截图索引

| 文件名 | 视口 | 页面 |
|--------|------|------|
| `01-feed-desktop-1440.png` | 1440×900 | Feed (未读 0) |
| `02-feed-all-desktop.png` | 1440×900 | Feed (全部 2) |
| `03-reader-desktop.png` | 1440×900 | 文章阅读器 |
| `04-reader-tablet-768.png` | 768×1024 | 文章阅读器 |
| `05-feed-tablet-768.png` | 768×1024 | Feed 列表 |
| `06-feed-mobile-375.png` | 375×812 | Feed 列表 |
| `07-reader-mobile-375.png` | 375×812 | 文章阅读器 |
| `08-mobile-menu-375.png` | 375×812 | 移动端底部菜单 |
| `09-settings-mobile-375.png` | 375×812 | 设置页 |
| `10-sources-mobile-375.png` | 375×812 | 源管理 |
| `11-highlights-mobile-375.png` | 375×812 | 高亮笔记 |
| `12-admin-mobile-375.png` | 375×812 | 管理后台 |
| `13-sources-desktop-1440.png` | 1440×900 | 源管理 |
| `14-settings-desktop-1440.png` | 1440×900 | 设置页 |
| `15-admin-desktop-1440.png` | 1440×900 | 管理后台 |
| `16-login-desktop-1440.png` | 1440×900 | 登录页 |
| `17-login-mobile-375.png` | 375×812 | 登录页 |
| `18-tweaks-mobile-375.png` | 375×812 | 阅读设置面板 |
| `19-source-browser-desktop.png` | 1440×900 | 源浏览器侧栏 |
