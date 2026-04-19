.PHONY: up down build test test-server test-web migrate-up migrate-down sqlc-generate lint seed-admin

up:
	docker compose up -d

down:
	docker compose down

build:
	cd server && go build ./... && cd ../web && pnpm build

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
	cd server && go run ./cmd/api seed-admin --github-username=$${GH_USER}
