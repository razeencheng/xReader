-- name: SetArticleRead :one
INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
SELECT $1, a.id, $3, now()
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE a.id = $2 AND s.user_id = $1 AND s.deleted_at IS NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_read = $3,
  last_read_at = now()
RETURNING article_id;

-- name: SetArticleStarred :one
INSERT INTO article_states (user_id, article_id, is_starred)
SELECT $1, a.id, $3
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE a.id = $2 AND s.user_id = $1 AND s.deleted_at IS NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_starred = $3
RETURNING article_id;

-- name: GetArticleState :one
SELECT * FROM article_states
WHERE user_id = $1 AND article_id = $2;

-- name: UpdateReadingProgress :one
INSERT INTO article_states (user_id, article_id, reading_progress)
SELECT $1, a.id, $3
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE a.id = $2 AND s.user_id = $1 AND s.deleted_at IS NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  reading_progress = $3
RETURNING article_id;

-- name: RecordStateChange :exec
INSERT INTO article_state_changes (user_id, article_id)
VALUES ($1, $2);

-- name: AcquireStateOwnerLock :exec
SELECT pg_advisory_xact_lock(621383735000000000::bigint + sqlc.arg(user_id)::bigint);

-- name: AllocateStateChangeTime :one
SELECT GREATEST(
  clock_timestamp(),
  COALESCE(MAX(changed_at) + interval '1 microsecond', '-infinity'::timestamptz)
)::timestamptz AS changed_at
FROM article_state_changes
WHERE user_id = @user_id;

-- name: RecordStateChangeAt :exec
INSERT INTO article_state_changes (user_id, article_id, changed_at)
VALUES (@user_id, @article_id, @changed_at);

-- name: GetArticleStateSnapshot :one
SELECT @article_id::bigint AS article_id,
       COALESCE(st.is_read, false)::boolean AS is_read,
       COALESCE(st.is_starred, false)::boolean AS is_starred,
       latest.changed_at
FROM (SELECT 1) seed
LEFT JOIN article_states st
  ON st.user_id = @user_id AND st.article_id = @article_id
LEFT JOIN LATERAL (
  SELECT changed_at
  FROM article_state_changes
  WHERE user_id = @user_id AND article_id = @article_id
  ORDER BY changed_at DESC
  LIMIT 1
) latest ON true;

-- name: GetStateChangeHighWater :one
SELECT article_id, changed_at
FROM article_state_changes
WHERE user_id = @user_id
ORDER BY changed_at DESC, article_id DESC
LIMIT 1;

-- name: ListStateChangeKeys :many
SELECT article_id, changed_at
FROM article_state_changes
WHERE user_id = @user_id
  AND (
    changed_at > @cursor_changed_at
    OR (changed_at = @cursor_changed_at AND article_id > @cursor_article_id)
  )
ORDER BY changed_at ASC, article_id ASC
LIMIT @lim;

-- name: ListStateChangesSince :many
SELECT sc.article_id,
       sc.changed_at,
       COALESCE(st.is_read, false)    AS is_read,
       COALESCE(st.is_starred, false) AS is_starred
FROM article_state_changes sc
LEFT JOIN article_states st
  ON st.user_id = sc.user_id AND st.article_id = sc.article_id
WHERE sc.user_id = $1 AND sc.changed_at > $2
ORDER BY sc.changed_at ASC;

-- name: BatchSetReadBySource :many
WITH upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT $1, a.id, $3, CASE WHEN $3 THEN now() ELSE NULL END
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
  WHERE s.id = $2 AND s.user_id = $1
    AND s.deleted_at IS NULL
    AND COALESCE(st.is_read, false) <> $3
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = $3,
    last_read_at = CASE WHEN $3 THEN now() ELSE NULL END
  RETURNING article_id
)
SELECT article_id FROM upserted;

-- name: BatchSetReadToday :many
WITH upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT $1, a.id, $2, CASE WHEN $2 THEN now() ELSE NULL END
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
  WHERE s.user_id = $1 AND a.published_at >= now() - interval '24 hours'
    AND s.deleted_at IS NULL
    AND COALESCE(st.is_read, false) <> $2
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = $2,
    last_read_at = CASE WHEN $2 THEN now() ELSE NULL END
  RETURNING article_id
)
SELECT article_id FROM upserted;

-- name: BatchSetReadStream :many
WITH upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT $1, a.id, $2, CASE WHEN $2 THEN now() ELSE NULL END
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
  WHERE s.user_id = $1
    AND s.deleted_at IS NULL
    AND COALESCE(st.is_read, false) <> $2
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = $2,
    last_read_at = CASE WHEN $2 THEN now() ELSE NULL END
  RETURNING article_id
)
SELECT article_id FROM upserted;

-- name: MarkInitialSourceBacklogRead :many
WITH ranked AS (
  SELECT a.id,
         a.published_at,
         row_number() OVER (ORDER BY a.published_at DESC NULLS LAST, a.id DESC) AS rn
  FROM articles a
  WHERE a.source_id = $1
), upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT s.user_id, ranked.id, true, now()
  FROM ranked
  JOIN sources s ON s.id = $1 AND s.deleted_at IS NULL
  WHERE NOT (
    ranked.published_at >= now() - interval '7 days'
    OR ranked.rn <= 20
  )
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = true,
    last_read_at = now()
  RETURNING article_id
)
SELECT article_id FROM upserted;
