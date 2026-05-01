.PHONY: up down build rebuild dev test test-server test-web migrate-up migrate-down sqlc-generate lint seed-admin

up:
	docker compose up -d

down:
	docker compose down

build:
	cd web && pnpm build
	rm -rf server/cmd/xreader/static
	cp -r web/out server/cmd/xreader/static
	cd server && go build -o bin/xreader ./cmd/xreader

rebuild:
	cd web && pnpm build
	rm -rf server/cmd/xreader/static
	cp -r web/out server/cmd/xreader/static
	cd server && go build -o bin/xreader ./cmd/xreader
	@echo "Restarting xreader..."
	@pkill -f 'bin/xreader' 2>/dev/null || true
	@sleep 1
	cd server && set -a && [ -f ../.env ] && . ../.env && set +a && bin/xreader &
	@echo "xreader running on http://0.0.0.0:$${PORT:-3000}"

dev:
	@lsof -ti :3000 | xargs -r kill 2>/dev/null || true
	cd web && pnpm dev --hostname 0.0.0.0

test: test-server test-web

test-server:
	cd server && go test ./...

test-web:
	cd web && pnpm vitest run

migrate-up:
	cd server && migrate -path db/migrations -database "$$DATABASE_URL" up

migrate-down:
	cd server && migrate -path db/migrations -database "$$DATABASE_URL" down 1

sqlc-generate:
	cd server && sqlc generate -f db/sqlc.yaml

lint:
	cd server && go vet ./... && cd ../web && pnpm lint

seed-admin:
	cd server && go run ./cmd/xreader seed-admin --github-username=$${GH_USER}
