# xReader Web — v1 Design Spec

- **Status**: Design complete, ready for implementation planning
- **Date**: 2026-04-18
- **Author / Stakeholder**: razeen.cheng@outlook.com (sole product owner)
- **Project directory**: `/Users/jin/Wspace/homelab/xreader-web/`
- **Predecessor**: `/Users/jin/Wspace/homelab/xreader/` (a ~98%-complete RSS reader; treated as legacy — **do not reuse its frontend code**; selectively reuse backend patterns where useful)
- **Mockups (committed, authoritative)**: `docs/superpowers/specs/mockups/` — open each `.html` in a browser to see the exact target design

---

## 1. Background & goal

xReader's existing web product is a traditional RSS reader. The owner evaluated it and concluded the reading experience was not good enough. **xReader Web v1 is a full rewrite with design and experience as the top priority**, extending the product into a broader information-aggregation platform.

The owner's stated daily workflow:

> Open the site → see the latest information summarized → skim quickly → dive into pieces that interest me → auto-translated when the source is in a language I'm not strong in (original paragraph + translation paragraph) → long articles auto-summarized to key points → save and highlight good content → reader-friendly typography throughout.

v1 ships **this experience** powered by RSS sources and an AI pipeline. Non-RSS sources (X, V2EX, custom APIs) and the predecessor's community-submission / Obsidian-sync features are explicit non-goals for v1 and deferred to later phases.

## 2. Success criteria

v1 is considered done when the owner and their small group of invited users can, from a Mac laptop or mobile browser, do the following end-to-end without friction:

1. Log in via GitHub (must be on the allowlist).
2. Paste a domain, website URL, RSS/Atom URL, or import an OPML file → the app discovers the subscribable feed when possible and the new source appears within seconds.
3. Open the home page → see today's items in a flat feed with titles translated into the user's native language and AI-summarized key points (要点) shown inline.
4. Switch between **舒适** (Comfortable) and **紧凑** (Compact) feed density with a toggle or `C` keyboard shortcut.
5. Click an item → reader view renders with clean typography, 要点 at the top, alternating-paragraph translation for non-native content.
6. Highlight text, save the item, navigate to the next article via the sticky bottom bar, the end-of-article "next up" card, or `J` / `→`.
7. AI translation and summarization use an **OpenAI-compatible API** configured via file (base URL + API key + model name). Works with relay stations, OpenRouter, DeepSeek, Moonshot, one-api, etc.

**Explicitly not measured in v1**: DAU/WAU, growth funnels, retention, moderation throughput — this is a private tool for a known small group.

## 3. Scope boundaries

### 3.1 In scope (v1)

- GitHub OAuth with allowlist-based access control
- RSS / Atom source adapter (only adapter type in v1)
- Manual source add by URL + OPML import/export
- Backend RSS fetch worker (cron)
- AI pipeline: title translation, 要点 summary, lazy body translation (hybrid approach)
- Native-language detection per source; user's native language stored as a profile setting
- Home feed page — tabs: 今日 / 全部 / 收藏; density toggle 舒适 / 紧凑
- Reader page — alternating-paragraph bilingual rendering, 要点 callout, sticky prev/next navigation, end-of-article "next up" card
- Highlights (local DB only, render on both original and translation paragraphs)
- Notes attached to highlights
- Read / starred / reading-progress state
- Keyboard shortcuts (desktop)
- Responsive layout — desktop-first, tablet, mobile (tap navigation only)
- Multi-tab sync within the same browser (BroadcastChannel)
- Docker Compose deployment for homelab

### 3.2 Out of scope (deferred to later phases)

Documenting the boundary so future specs can slot in without rework:

| Deferred | Phase target | Notes |
|---|---|---|
| X / Twitter adapter | Phase 2 | Confirmed expensive / fragile; not essential for v1 validation |
| V2EX / HackerNews / Reddit custom adapters | Phase 2 | HN has an RSS bridge already — covers a lot via RSS adapter |
| Public community repository + user submission / admin review | Phase 3 | Private small-group tool doesn't need it |
| Obsidian highlight sync | Dropped | Previously aspirational; owner confirmed not used in daily workflow |
| SSE real-time cross-device sync | Phase 2 | v1 uses polling + BroadcastChannel — sufficient for small group |
| Mobile swipe-gesture navigation for prev/next | Dropped | Conflicts with text selection for highlighting |
| Card-deck / TikTok-style one-per-screen reader | Rejected | Owner evaluated and preferred flat feed |
| AI cost metering, per-user quotas, rate limits | Phase 3 | Trust-based for small group in v1 |
| RSS feed health scoring & auto-downgrade | Phase 2 | Nice-to-have, not launch-blocking |

### 3.3 Mobile / responsive

