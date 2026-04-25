# AI Development Guidelines for xReader Web

These guidelines apply to any AI agent (Claude Code, Copilot, Cursor, etc.) working on this codebase. They complement `CLAUDE.md` (which covers project-specific commands and conventions) with broader principles.

---

## 1. Context discipline

### 1.1 Always start from documents, not assumptions

Every session must begin by reading:
1. `CLAUDE.md` (project commands + key patterns)
2. The design spec (requirements, architecture, data model)
3. The implementation plan (current sprint, next unchecked task)

**Why:** AI agents have no memory between sessions. The spec and plan exist specifically so you don't have to guess. Reading them takes 2 minutes; recovering from wrong assumptions takes 2 hours.

**Bad:**
```
User: "Continue working on the project"
Agent: "I'll start by setting up a React app with Redux..."
```

**Good:**
```
User: "Continue working on the project"
Agent: "Let me read the plan to find the next unchecked task..."
→ reads plan → "Next task is 3.2 (Articles API). Starting with the failing test."
```

### 1.2 Mockups are pixel-authoritative

The HTML mockups under `docs/superpowers/specs/mockups/` are the visual source of truth. They were iterated through multiple rounds of owner feedback. Each pixel choice (the muted `#6a6252` for original paragraphs, the `[title] [badge] ... [time]` compact layout, the 要点 callout styling) was a deliberate decision.

**Rule:** Match mockups. If a mockup seems wrong during implementation, **stop and ask the owner** — don't silently "improve" it.

**Bad:**
```
"I noticed the compact row has no hover effect, so I added a blue highlight on hover."
```

**Good:**
```
"The mockup doesn't show a hover state for compact rows. Should I add one, or is the clean look intentional?"
```

### 1.3 Stay inside v1 scope

The spec §3.2 lists everything that's explicitly out of scope. Do not implement Phase 2/3 features even if they feel like natural extensions.

Common traps:
- Adding SSE for cross-device sync (v1 uses polling)
- Building a community submission / review workflow (v1 is private)
- Adding Obsidian sync for highlights (explicitly dropped)
- Building swipe-gesture navigation on mobile (explicitly rejected)
- Implementing multiple AI provider failover (v1: single provider via config)

---

## 2. TDD discipline

### 2.1 Red → Green → Refactor — no shortcuts

The workflow is non-negotiable:

1. **Write the failing test.** The test describes the behavior you want.
2. **Run it. Watch it fail.** If it passes, your test is wrong or the feature already exists.
3. **Write the minimum code to make it pass.** Not "good" code — *minimum* code.
4. **Run all tests.** Everything must pass, not just the new one.
5. **Refactor if needed.** Now make the code clean, with tests as your safety net.
6. **Commit.**

**Why:** Every "just this once I'll write the code first" leads to undertested code. The predecessor project had passing tests that masked broken behavior because tests were written to match the implementation rather than the specification.

### 2.2 Test quality rules

**Never weaken an assertion to make a test pass.** If the code doesn't match the assertion, fix the code. If the assertion is genuinely wrong (you misunderstood the spec), fix the assertion *and document why in the commit message*.

**Never delete a failing test to unblock a commit.** The test is telling you something. Listen.

**Never skip tests with `t.Skip()` or `.skip()` to "come back later."** You won't come back. Fix it now or accept the feature isn't done yet.

**Test at the right level:**
- **Backend service layer:** Integration test with real Postgres (testcontainers). This is where most bugs live.
- **Backend handler layer:** HTTP-level test via `httptest.NewRecorder`. Verifies status codes, response shapes, auth enforcement.
- **Frontend components:** Render test with Testing Library. Verify user-visible behavior, not implementation details.
- **E2E:** Playwright for critical paths only (login, add source, read article, highlight). Not for every edge case.

### 2.3 What to mock, what not to mock

| Layer | Mock it? | What to use instead |
|---|---|---|
| Database | **Never** | testcontainers-go → real Postgres |
| Redis | **Never** | testcontainers or real Redis in CI |
| GitHub OAuth | **Yes** | `MockGitHubClient` (returns fixed user) |
| AI provider | **Yes** | `MockAIClient` (configurable responses) |
| HTTP APIs in frontend | **Yes** | MSW (intercepts fetch) |
| File system | **Rarely** | Use `t.TempDir()` for real files |

---

## 3. Change discipline

### 3.1 One task = one commit

Each task in the plan is sized for a single commit. The commit message follows conventional commits:

```
feat(source): RSS adapter with HTML sanitization
fix(article): cursor pagination off-by-one on today tab
chore(db): migration 003 article states + FTS
test(web): Playwright E2E for highlight persistence
```

**Don't bundle unrelated changes.** If you notice a typo in a file you're not working on, leave it — or make it a separate commit with an honest message.

### 3.2 Don't refactor outside your task

It's tempting to clean up adjacent code while you're in the neighborhood. Don't.

**Bad:**
```
Task: "Add OPML import endpoint"
Commit: "feat(source): OPML import + refactored feed service to use generics + renamed 3 variables for clarity"
```

**Good:**
```
Task: "Add OPML import endpoint"
Commit: "feat(source): OPML import async job with progress"
```

If you genuinely believe a refactor is needed, note it in the round log. The owner can schedule it as its own task.

### 3.3 Safety gates — always ask first

These actions are **irreversible or contract-breaking**. Stop and ask the owner:

