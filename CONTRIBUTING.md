# Contributing to xReader

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Go 1.25+
- Node.js 20+ with pnpm
- Docker (for Postgres in tests)

### Getting Started

```bash
git clone https://github.com/razeencheng/xreader.git
cd xreader

# Start Postgres
make up

# Backend (auto-migrates on startup)
cd server && go run ./cmd/xreader
# First run prints a SETUP TOKEN to the console

# Frontend (separate terminal)
cd web && pnpm install && pnpm dev

# Open http://localhost:3000/setup → enter token → configure
```

### Running Tests

```bash
make test          # All tests
cd server && go test ./...    # Backend (requires Docker)
cd web && pnpm vitest run     # Frontend
make lint          # Lint all
```

## Pull Request Guidelines

1. **One feature/fix per PR**
2. **Conventional commits** — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
3. **Tests required** — new features need tests, bug fixes need regression tests
4. **Lint clean** — `make lint` must pass

## Code Style

- **Go:** standard conventions, `go vet` clean
- **TypeScript:** ESLint via `pnpm lint`
- **CSS:** Tailwind utilities, CSS variables from `globals.css`
- **Database:** SQL in `server/db/queries/*.sql`, run `make sqlc-generate`

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.
