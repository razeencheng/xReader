# Source Restore On Re-Subscribe

**Date:** 2026-04-29
**Scope:** Source creation and soft-delete behavior

## Summary

- Fixed re-adding a previously deleted source so it restores the soft-deleted row instead of surfacing `source already exists`.
- Added a sqlc query for restoring sources by `user_id + normalized_url`.
- Kept active duplicate subscriptions as conflicts.
- Reset restored source fetch metadata to the same initial state as a newly created source.

## Verification

- `cd server && go test ./internal/source -run TestSourceService_Create_RestoresSoftDeletedURL -count=1 -v` passed.
- `cd server && go test ./internal/source -count=1` passed.
- `cd server && go build ./...` passed.
- `cd server && go test ./...` passed.
- Rebuilt and restarted the local API binary on `:8080`; `GET /health` returned `{"status":"ok"}`.
