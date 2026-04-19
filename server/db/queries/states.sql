-- name: SetArticleRead :exec
INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_read = $3,
  last_read_at = now();

-- name: SetArticleStarred :exec
INSERT INTO article_states (user_id, article_id, is_starred)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_starred = $3;

-- name: GetArticleState :one
SELECT * FROM article_states
WHERE user_id = $1 AND article_id = $2;

-- name: UpdateReadingProgress :exec
INSERT INTO article_states (user_id, article_id, reading_progress)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, article_id) DO UPDATE SET
  reading_progress = $3;

-- name: RecordStateChange :exec
INSERT INTO article_state_changes (user_id, article_id)
VALUES ($1, $2);

-- name: ListStateChangesSince :many
SELECT article_id, changed_at FROM article_state_changes
WHERE user_id = $1 AND changed_at > $2
ORDER BY changed_at ASC;

-- name: BatchMarkReadBySource :exec
INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
SELECT $1, a.id, true, now()
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.id = $2 AND s.user_id = $1
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_read = true,
  last_read_at = now();

-- name: BatchMarkReadToday :exec
INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
SELECT $1, a.id, true, now()
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.user_id = $1 AND a.published_at >= now() - interval '24 hours'
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_read = true,
  last_read_at = now();
