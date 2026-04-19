# Backup and restore

This document covers nightly PostgreSQL backups, restore steps, and a basic verification checklist.

## 1) Nightly backup with pg_dump

Run a nightly backup from cron on the host.

Example script:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/data/xreader/backups
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%F-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/xreader-$TIMESTAMP.sql.gz"

source /etc/xreader/.env

docker compose -f /data/xreader/xreader-web/docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-xreader}" -d "${POSTGRES_DB:-xreader}" \
  | gzip > "$BACKUP_FILE"
```

Suggested cron entry:

```cron
0 2 * * * /usr/local/bin/xreader-backup.sh
```

Keep a retention policy so the backup directory does not grow without bound.

## 2) Backup verification

Verify that the backup job is still working every day:

1. Confirm the backup file exists and is non-empty.
2. Check the gzip file can be read:

   ```bash
   gzip -t /data/xreader/backups/xreader-YYYY-MM-DD-HHMMSS.sql.gz
   ```

3. Inspect the latest backup timestamp.
4. Periodically restore into a scratch database to confirm the dump is usable.

## 3) Restore procedure

When you need to restore the database:

1. Stop the application services so nothing writes during restore:

   ```bash
   docker compose -f docker-compose.prod.yml stop api worker web
   ```

2. Create a fresh database or empty the existing one.
3. Restore the backup into PostgreSQL:

   ```bash
   gunzip -c /data/xreader/backups/xreader-YYYY-MM-DD-HHMMSS.sql.gz \
     | docker compose -f docker-compose.prod.yml exec -T postgres \
       psql -U "${POSTGRES_USER:-xreader}" -d "${POSTGRES_DB:-xreader}"
   ```

4. Run migrations again to ensure the schema matches the current release.
5. Start the stack back up:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

## 4) Post-restore checks

After the restore completes, verify:

- `curl -fsS http://localhost:8080/health` returns `{"status":"ok"}`
- The API logs show successful database connections
- Articles, sources, and admin allowlist rows are present
- The web app loads and can sign in

## 5) Disaster recovery notes

- Store backups on a volume separate from the live Postgres data directory.
- Test the restore path on a staging host before you need it in production.
- Keep at least one off-host copy if the homelab storage itself is the failure domain.
