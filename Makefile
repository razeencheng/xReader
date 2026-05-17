.DEFAULT_GOAL := help
.PHONY: help up down build rebuild dev test test-server test-web migrate-up migrate-down sqlc-generate lint seed-admin

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

up: ## Start Postgres + Redis containers
	docker compose up -d

down: ## Stop containers
	docker compose down

build: ## Build web + server binary
	cd web && pnpm build
	rm -rf server/cmd/xreader/static
	cp -r web/out server/cmd/xreader/static
	cd server && go build -o bin/xreader ./cmd/xreader

rebuild: ## Rebuild and restart xreader
	cd web && pnpm build
	rm -rf server/cmd/xreader/static
	cp -r web/out server/cmd/xreader/static
	cd server && go build -o bin/xreader ./cmd/xreader
	@echo "Restarting xreader..."
	@pkill -f 'bin/xreader' 2>/dev/null || true
	@sleep 1
	cd server && set -a && [ -f ../.env ] && . ../.env && set +a && bin/xreader &
	@echo "xreader running on http://0.0.0.0:$${PORT:-3000}"

dev: ## Start web dev server on :3000
	@lsof -ti :3000 | xargs kill 2>/dev/null || true
	cd web && pnpm dev --hostname 0.0.0.0

test: test-server test-web ## Run all tests

test-server: ## Run Go tests
	cd server && go test ./...

test-web: ## Run frontend tests
	cd web && pnpm vitest run

migrate-up: ## Run all DB migrations
	cd server && migrate -path db/migrations -database "$$DATABASE_URL" up

migrate-down: ## Rollback one migration
	cd server && migrate -path db/migrations -database "$$DATABASE_URL" down 1

sqlc-generate: ## Regenerate sqlc Go code
	cd server && sqlc generate -f db/sqlc.yaml

lint: ## Lint backend + frontend
	cd server && go vet ./... && cd ../web && pnpm lint

seed-admin: ## Bootstrap admin (GH_USER=xxx)
	cd server && go run ./cmd/xreader seed-admin --github-username=$${GH_USER}

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t razeencheng/xreader:v0.1.4 -t razeencheng/xreader:latest --push .