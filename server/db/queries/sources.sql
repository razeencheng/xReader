-- name: CreateSource :one
INSERT INTO sources (
    user_id, kind, url, normalized_url, title, icon_url, language_hint,
    last_fetched_at, last_success_at, consecutive_fails, health, deleted_at
)
VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12
)
RETURNING *;

-- name: GetSourceByID :one
SELECT * FROM sources
WHERE id = $1 AND deleted_at IS NULL;

-- name: ListSourcesByUser :many
SELECT * FROM sources
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC;

-- name: UpdateSourceTitle :exec
UPDATE sources
SET title = $2
WHERE id = $1;

-- name: SoftDeleteSource :exec
UPDATE sources
SET deleted_at = now()
WHERE id = $1;

-- name: CountSourcesByUser :one
SELECT count(*) FROM sources
WHERE user_id = $1 AND deleted_at IS NULL;

-- name: UpdateSourceFetchStatus :exec
UPDATE sources
SET last_fetched_at = $2,
    last_success_at = $3,
    consecutive_fails = $4,
    health = $5
WHERE id = $1;

-- name: ListSourcesDueForFetch :many
SELECT * FROM sources
WHERE deleted_at IS NULL
  AND (
    last_fetched_at IS NULL
    OR (consecutive_fails < 3 AND last_fetched_at < now() - interval '15 minutes')
    OR (consecutive_fails >= 3 AND consecutive_fails < 6 AND last_fetched_at < now() - interval '1 hour')
    OR (consecutive_fails >= 6 AND last_fetched_at < now() - interval '6 hours')
  )
ORDER BY last_fetched_at ASC NULLS FIRST;