- Comfortable mode on mobile: same vertical list, card padding shrinks, tap target `>= 44px`.
- Compact mode on mobile: titles single-line with ellipsis, badge + time below.
- Reader on mobile: stacked paragraphs (already works — it's already paragraph-alternating, not columnar).
- Mobile does **not** get swipe-gesture navigation between articles; all prev/next is via tap on the sticky bottom bar or the end-of-article card.

## 4. Users & personas

- **Owner (primary user)**: power reader, expects keyboard shortcuts, wants information density and quick triage. Native language: 中文 (Simplified).
- **Invited friends (small group)**: similar personas; each has their own native language setting and their own subscriptions. Data is isolated per user.
- **Role model**:
  - `user` — standard account, subscribes to and reads sources
  - `admin` — the owner, can edit the allowlist (GitHub usernames that can sign in) and view server health

No separate guest / public role in v1.

## 5. Product surface (visual reference)

The authoritative mockups are committed at `docs/superpowers/specs/mockups/` — open each `.html` in a browser for the pixel-accurate target. **Implementers: do not redesign; match these.**

| Mockup | File |
|---|---|
| Feed comfortable mode (tabs, 要点 inline, translated title above original) | `docs/superpowers/specs/mockups/01-feed-comfortable.html` — section ① |
| Feed compact mode (`[title] [badge] … [time]`, titles left-aligned) | `docs/superpowers/specs/mockups/02-feed-compact.html` |
| Reader view (alternating bilingual paragraphs, 要点 callout, prev/next bar, next-up card) | `docs/superpowers/specs/mockups/03-reader.html` |

### 5.1 Feed page behavior

Top bar (left → right):

- Tabs: **今日** (Today) · **全部** (Stream) · **收藏** (Starred)
- Density toggle: **舒适** / **紧凑** (remembered per user)
- Native language chip (click to open settings)

Row rendering — comfortable:

```
[source badge]  [source name · time · lang→lang]       [read time · ⭐]
<big title in native language>
<muted italic: original title — only when translated>
要点  <AI-summarized sentence or 3 terse bullets>
```

Row rendering — compact (single line):

```
<title>  [badge]  ....................  <time · meta>
```

Native-language items:

- Get a 要点 summary (no title translation, since none needed).
- Original-title muted line is suppressed.

Short items (tweets, HN comments — via RSS bridges):

- Skip 要点 entirely; show the full text inline with translation if needed.
- Classifier: items with `content_text` length < 280 chars are "short" → no summary.

Source add UX:

- The add-source input accepts a bare domain (`example.com`), a website homepage, or a direct RSS/Atom URL.
- The server normalizes bare domains to HTTPS first, fetches the page, and discovers feeds from `<link rel="alternate" type="application/rss+xml|application/atom+xml">`.
- If no linked feed is found, try common paths such as `/feed`, `/rss`, `/atom.xml`, `/feed.xml`, and `/index.xml`.
- The UI must show progress below the input (for example: normalizing URL → checking homepage → testing discovered feeds → adding source). Failure must be explicit and actionable, not a silent disabled button.
- First successful fetch for a newly added source must avoid creating historical unread debt. Keep articles unread if they are within the last 7 days or among the latest 20 items; mark older backlog items read automatically. The articles remain searchable and readable, but they do not pollute the user's unread queue.
- After adding a source, the UI should explain this rule in plain language: "首次抓取会默认只保留最近 7 天或最新 20 篇为未读，其余历史文章会自动归档为已读。"

Read / unread semantics:

- **Unread** means the article is still in the user's triage queue. **Read** means the user has intentionally processed it enough that it can leave the queue.
- Opening an article does **not** immediately mark it read. This avoids punishing accidental opens and lets users peek without losing queue state.
- Auto-mark as read when there is meaningful engagement: current v1 threshold is scroll progress `>= 75%`. Future tuning may add time-on-page plus partial scroll, but plain open is not enough.
- Quick mark-read is required on feed rows and via keyboard shortcut `E`. The action updates optimistically and syncs through the normal article state API.
- Bulk mark-read is required for high-volume triage, but it should only appear when the user is actively triaging `Unread`. Place a compact `全部已读` button on the filter row where the bulk action affordance lives; hide it in `All`, `Read`, and `Starred`.
- Clicking `全部已读` opens a small confirmation popover with the primary message `标记当前列表中的所有为已读`. The user must click `确认` before the batch API runs; `取消` closes the popover without side effects.
- The batch scope follows the current logical list context and may include unread items that have not been paginated into the browser yet: Today uses `tab:today`, All/Stream uses `tab:stream` when viewed through Unread, and a selected source uses `source:<id>`.
- Bulk mark-read only affects items that are currently unread, and the API must return the affected article IDs. Undo must restore exactly those IDs, not every article in the broad scope, so previously read items never become unread by accident.
- Bulk actions should complete without a confirmation dialog, then show a toast/inline notice such as `已将当前视图 36 篇标为已读 · 撤销`. The undo window should last long enough to feel safe (5-8 seconds recommended for toast UIs; inline notices can remain until the next action).
- In `Unread`, a just-read item must not disappear instantly. It first becomes visually muted, shows `已读 · 撤销`, and leaves the list after a short grace period (v1: 3 seconds).
- `撤销` restores the item to unread, cancels the pending dismissal, and syncs the state back to the server.
- In `All` and source views, read items stay visible with weaker opacity. In `Starred`, read state never removes an item from the view.
- Counts reflect durable server/cache state, not the temporary grace-period visibility. Example: `Unread 9` can show a just-read row for a few seconds while the count already reflects 9.

Keyboard shortcuts:

- `J` / `↓` — next item
- `K` / `↑` — previous item
- `Enter` — open detail
- `E` — mark read (stay on feed)
- `S` — star / unstar
- `C` — toggle density
- `/` — focus search
- `g t` — go to Today · `g s` — go to Stream · `g f` — go to Starred

### 5.2 Reader page behavior

Layout:

```
┌─ Top bar ──────────────────────────────────────────────────────────┐
│ ← 返回 Feed        2 / 142 · 📰 source · lang → lang    ⭐ 🖍 📝 🔗 │
├─ Max-width 680px centered column ──────────────────────────────────┤
│ <translated title, 32px serif>                                     │
│ <original title, 13px italic muted — hidden for native-lang items> │
│ <author · time · read-time metadata>                               │
│                                                                    │
│ ┌ 要点 callout ──────────────────────────────────────────────────┐ │
│ │ ✨ icon dropped — simply: "要点" label + 3 bullets or 1 para  │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ ¶ original paragraph (muted grey #6a6252, Hiragino/serif of lang)  │
│ ¶ translation paragraph (full contrast #1f1f1f, Source Han Serif)  │
│ ¶ original                                                         │
│ ¶ translation                                                      │
│ ...                                                                │
│                                                                    │
│ — 文末 —                                                            │
│                                                                    │
│ ┌ "下一篇" card ─────────────────────────────────────────────────┐  │
│ │  →  NEXT UP · press J or click                                │  │
│ │     <next article title>                                      │  │
│ │     [next badge] time · lang→lang                             │  │
│ │     要点  <next article summary preview>                       │  │
│ └───────────────────────────────────────────────────────────────┘  │
├─ Sticky bottom nav bar (stays visible while scrolling) ────────────┤
│ ← K  上一篇                     2 / 142                下一篇  J → │
│     <prev title truncated>                     <next title truncated> │
├─ Keyboard hint strip ──────────────────────────────────────────────┤
│ J/→ 下一篇  K/← 上一篇  S 收藏  H 高亮  E 标记已读  Esc 返回       │
└────────────────────────────────────────────────────────────────────┘
```

Interaction rules:

- Navigating to next via J/→/next-up-card/bottom-bar **auto-marks the current item as read** (background call; UI advances immediately).
- Scrolling past the read threshold in the reader marks the current item read, but the feed keeps the item visible briefly in `Unread` using the same `已读 · 撤销` grace-period pattern.
- Prev / next traverse the **filter context the user entered from**. If user clicked into article from Today tab with "AI track" filter, prev/next stays within that filtered sequence. Store this in the URL query (e.g. `?ctx=today&filter=ai`).
- Highlights: select text → floating toolbar (「高亮」「高亮 + 笔记」) → background-colored mark renders inline and persists. On reopen, highlights re-render at same offsets.
- Highlights anchor to **paragraph index + character offsets** in the post-sanitization plain text; they render on whichever layer(s) the user highlighted (typically both, mirrored).
- End-of-article "next up" card is shown unconditionally — even for short articles where it would appear above the fold.
- Reader opens at a new route `/read/:article_id` so back button returns to the feed with scroll position preserved.
- A fixed reading settings panel in the article detail view is the single entry point for reader preferences: layout (`classic`, `focus`, `wide`), density (`comfortable`, `compact`), font size, theme (`light`, `dark`, `system`), and accent color.
- The reading settings panel must be localized by `native_language`; do not hardcode English labels such as "Tweaks", "Layout", or "Density".

Original-article loading rules:

- Some RSS sources only expose an excerpt or one paragraph. When the article appears likely summary-only, show an inline `加载原文` action in the reader instead of forcing users to open a new tab.
- `加载原文` fetches the article's canonical link through the backend, extracts the main content, sanitizes it, and returns reader-safe HTML.
- A successful original load is persisted to `articles.content_html` and `articles.content_text`; reopening the article must not require another manual load.
- The fetched page's site presentation is discarded. Strip source `class`, `style`, `id`, script, tracking, and unsafe embeds so the article inherits xReader typography and spacing.
- Semantic structure is preserved: headings, paragraphs, ordered/unordered lists, blockquotes, code/pre blocks, figures/images, tables, and `details/summary` (commonly used for TOC) remain visible with xReader's reader stylesheet.
- The reader should keep hierarchy without becoming a generic webview: source fonts and colors are not retained; xReader re-renders the document with consistent title, heading, paragraph, list, TOC, and code styles.

### 5.3 Settings page (minimal v1)

- The global Settings page is for account/system-level settings only. It should not duplicate reader preference controls.
- Native language also determines the application chrome language: navigation labels, buttons, tabs, dialogs, empty states, settings, source management, reader actions, and admin/highlight labels should all resolve through the UI i18n dictionary. Supported picker values use BCP-47 codes (`zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `ko-KR`, `es-ES`, `fr-FR`, `de-DE`, `pt-PT`), with legacy short codes normalized where possible.
- Native language remains available from the language chip/modal in the app chrome; density, theme, layout, font size, and accent live in the article detail reading settings panel.
- AI config view (read-only for regular users; admin can edit)
- Manage sources (list / add / rename / delete / import OPML / export OPML)
- Log out

## 6. Architecture

### 6.1 Topology

```
┌──────────────┐       ┌───────────────┐      ┌─────────────────┐
│  Next.js     │  HTTP │  Go API       │ SQL  │  PostgreSQL 16  │
│  (web, UI)   │──────▶│  (Gin)        │─────▶│                 │
└──────────────┘       └───────┬───────┘      └─────────────────┘
                               │                       ▲
                               │ pub/sub + cache       │
                               ▼                       │ SQL
                       ┌───────────────┐               │
                       │  Redis 7      │◀──────┐       │
                       └───────────────┘       │       │
                                               │       │
┌──────────────┐   fetch/parse     ┌───────────┴─────┐ │
│  RSS feeds   │◀──────────────────│  Go worker      │─┘
│  (Internet)  │                   │  - cron fetch   │
└──────────────┘                   │  - AI jobs      │
                                   └────────┬────────┘
                                            │ OpenAI-compat
                                            ▼
                                   ┌──────────────────┐
                                   │  AI relay/proxy  │
                                   │  (configurable)  │
                                   └──────────────────┘
```

Containers:

1. `web` — Next.js (public HTTPS)
2. `api` — Go API (internal)
3. `worker` — Go worker (internal): cron fetch + AI job consumer
4. `postgres` — Postgres 16
5. `redis` — Redis 7 (session store, job queue, BroadcastChannel coordination, pub/sub)

### 6.2 Source adapter interface

v1 has one adapter (`RSSAdapter`) but the interface must be ready for Phase 2 adapters without rework:

```go
type SourceAdapter interface {
    // Kind returns the adapter's identifier ("rss", "x", "v2ex", etc.)
    Kind() string

    // Fetch pulls the latest items for a given source config.
    // Returns raw items in adapter-specific shape; normalization is the caller's job.
    Fetch(ctx context.Context, src Source) ([]RawItem, error)

    // Validate checks that a given URL/config is fetchable and returns basic metadata
    // (title, icon, language hint) used to populate the source record.
    Validate(ctx context.Context, url string) (SourceMetadata, error)
}

type RawItem struct {
    ExternalID    string            // GUID / item link / hash
    Link          string
    Title         string
    ContentHTML   string            // sanitized HTML
    PublishedAt   time.Time
    LanguageHint  string            // from feed <language> or auto-detect
    SourceExtras  map[string]string // adapter-specific metadata
}
```

Adapter registry is a map `{Kind() -> SourceAdapter}` in the worker; API endpoints route by source kind. v1 registers only `rss`.

### 6.3 AI pipeline (hybrid)

Decision recap (approach #3): **eager on titles + 要点 summary** (every fetched item, cheap), **lazy on body translation** (only when the user opens the detail view).

#### 6.3.1 Eager stage (runs in worker right after fetch)

For every new article:

1. Detect article language (`langdetect` on `content_text[:500]` with a feed-language-hint fallback).
2. If the article language differs from any user's `native_language`, translate the title into **each distinct `native_language` value found in the `users` table**. Store one `article_ai` row per `(article_id, target_language)`.
   - Small-group v1: typically 1–2 distinct target languages, so the amortized cost is low.
   - If the user pool grows in Phase 2, gate this on actual readership (e.g. only translate lazily for languages with active readers in the last N days).
3. Generate a **要点** summary in the *same language as the translated title(s)* — i.e. the summary is always shown in a reader's native language.
4. Short-item classifier: if `len(content_text) < 280 chars`, skip summary (set `summary = NULL`, skip_reason = "short").

Prompt template for summary (Chinese reader):

```
你是一位严谨的摘要编辑。将下面的文章提炼成中文 "要点"。
- 如果文章很短（小于 300 字），直接回答原文即可，不需要摘要。
- 如果文章超过 500 字，用 2-3 个分号分隔的要点。
- 如果超过 2000 字，用 3-5 个编号列表式的要点。
- 不要加"本文讲了"一类空话。要点必须是具体事实、结论或可操作信息。

文章标题：{title}
文章正文：{content_text}
```

The same prompt template is translated / parameterized per native language (the worker has a small `i18n/prompts.go` package).

Title translation prompt:

```
将下面的文章标题翻译为 {target_language}。保留专有名词、产品名、人名、代码术语的英文原文。只输出翻译结果，不要加引号、解释、或前缀。

原标题：{title}
```

#### 6.3.2 Lazy stage (runs on detail view)

When a user opens `/read/:article_id`, the server looks up `article_ai` for `(article_id, current_user.native_language)`:

1. If `body_translation_status = 'done'`, serve the cached translation from DB.
2. If `none`, the API endpoint starts a body-translation job **scoped to the caller's native language** and returns an SSE stream. The job:
   - Splits `content_html` into paragraph-level units after sanitization
   - Translates each paragraph (typically 3–10 at a time via single API call)
   - Streams back paragraph-indexed translations as SSE events: `{"paragraph": 0, "translation": "..."}`
3. UI renders: original paragraph appears first (full content); translation appears under it as each streams in. Progress indicator until the last paragraph resolves.
4. On completion, persist full translation to `article_ai.body_translation_content`; next open is instant.
5. If `processing` and another user opens the same article, second user tails the same pub/sub channel.

Concurrency:

- Worker AI job queue in Redis (list: `ai:eager:queue`, `ai:lazy:queue:{article_id}`).
- Worker pool size = config value (default `4` concurrent API calls).
- Per-article lock prevents duplicate lazy jobs.

#### 6.3.3 AI provider abstraction

**All AI calls go through an OpenAI-compatible client**: `POST /v1/chat/completions` shape. The entire integration is config-driven so the owner can point it at a relay station, OpenRouter, DeepSeek, Moonshot, or a local `one-api` instance by changing the config file alone.

Configuration file (loaded at startup, path from `XREADER_AI_CONFIG` env var, default `./config/ai.yaml`):

```yaml
provider:
  base_url: "https://relay.example.com/v1"   # OpenAI-compatible endpoint
  api_key_env: "XREADER_AI_API_KEY"          # which env var holds the key
  timeout_seconds: 60
  max_retries: 2

models:
  # Single model for everything in v1; split by job if you want later.
  summary: "deepseek-chat"
  title_translation: "deepseek-chat"
  body_translation: "deepseek-chat"

limits:
  max_tokens_summary: 400
  max_tokens_title: 60
  max_tokens_body_paragraph: 600
  temperature: 0.2

concurrency:
  eager_workers: 4
  lazy_workers: 6
  batch_paragraphs_per_call: 8
```

Client interface (Go):

```go
type AIClient interface {
    ChatCompletion(ctx context.Context, req ChatRequest) (ChatResponse, error)
}

type ChatRequest struct {
    Model    string
    Messages []ChatMessage      // role: system|user|assistant
    MaxTokens int
    Temperature float64
}
```

One implementation: `openai.Client` wrapping `net/http`. If the user swaps relays, only the config changes.

#### 6.3.4 Failure modes

| Failure | Behavior |
|---|---|
| AI provider 429 / 5xx | Retry with exponential backoff up to `max_retries`. If still failing, mark job as `failed` with error string; UI shows "翻译暂不可用，请稍后重试" and an explicit retry button. |
| Article text unsafe / too long | Truncate to 16k chars for summary; split aggressively for body translation. |
| User's native language not a known translation target (unlikely for zh-CN/en-US) | Fall back to English; log warning. |
| AI returns empty / junk | Detect (heuristic: length == 0, or >50% non-CJK for a zh target) — mark as `failed`, allow manual retry. |

### 6.4 Fetch worker (cron)

- Cron: every **15 minutes** (configurable) per source.
- Per-source backoff: on N consecutive failures, slow down to 1h, then 6h. Don't auto-disable in v1 (that's Phase 2 health scoring); just surface status on the source management page.
- Deduplication: within a source, `(feed_id, normalized_link)` is unique. Normalization strips `utm_*`, `ref=`, trailing slashes, lower-cases host.

### 6.5 Multi-tab sync (v1)

- Same browser: `BroadcastChannel('xreader')` — when tab A marks an item read or starred, tab B updates its React Query cache immediately.
- Cross-device: short-polling `/api/articles/changes?since=<timestamp>` every 30s. Cheap endpoint returning only IDs + new states.
- Phase 2 replaces cross-device polling with SSE.

### 6.6 Security

- OAuth state param for CSRF on the login callback.
- Non-OAuth write endpoints: SameSite=Strict session cookie + custom `X-Requested-With: xhr` header (React sets it by default in fetch wrapper).
- HTML sanitization of fetched RSS content using a whitelist library (e.g., `bluemonday` for Go). Strip `<script>`, on-event attrs, unsafe iframes.
- Original-page fetching is server-side only and must protect against SSRF: allow only `http` / `https`, reject localhost, loopback, private, multicast, and link-local targets, enforce timeout and response-size limits, and accept HTML content only.
- CSP: no inline scripts (Next.js can be configured with nonces), restrict connect-src to same origin + configured AI base URL if any direct calls needed (v1: no direct AI calls from the browser).
- Image proxy: `GET /api/image-proxy?url=<enc>` — only proxies `image/*` MIME, max 5 MB, 7-day CDN cache.
- `rel="noopener noreferrer"` on all outbound links.

## 7. Data model

### 7.1 Tables

```sql
users (
  id              bigserial PRIMARY KEY,
  github_id       bigint UNIQUE NOT NULL,
  github_username text UNIQUE NOT NULL,
  avatar_url      text,
  native_language text NOT NULL DEFAULT 'zh-CN',   -- BCP-47
  role            text NOT NULL DEFAULT 'user',    -- 'user' | 'admin'
  density_pref    text NOT NULL DEFAULT 'comfortable', -- 'comfortable' | 'compact'
  theme_pref      text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now()
);

auth_sessions (
  id           text PRIMARY KEY,      -- session id, also used as Redis key
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);

auth_allowlist (
  github_username text PRIMARY KEY,
  added_by_user_id bigint REFERENCES users(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  note            text
);

sources (
  id                bigserial PRIMARY KEY,
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              text NOT NULL DEFAULT 'rss',
  url               text NOT NULL,
  normalized_url    text NOT NULL,
  title             text NOT NULL,
  icon_url          text,
  language_hint     text,
  last_fetched_at   timestamptz,
  last_success_at   timestamptz,
  consecutive_fails int NOT NULL DEFAULT 0,
  health            text NOT NULL DEFAULT 'unknown', -- 'ok'|'warn'|'fail'|'unknown'
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (user_id, normalized_url)
);

articles (
  id                bigserial PRIMARY KEY,
  source_id         bigint NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id       text NOT NULL,               -- GUID or link hash
  link              text NOT NULL,
  normalized_link   text NOT NULL,
  title             text NOT NULL,               -- original
  language          text NOT NULL,               -- detected
  content_html      text NOT NULL,               -- sanitized
  content_text      text NOT NULL,               -- plain text extracted
  author            text,
  published_at      timestamptz NOT NULL,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, normalized_link)
);

-- AI-derived fields, separate table for clean invalidation & re-processing.
-- Index: article_ai(article_id, target_language)
article_ai (
  article_id                bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  target_language           text NOT NULL,         -- e.g. 'zh-CN'
  title_translated          text,
  summary                   text,                  -- 要点
  summary_status            text NOT NULL DEFAULT 'pending', -- pending|done|skipped|failed
  summary_skip_reason       text,                  -- 'short' | null
  body_translation_content  jsonb,                 -- [{paragraph: 0, text: "..."}, ...]
  body_translation_status   text NOT NULL DEFAULT 'none',    -- none|processing|done|failed
  body_translation_error    text,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, target_language)
);

article_states (
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id        bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  is_read           boolean NOT NULL DEFAULT false,
  is_starred        boolean NOT NULL DEFAULT false,
  reading_progress  jsonb,    -- {"scroll_percent": 0.72, "paragraph_index": 15, "updated_at": "..."}
  last_read_at      timestamptz,
  PRIMARY KEY (user_id, article_id)
);

highlights (
  id                bigserial PRIMARY KEY,
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id        bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  layer             text NOT NULL,    -- 'original' | 'translation'
  paragraph_index   int NOT NULL,
  text_start_offset int NOT NULL,
  text_end_offset   int NOT NULL,
  quoted_text       text NOT NULL,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_highlights_user_article ON highlights(user_id, article_id);

-- For cross-device polling
article_state_changes (
  user_id    bigint NOT NULL,
  article_id bigint NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id, changed_at)
);

-- Search (PostgreSQL FTS)
CREATE INDEX idx_articles_fts ON articles USING GIN (
  to_tsvector('simple', title || ' ' || coalesce(content_text, ''))
);
-- Optional: per-language indexes if user base diversifies
```

### 7.2 Relationships

```
users 1─┬─n auth_sessions
        ├─n sources
        ├─n article_states
        ├─n highlights
        └─n auth_allowlist (via admin add)

sources 1─n articles
articles 1─n article_ai (one per target_language)
articles 1─n article_states (one per user)
articles 1─n highlights (one per highlight)
```

### 7.3 Soft delete

- `sources.deleted_at` for undo within 5 seconds; a background job hard-deletes after 7 days.
- `articles` are **not** user-owned; they're immutable once fetched. Removing a source does not delete its articles (they remain for history / other users who may share the source URL in the future).

## 8. API contract

Base: `/api/`. All write endpoints require session cookie; admin endpoints also check role.

### 8.1 Auth

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/auth/github` | Start OAuth; redirects to GitHub |
| GET  | `/api/auth/callback/github` | OAuth callback; sets session cookie |
| POST | `/api/auth/logout` | Clear session |
| GET  | `/api/auth/me` | Return current user profile incl. native_language, role |

### 8.2 User profile / settings

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/api/users/me` | Update native_language / density_pref / theme_pref |
| GET | `/api/admin/allowlist` | (admin) list allowed GitHub usernames |
| POST | `/api/admin/allowlist` | (admin) add a username |
| DELETE | `/api/admin/allowlist/:github_username` | (admin) remove |

### 8.3 Sources

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sources` | List my sources |
| POST | `/api/sources` | Add (`{url: "https://..."}`) — accepts domain, homepage, or feed URL; server discovers/validates feed, fetches once, persists |
| PATCH | `/api/sources/:id` | Rename / recategorize |
| DELETE | `/api/sources/:id` | Soft-delete |
| POST | `/api/sources/import-opml` | Upload OPML; returns `job_id`; poll `/api/jobs/:job_id` for progress |
| GET | `/api/sources/export-opml` | Download OPML |
| POST | `/api/sources/:id/refresh` | Manual fetch now |

### 8.4 Articles

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/articles` | Paginated list. Query: `tab=today\|stream\|starred`, `source_id=`, `q=` (search), `cursor=` |
| GET | `/api/articles/:id` | Single article, includes `article_ai.summary` and `title_translated` for current user's `native_language`. |
| POST | `/api/articles/:id/original` | Fetch and persist original page content for summary-only RSS items; returns sanitized reader-safe content. |
| GET | `/api/articles/:id/body-translation` | **SSE**. If cached, single event with full translation then close. If pending, stream paragraphs as translated. |
| POST | `/api/articles/:id/body-translation/retry` | Re-run translation (e.g. after a failure) |
| PATCH | `/api/articles/:id/state` | Update `is_read` / `is_starred` |
| PUT | `/api/articles/:id/progress` | Save `reading_progress` |
| POST | `/api/articles/batch/state` | Batch set read state. Body: `{scope: "source:42" \| "tab:today" \| "tab:stream", is_read: true\|false}`. Response includes affected `article_ids` for exact undo. |
| GET | `/api/articles/changes?since=<iso>` | Polling endpoint for multi-device sync |

### 8.5 Highlights

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/articles/:id/highlights` | All highlights for this article by current user |
| GET | `/api/highlights` | All highlights for user (paginated; supports `?q=` search) |
| POST | `/api/highlights` | Create |
| PATCH | `/api/highlights/:id` | Update note |
| DELETE | `/api/highlights/:id` | Delete |

### 8.6 Jobs

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/jobs/:id` | Generic async job status (`pending`/`running`/`completed`/`failed`, progress %) |

### 8.7 Ops

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/ready` | Readiness incl. DB + Redis |

### 8.8 Common response conventions

- Pagination: `{items: [...], next_cursor: "..."}`
- Errors: `{code: "VALIDATION_ERROR", message: "...", request_id: "..."}`
- Codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `UPSTREAM_ERROR`
- Request ID: every response has `X-Request-Id`, logged structured

### 8.9 OpenAPI

Produce `server/api/openapi.yaml` (OpenAPI 3.1). CI validates the spec on every PR. Out-of-scope for v1: SDK generation, but leave the spec clean enough to generate later.

## 9. Visual / style system

Tokens (used in both feed and reader):

| Role | Value |
|---|---|
| Background (light) | `#fdfbf6` feed body / `#fbfaf7` feed page chrome |
| Background (dark) | `#0f0f10` feed body / `#17171a` page chrome — applied via `prefers-color-scheme` and a manual override in settings |
| Body text (light) | `#1f1f1f` |
| Body text (dark) | `#e8e8e8` |
| Muted text | `#8a8275` |
| Translated paragraph | full contrast `#1f1f1f` (Source Han Serif for CJK) |
| Original paragraph | muted grey `#6a6252` (language-specific serif: Hiragino Mincho ProN for JA, etc.) |
| 要点 callout | bg `#fff8e6`, border-left `#d4a24c`, label `#a07a20` (uppercase, tracked) |
| Highlight mark | `#fff1a8` |
| Source badge (RSS generic) | bg `#eee7d8`, text `#5b5444` |
| Source badge (X) | bg `#1d1d1d`, text `#fff` (Phase 2) |
| Source badge (forum-green) | bg `#a5d5a5`, text `#2a4a2a` |

Type scale:

| Role | Size / line-height | Family |
|---|---|---|
| Feed title | 22px / 1.3 | Iowan Old Style, Georgia, serif |
| Reader title | 32px / 1.25 | Same |
| Reader body | 16px / 1.8 | Language-aware serif |
| Metadata | 12–13px / 1.4 | system-ui |
| Compact row | 14px / 1.5 | system-ui |

Spacing: 4-px base grid. Max article column 680px. Min tap target 44px.

## 10. Tech stack

Reuses what's proven in the predecessor's backend; **does not reuse the predecessor's frontend**.

| Layer | Choice | Notes |
|---|---|---|
| Backend language | Go | |
| Web framework | Gin | |
| ORM / DB | sqlc + pgx/v5 | SQL files in `server/db/queries/`; generated code in `server/db/gen/` |
| Migrations | golang-migrate | `server/db/migrations/` |
| RSS parsing | `gofeed` | |
| HTML sanitization | `bluemonday` | |
| Session store | Redis | TTL 30d sliding |
| Job queue | Redis lists + simple pop-and-process pattern | Start with stdlib + Redis; swap to `asynq` only if retry/scheduling pain emerges |
| Frontend framework | Next.js 15 App Router | React 19 |
| Frontend styling | Tailwind CSS 4 | |
| State (client) | Zustand | User preferences, ephemeral UI |
| State (server cache) | TanStack React Query | |
| Testing (backend) | Go stdlib + testcontainers-go for Postgres + `httptest` | Real DB, no mocks |
| Testing (frontend) | Vitest + Testing Library + MSW + Playwright | |
| Type contract | OpenAPI 3.1 | `openapi-typescript` for TS types |
| Logging | `slog` (JSON, with request_id) | |

Monorepo layout:

```
xreader-web/
├── docker-compose.yml
├── docker-compose.prod.yml
├── Makefile
├── .env.example
├── config/
│   └── ai.example.yaml
├── server/
│   ├── cmd/api/main.go
│   ├── cmd/worker/main.go
│   ├── internal/
│   │   ├── auth/
│   │   ├── source/        # adapter interface + RSS impl
│   │   ├── article/
│   │   ├── ai/            # OpenAI-compatible client + pipeline jobs
│   │   ├── highlight/
│   │   ├── user/
│   │   ├── admin/
│   │   ├── sync/          # polling changes endpoint
│   │   ├── middleware/
│   │   ├── platform/      # router, health
│   │   └── testutil/
│   ├── api/openapi.yaml
│   └── db/
│       ├── migrations/
│       ├── queries/
│       └── gen/
└── web/
    ├── app/               # App Router
    │   ├── (auth)/login/page.tsx
    │   ├── (app)/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx                # feed (tabs + density)
    │   │   ├── read/[id]/page.tsx      # reader
    │   │   ├── highlights/page.tsx
    │   │   ├── sources/page.tsx
    │   │   ├── settings/page.tsx
    │   │   └── admin/page.tsx
    │   └── api/           # route handlers if needed; most proxied
    ├── src/
    │   ├── components/
    │   │   ├── feed/FeedList.tsx
    │   │   ├── feed/FeedRowComfortable.tsx
    │   │   ├── feed/FeedRowCompact.tsx
    │   │   ├── reader/ReaderView.tsx
    │   │   ├── reader/BilingualBody.tsx
    │   │   ├── reader/PrevNextBar.tsx
    │   │   ├── reader/NextUpCard.tsx
    │   │   └── reader/HighlightLayer.tsx
    │   ├── stores/
    │   │   ├── useAuthStore.ts
    │   │   ├── useUIStore.ts           # density, theme
    │   │   └── useReaderStore.ts
    │   ├── lib/
    │   │   ├── api-client.ts
    │   │   ├── broadcast.ts
    │   │   └── keys.ts                 # keyboard shortcut dispatcher
    │   └── test-setup.ts
    ├── playwright.config.ts
    └── package.json
```

## 11. Deployment

### 11.1 Runtime

```yaml
# docker-compose.yml (abbreviated)
services:
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7
    volumes: [redisdata:/data]
  api:
    build: ./server
    command: ["/app/api"]
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
      XREADER_AI_CONFIG: /etc/xreader/ai.yaml
      XREADER_AI_API_KEY: ${XREADER_AI_API_KEY}
      SESSION_SECRET: ${SESSION_SECRET}
    volumes:
      - ./config/ai.yaml:/etc/xreader/ai.yaml:ro
  worker:
    build: ./server
    command: ["/app/worker"]
    depends_on: [postgres, redis]
    environment: (same as api)
    volumes: (same as api)
  web:
    build: ./web
    environment:
      NEXT_PUBLIC_API_BASE: ""   # same-origin via reverse proxy
    depends_on: [api]
volumes:
  pgdata: {}
  redisdata: {}
```

### 11.2 Reverse proxy

Homelab setup (owner's existing): Caddy or Cloudflare Tunnel. Public hostname routes `/api/*` → api container, everything else → web container.

### 11.3 Secrets

All secrets via env file `.env` (never committed). `config/ai.yaml` holds only the base URL and model names; the key is read from an env var named in the config. This way the same config can be checked into a private repo without leaking the key.

### 11.4 Bootstrapping the first admin

- `docker compose run api seed-admin --github-username=<yours>` — CLI subcommand adds the specified user to the allowlist and marks their eventual account as `admin`.
- On first OAuth login for this username, the user row is created and the `admin` role applied.

## 12. Testing strategy

- **Backend ≥ 80 % coverage**; service layer ≥ 90 %. Real Postgres via testcontainers-go. No mocking of the database.
- **Frontend ≥ 70 % coverage**. Vitest unit tests for components and stores; MSW intercepts network. Playwright covers the critical end-to-end flows (§2 success criteria).
- **TDD workflow**: Red → Green → Refactor. Implementers follow `superpowers:test-driven-development` skill.
- **Key E2E flows** to automate:
  1. Login → add source → see first item summarized and titled in native language.
  2. Feed density toggle persists across reload.
  3. Open a non-native article → summary visible immediately; body translation streams in and persists.
  4. Highlight text → reopens with mark rendered on both layers.
  5. Prev/next navigation from reader; auto-mark-as-read verified in DB.
  6. OPML import → sources appear; export roundtrips.
- **Load test (lightweight)**: 1 000 articles in DB, 20 subscribed sources, 5 concurrent users reading — feed load P95 < 500 ms; reader first paint < 1 s.

## 13. Observability

- Structured JSON logs: `{level, ts, request_id, user_id, path, status, duration_ms, msg}`
- Metrics (Prometheus): RSS fetch success/fail counters, AI call counters + latency histograms, API P50/P95 per endpoint.
- No paid monitoring in v1 — `docker logs` + a simple Grafana if owner already has one.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| AI relay station outage | Config supports primary + fallback base URLs (v1: manual swap; v2: auto-failover) |
| AI prompt drift degrading summary quality | Prompt file checked into repo; changes reviewed; keep `summary_version` column so old summaries can be regenerated |
| RSS source goes dead | `consecutive_fails` counter + health label in the source list UI; owner can delete manually. Auto-downgrade is Phase 2. |
| Owner's allowlist leaks / unwanted access | GitHub OAuth + allowlist + SESSION_SECRET rotation documented; Cloudflare Tunnel also gates network access |
| AI cost spikes (someone adds 500 feeds) | v1 runs within a known envelope (~50 sources × ~20 items/day × 1 eager call + occasional body = well under $10/mo). Phase 2 adds quotas if group grows. |
| Highlight anchor drift if source re-publishes | Store anchors against post-sanitization paragraph hash + offset; if paragraph hash differs on re-fetch, mark highlight `orphaned` and show in Highlights list with a "source changed" note |
| Highlight drift on translation retry | Body translation is regenerated only on explicit user retry. The retry job preserves paragraph count and order (one translation per source paragraph). If the new paragraph count matches, highlights on the translation layer stay valid; if not (rare — only happens if the AI chunks paragraphs differently), the affected translation-layer highlights are marked `orphaned` like above. |

## 15. Open questions

The following are intentionally left open for the implementation phase — decisions small enough that they can be made during coding, but worth noting so they're not forgotten:

1. **Today tab curation formula**. v1: time-windowed (last 24h) + ordered by `published_at DESC`, capped at ~100 items. Any AI-scored importance is Phase 2. Revisit after 1 week of use.
2. **Language detection reliability**. `langdetect` works well on ≥500 chars; for shorter items, trust the feed's `<language>` tag; for X-like short items once adapters land, revisit.
3. **Reading progress precision**. Store both `scroll_percent` and `paragraph_index`; restore preferring `paragraph_index` when present.
4. **Compact mode: Hover-to-peek 要点**. Implementers should verify the hover popover feels good on trackpad — fallback is tap on mobile, Space key on desktop to "peek" the summary without opening the detail.
5. **Search scope**. v1 searches across articles (all languages, via PG FTS on `title || content_text`). No translation-aware search — that's Phase 2.

---

## Appendix A — Decision log from brainstorm

Short references to what was accepted/rejected during the design conversation, so the implementer understands the *why* behind choices:

| Decision | Rationale |
|---|---|
| Fresh rewrite, not iteration on predecessor | Owner evaluated the predecessor and found its experience inadequate |
| Flat feed, not card-deck | Card-deck explored (Q5) and rejected; scan-speed preference won out |
| Alternating paragraphs, not side-by-side columns | Owner explicit preference (Q6) — feels less like "study mode" |
| Neutral "要点" label, not "AI 摘要" | Owner wants AI invisible; the value, not the provider, is front-and-center |
| `[title] [badge] … [time]` in compact | Owner requested this exact arrangement after seeing earlier versions |
| Auto-mark-read on next | Owner explicit (Q7) |
| No mobile swipe navigation | Owner explicit (Q7) — protects text selection for highlights |
| "Next up" card always visible | Owner explicit (Q7) |
| Prev/next follows entry context | Owner explicit (Q7) |
| Opening article does not immediately mark read | Owner wanted accidental opens / peeks to be safe; read state means processed, not merely opened |
| Just-read unread rows fade first, then disappear | Owner requested delayed disappearance so state changes are understandable and reversible |
| New-source backlog defaults to read | Owner noted adding many sources creates too many unread items; unread should mean actionable new queue, not historical archive debt |
| Bulk mark-read with exact undo | Owner needed a way to clear many low-interest items without one-by-one work; exact affected IDs prevent undo from flipping older read state |
| Summary-only RSS supports `加载原文` in-reader | Owner observed sources like razeen.me expose only one RSS paragraph; preserving the reader context is preferred over opening the raw site |
| Original content uses xReader typography, not source site styling | Owner wanted loaded originals to feel like the same reader while preserving semantic hierarchy such as headings, lists, and TOC |
| Source add accepts domain/homepage/feed URL | Owner requested a novice-friendly flow that discovers feeds automatically from simple input |
| RSS-only v1 | Scoping reframe — owner approved; X/V2EX = Phase 2 |
| OpenAI-compatible AI client, config-driven | Owner has a relay station / wants flexibility |
| No Obsidian sync v1 | Owner confirmed predecessor's feature was aspirational and unused |
| GitHub OAuth + allowlist | Small-group audience (B in Q3); zero password management |

## Appendix B — Environment variables (template)

```
# Postgres
DATABASE_URL=postgres://xreader:xreader@postgres:5432/xreader?sslmode=disable

# Redis
REDIS_URL=redis://redis:6379/0

# GitHub OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_OAUTH_CALLBACK=https://xreader.example.com/api/auth/callback/github

# Sessions
SESSION_SECRET=<64-random-bytes-base64>

# AI (OpenAI-compatible)
XREADER_AI_CONFIG=/etc/xreader/ai.yaml
XREADER_AI_API_KEY=sk-...

# Misc
LOG_LEVEL=info
TZ=Asia/Shanghai
```

## Appendix C — `config/ai.yaml` template

See §6.3.3.

---

**End of design spec.** Implementers should read the companion plan at `docs/superpowers/plans/2026-04-18-xreader-web-v1-plan.md` for the sprint-by-sprint build sequence.
