# Phase 3: Open-Source Release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare xReader for its first public open-source release (v0.1.0) with documentation, CI/CD, multi-arch Docker images, and community launch materials.

**Architecture:** GitHub Actions for CI/CD, GHCR for container registry, conventional commits for changelog.

**Tech Stack:** GitHub Actions, Docker buildx, goreleaser (optional)

**Design spec:** `docs/superpowers/specs/2026-04-30-xreader-open-source-launch-design.md` §6

**Depends on:** Phase 1 + Phase 2 completed

---

## Task 1: LICENSE

**Files:**
- Create: `LICENSE`

### Steps

- [ ] **Step 1: Add AGPL-3.0 license**

```bash
curl -sL https://www.gnu.org/licenses/agpl-3.0.txt > LICENSE
```

Or copy the full AGPL-3.0 text. Ensure the copyright line reads:

```
Copyright (C) 2026 Razeen Cheng
```

- [ ] **Step 2: Commit**

```
chore: add AGPL-3.0 license
```

---

## Task 2: README.md

**Files:**
- Create: `README.md`

### Steps

- [ ] **Step 1: Write bilingual README**

Structure:

```markdown
<div align="center">

# xReader

**Self-hosted RSS reader with AI-powered translation & key points**

**AI 驱动的自托管 RSS 阅读器 — 自动翻译 + 要点总结**

[Features](#features) · [Quick Start](#quick-start) · [Configuration](#configuration) · [中文文档](#中文)

</div>

---

## Features

- **AI Bilingual Reading** — Titles auto-translated, paragraphs rendered side-by-side, 3-5 bullet key points (要点) per article
- **Fever API** — Connect Reeder, NetNewsWire, Unread, and other native clients
- **Full-Text Search** — Search across all articles, CJK-aware
- **Highlights & Notes** — Select text, highlight, add notes
- **Dark Mode + Themes** — Light/dark/system with 4 accent colors
- **OpenAI-Compatible AI** — Works with DeepSeek, Moonshot, one-api, OpenRouter, or any OpenAI-compatible relay
- **Simple Deployment** — Single binary + Postgres, 2 containers total
- **Keyboard-First** — Full shortcut set (J/K navigate, S star, E mark read, / search)

## Quick Start

```bash
# 1. Clone and start (only SESSION_SECRET needed in .env)
git clone https://github.com/OWNER/xreader.git
cd xreader
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

# 2. Start (2 containers: xreader + postgres)
docker compose up -d

# 3. Check logs for the Setup Token
docker compose logs xreader | grep "SETUP TOKEN"

# 4. Open http://localhost:3000/setup → enter token → configure GitHub OAuth + AI
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `SESSION_SECRET` | Yes | Random string for session signing |
| `GITHUB_CLIENT_ID` | Yes* | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes* | GitHub OAuth App Client Secret |
| `XREADER_AI_API_KEY` | No | AI API key (can also set via web UI) |

*Can be configured via Setup Wizard on first run.

## Fever API (Third-Party Clients)

1. Go to Settings → Third-party clients
2. Set a Fever password
3. In your RSS client, add a Fever account:
   - **Server:** `https://your-domain/fever/`
   - **Username:** your GitHub username
   - **Password:** the password you set

Tested with: Reeder, NetNewsWire, Unread.

## Screenshots

<!-- Add screenshots here -->

## Development

```bash
# Backend
cd server && go test ./...
cd server && go run ./cmd/xreader

# Frontend
cd web && pnpm install && pnpm dev
cd web && pnpm vitest run
```

## Roadmap

- [ ] Local username/password auth
- [ ] Auto-cleanup retention policies
- [ ] PWA support
- [ ] Health monitoring dashboard
- [ ] HackerNews, Reddit, Newsletter adapters
- [ ] Google Reader API

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE)

---

## 中文

### 功能亮点

- **AI 双语阅读** — 标题自动翻译，段落原文+译文交替排列，每篇文章自动生成 3-5 条要点摘要
- **Fever API 兼容** — 支持 Reeder、NetNewsWire、Unread 等第三方客户端
- **全文搜索** — 支持中日韩文搜索，无需额外插件
- **高亮和笔记** — 选中文字高亮，添加笔记
- **深色模式 + 主题** — 浅色/深色/跟随系统，4 种强调色
- **OpenAI 兼容 AI** — 支持 DeepSeek、Moonshot、one-api、OpenRouter 等中转服务
- **极简部署** — 单个二进制 + Postgres，仅需 2 个容器
- **键盘优先** — 完整快捷键（J/K 导航、S 收藏、E 标记已读、/ 搜索）

### 快速开始

```bash
git clone https://github.com/OWNER/xreader.git
cd xreader
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

docker compose up -d
docker compose logs xreader | grep "SETUP TOKEN"  # 获取安装令牌
# 打开 http://localhost:3000/setup → 输入令牌 → 配置 GitHub OAuth + AI
```
```

- [ ] **Step 2: Commit**

```
docs: add bilingual README
```

---

## Task 3: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

### Steps

- [ ] **Step 1: Write contributing guide**

```markdown
# Contributing to xReader

Thank you for your interest in contributing to xReader!

## Development Setup

### Prerequisites

- Go 1.25+
- Node.js 20+ with pnpm
- Docker (for Postgres in tests)
- A GitHub OAuth App (for local testing)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/OWNER/xreader.git
cd xreader

# Start Postgres (only dependency)
make up   # or: docker compose up postgres -d

# Backend (in one terminal) — auto-migrates on startup
cd server && go run ./cmd/xreader
# First run prints a SETUP TOKEN to the console