1. **New database migration** — changes the schema for everyone. Migration files must be reviewed.
2. **OpenAPI spec change** — changes the contract between frontend and backend.
3. **New dependency** — every `go get` or `pnpm add` introduces supply-chain risk and maintenance burden. State *why* the existing stdlib/dependencies can't do it.
4. **Destructive git operations** — `push --force`, `reset --hard`, `commit --amend` on pushed commits, `branch -D`.

### 3.4 Commit hygiene

- Never commit `.env`, `config/ai.yaml` with real keys, or any file containing secrets.
- Always verify `git diff --staged` before committing to ensure no unintended files.
- Never use `git add .` or `git add -A`. Stage specific files by name.

---

## 4. AI-specific hazards

These are failure modes specific to AI agents that human developers rarely hit.

### 4.1 Hallucinated APIs

AI agents sometimes "remember" method signatures that don't exist, or confuse similar libraries. 

**Rule:** If you're not 100% certain a library function exists with that exact signature, verify it before using it. Read the source, check docs, or write a tiny test.

**Bad:**
```go
// Agent "remembers" gofeed has this method — it doesn't
feed, _ := parser.ParseURLWithContext(url, ctx)
```

**Good:**
```go
// Verified: gofeed.Parser has ParseURL(string) (*Feed, error)
feed, err := parser.ParseURL(url)
```

### 4.2 Over-engineering

AI agents love to add "defensive" code — extra error checks, fallback paths, retry logic, feature flags — beyond what the spec requires. This creates code that's harder to read, harder to test, and harder to change.

**Rule:** Implement exactly what the spec says. No more.

**Bad:**
```go
func (s *Service) GetArticle(ctx context.Context, id int64) (*Article, error) {
    if id <= 0 {
        return nil, ErrInvalidID // spec never mentions this check
    }
    // ... also adds caching, metrics, tracing that no task requested
}
```

**Good:**
```go
func (s *Service) GetArticle(ctx context.Context, id int64) (*Article, error) {
    return s.queries.GetArticle(ctx, id) // caller passes valid IDs; DB returns not-found if invalid
}
```

### 4.3 Assumption stacking

AI agents build on unstated assumptions. Each one is small; stacked, they produce code that doesn't match the design.

**Rule:** When you make a decision not explicitly covered by the spec, say it out loud — in the commit message or a brief code comment.

**Bad:**
```ts
// Agent assumed articles are pre-sorted, compact row truncates at 60 chars,
// badges use emoji, and hover shows a popover — none stated in spec or plan
```

**Good:**
```ts
// Assumption: compact title overflow uses text-ellipsis (not truncation to N chars).
// Spec doesn't specify; ellipsis matches mockup behavior. Flag if wrong.
```

### 4.4 AI provider lock-in

This project uses an **OpenAI-compatible** API on purpose — the owner uses a relay station and wants to swap models freely. 

**Never:**
- Import `anthropic` or `openai` SDKs (use raw HTTP to the OpenAI-compatible endpoint)
- Hardcode model names, base URLs, or API keys in source code
- Assume Claude-specific or OpenAI-specific response fields (stick to the standard `choices[0].message.content` shape)
- Add provider-specific retry logic (the generic exponential backoff in `ai/client.go` handles all providers)

### 4.5 Silent design drift

The most dangerous AI failure mode: the code works, tests pass, but the product gradually diverges from the spec because small deviations accumulate without anyone noticing.

**Prevention:**
- After implementing a UI task, open the mockup HTML *and* the running app side by side. Compare visually.
- After implementing an API endpoint, compare the response shape against the OpenAPI spec.
- After any task that touches the data model, verify column names/types against the migration.

---

## 5. Logging and continuity

### 5.1 Round logs

After completing each task, write a round log to `docs/claude/devlog/YYYY-MM-DD-round-NN.md`:

```markdown
# Round NN — [task title]

**Date**: YYYY-MM-DD
**Task**: [plan reference, e.g., "Sprint 2, Task 2.3"]
**Status**: success | partial | failed

## What was done
- [concrete changes: files created/modified, tests added]

## Build/Test results
- Backend: X/Y tests passed
- Frontend: X/Y tests passed

## Issues encountered
- [if any — what broke, what the root cause was]

## Assumptions made
- [any decision not in the spec, with reasoning]
```

### 5.2 Compaction summaries

After every 5 rounds, write a summary to `docs/claude/devlog/YYYY-MM-DD-summary.md`. This prevents context from growing unbounded across sessions. The summary captures what matters; previous round logs become archival.

### 5.3 Progress updates

After completing a sprint, update the plan file: check off all completed `- [ ]` boxes as `- [x]`. This is how the next session knows where to start.

---

## 6. Language and i18n conventions

- **Code**: English (variable names, comments, commit messages, docs)
- **User-facing strings**: Chinese (zh-CN) as the default; global UI chrome must use i18n keys and follow the user's `native_language` setting
- **AI prompts**: Ship zh-CN and en-US versions (in `server/internal/ai/prompts.go`); parameterized by the user's `native_language`
- **Test fixtures**: Use realistic Chinese + English content to catch encoding, rendering, and font-stack issues early

---

## 7. Quick reference: Do / Don't

| Do | Don't |
|---|---|
| Read spec + plan before every session | Assume you remember from last time |
| Write the failing test first | Write implementation then backfill tests |
| Match mockups pixel-by-pixel | "Improve" the design without asking |
| One task, one commit | Bundle unrelated changes |
| Stage files by name | `git add .` |
| Use the OpenAI-compatible client | Import provider-specific SDKs |
| Ask before adding migrations/deps | Add them silently |
| Log every round | Let context grow unbounded |
| Stop and ask when unsure | Stack assumptions silently |
| Implement what the spec says | Add "defensive" extras |
