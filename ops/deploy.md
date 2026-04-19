# Production deployment

This guide assumes the repository is already cloned on the target host and Docker Compose is available.

## 1) Clone the repository

```bash
git clone <repo-url> /data/xreader/xreader-web
cd /data/xreader/xreader-web
```

If you already have the repo checked out, pull the latest changes instead:

```bash
git pull
```

## 2) Prepare the production environment file

Create `/etc/xreader/.env` on the host and keep secrets out of the repository.

Minimum required values:

```dotenv
DATABASE_URL=postgres://xreader:xreader@postgres:5432/xreader?sslmode=disable
REDIS_URL=redis://redis:6379/0
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...
XREADER_AI_API_KEY=...
```

Make sure the AI config file exists at `./config/ai.yaml` in the repo. The production compose file mounts it into the API and worker containers.

## 3) Start the stack

Use the production override:

```bash
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

The stack includes:

- `postgres` on a bind mount at `/data/xreader/postgres`
- `redis`
- `api`
- `web`
- `worker`

## 4) Run database migrations

Run the migrations before opening traffic to the app.

If you have the `migrate` CLI installed on the host, run:

```bash
export DATABASE_URL="$(grep '^DATABASE_URL=' /etc/xreader/.env | cut -d= -f2-)"
cd /data/xreader/xreader-web/server
migrate -path db/migrations -database "$DATABASE_URL" up
```

If you prefer to keep everything inside Docker, run the same migration command from a disposable helper container that has the `migrate` binary available.

## 5) Seed the first admin

Seed the GitHub username that should receive admin access:

```bash
docker compose -f docker-compose.prod.yml exec api ./api seed-admin --github-username=<username>
```

This adds the username to the allowlist and upgrades the user role to `admin` once the account exists.

## 6) Verify health

Check the API health endpoint:

```bash
curl -fsS http://localhost:8080/health
```

Expected response:

```json
{"status":"ok"}
```

You should also confirm the web app is reachable on port 3000 and that the worker is running in the background.

## 7) Useful operational commands

Check container status:

```bash
docker compose -f docker-compose.prod.yml ps
```

View logs:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Restart one service:

```bash
docker compose -f docker-compose.prod.yml restart api
```