# Frontend (in another terminal)
cd web && pnpm install && pnpm dev

# Open http://localhost:3000/setup → enter Setup Token → configure
```

### Running Tests

```bash
# All tests
make test

# Backend only (requires Docker for testcontainers)
cd server && go test ./...

# Frontend only
cd web && pnpm vitest run

# Lint
make lint
```

## Pull Request Guidelines

1. **One feature/fix per PR** — keep changes focused
2. **Conventional commits** — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
3. **Tests required** — new features need tests, bug fixes need regression tests
4. **Lint clean** — `make lint` must pass

## Code Style

- **Go:** follow standard Go conventions, `go vet` clean
- **TypeScript:** ESLint + Prettier via `pnpm lint`
- **CSS:** Tailwind utility classes, use CSS variables from `globals.css`
- **Database:** write SQL in `server/db/queries/*.sql`, run `make sqlc-generate`

## Reporting Issues

- Use the issue templates for bug reports and feature requests
- Include reproduction steps for bugs
- Check existing issues before creating a new one

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.
```

- [ ] **Step 2: Commit**

```
docs: add contributing guide
```

---

## Task 4: GitHub Issue Templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`

### Steps

- [ ] **Step 1: Create bug report template**

```markdown
---
name: Bug Report
about: Report a bug to help us improve
title: "[Bug] "
labels: bug
---

## Describe the bug

A clear description of what the bug is.

## To Reproduce

Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

## Expected behavior

What you expected to happen.

## Screenshots

If applicable, add screenshots.

## Environment

- **xReader version:** (e.g., v0.1.0)
- **Deployment:** (Docker / binary)
- **Browser:** (e.g., Chrome 125)
- **OS:** (e.g., macOS 15, Synology DSM 7)
```

- [ ] **Step 2: Create feature request template**

```markdown
---
name: Feature Request
about: Suggest a new feature
title: "[Feature] "
labels: enhancement
---

## Problem

What problem does this solve?

## Proposed solution

How should it work?

## Alternatives considered

Any alternative approaches you've thought about.
```

- [ ] **Step 3: Commit**

```
docs: add GitHub issue templates
```

---

## Task 5: CI — Pull Request Checks

**Files:**
- Create: `.github/workflows/ci.yml`

### Steps

- [ ] **Step 1: Create CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  backend:
    name: Go Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: xreader
          POSTGRES_PASSWORD: xreader
          POSTGRES_DB: xreader_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: server/go.mod
      - name: Run tests
        working-directory: server
        run: go test ./... -race -count=1
        env:
          DATABASE_URL: postgres://xreader:xreader@localhost:5432/xreader_test?sslmode=disable
      - name: Vet
        working-directory: server
        run: go vet ./...

  frontend:
    name: Frontend Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - name: Install
        working-directory: web
        run: pnpm install --frozen-lockfile
      - name: Lint
        working-directory: web
        run: pnpm lint
      - name: Test
        working-directory: web
        run: pnpm vitest run

  build:
    name: Build Verification
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - uses: actions/setup-go@v5
        with:
          go-version-file: server/go.mod
      - name: Build frontend
        working-directory: web
        run: pnpm install --frozen-lockfile && pnpm build
      - name: Prepare static files
        run: cp -r web/out server/cmd/xreader/static
      - name: Build Go binary
        working-directory: server
        run: CGO_ENABLED=0 go build -o /dev/null ./cmd/xreader
```

- [ ] **Step 2: Commit**

```
ci: add GitHub Actions PR checks

Runs Go tests (with Postgres), frontend lint + tests, and build
verification on every PR and push to main.
```

---

## Task 6: CD — Release Pipeline

**Files:**
- Create: `.github/workflows/release.yml`

### Steps

- [ ] **Step 1: Create release workflow**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  packages: write

jobs:
  release:
    name: Build & Publish
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ steps.version.outputs.VERSION }}
            ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

- [ ] **Step 2: Commit**

```
ci: add release pipeline for multi-arch Docker images

Tags matching v* trigger a multi-arch build (amd64 + arm64),
push to GHCR, and create a GitHub Release with auto-generated
changelog.
```

---

## Task 7: Release v0.1.0

### Steps

- [ ] **Step 1: Final verification checklist**

```bash
# All tests pass
cd server && go test ./... -race -count=1
cd web && pnpm vitest run && pnpm lint

# Fresh 2-container deploy works
docker compose down -v
docker compose build
docker compose up -d

# Setup Wizard works
# Fever API works with a real client
# Search works (CJK + English)
# All pages render correctly on desktop + mobile
```

- [ ] **Step 2: Update .env.example with final documentation**

Ensure all env vars are documented with comments.

- [ ] **Step 3: Add screenshots to README**

Take clean screenshots of:
- Feed list (comfortable mode)
- Reader (bilingual article)
- Mobile view
- Dark mode

Add them to `docs/screenshots/` and reference from README.

- [ ] **Step 4: Tag and release**

```bash
git tag -a v0.1.0 -m "xReader v0.1.0 — first public release"
git push origin v0.1.0
```

The release workflow will automatically build Docker images and create the GitHub Release.

- [ ] **Step 5: Verify published artifacts**

- GitHub Release page has auto-generated changelog
- `docker pull ghcr.io/OWNER/xreader:v0.1.0` works
- `docker pull ghcr.io/OWNER/xreader:latest` works
- Both amd64 and arm64 manifests exist

- [ ] **Step 6: Community launch**

Prepare posts for:
- r/selfhosted
- V2EX
- Hacker News (Show HN)
- NAS community forums (Synology, Unraid)
