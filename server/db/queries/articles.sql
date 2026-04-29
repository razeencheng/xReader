-- name: CreateArticle :one
INSERT INTO articles (
    source_id, external_id, link, normalized_link, title, language,
    content_html, content_text, author, published_at, fetched_at
)
VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11
)
RETURNING *;

-- name: GetArticleByID :one
SELECT * FROM articles
WHERE id = $1;

-- name: UpdateArticleContent :one
UPDATE articles
SET content_html = $2,
    content_text = $3
WHERE id = $1
RETURNING *;

-- name: ListArticlesBySource :many
SELECT * FROM articles
WHERE source_id = $1
ORDER BY published_at DESC;

-- name: ArticleExistsByNormalizedLink :one
SELECT EXISTS(
    SELECT 1 FROM articles
    WHERE source_id = $1 AND normalized_link = $2
) AS exists;

-- name: UpsertArticle :one
INSERT INTO articles (
    source_id, external_id, link, normalized_link, title, language,
    content_html, content_text, author, published_at, fetched_at
)
VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11
)
ON CONFLICT (source_id, normalized_link) DO NOTHING
RETURNING *;

-- name: SearchArticles :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.published_at,
       ts_headline('simple', a.title || ' ' || a.content_text, plainto_tsquery('simple', $2), 'MaxWords=20, MinWords=6') AS headline
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.user_id = $1
  AND a.search_vec @@ plainto_tsquery('simple', $2)
ORDER BY ts_rank(a.search_vec, plainto_tsquery('simple', $2)) DESC
LIMIT 100;

-- name: ListArticlesToday :many
SELECT a.* FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.user_id = $1
  AND a.published_at >= now() - interval '24 hours'
ORDER BY a.published_at DESC
LIMIT 100;

-- name: ListArticlesStream :many
SELECT a.* FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.user_id = $1
  AND ($2::timestamptz IS NULL OR a.published_at < $2)
ORDER BY a.published_at DESC, a.id DESC
LIMIT $3;

-- name: ListArticlesStarred :many
SELECT a.* FROM articles a
JOIN article_states st ON a.id = st.article_id AND st.user_id = $1
WHERE st.is_starred = true
ORDER BY a.published_at DESC
LIMIT 100;

-- name: ListArticlesTodayEnriched :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
       COALESCE(ai.title_translated, '') AS title_translated,
       COALESCE(ai.summary, '') AS summary,
       s.title AS source_title,
       COALESCE(st.is_read, false) AS is_read,
       COALESCE(st.is_starred, false) AS is_starred
FROM articles a
JOIN sources s ON a.source_id = s.id
LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = $2
LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
WHERE s.user_id = $1
  AND a.published_at >= now() - interval '24 hours'
ORDER BY a.published_at DESC
LIMIT 100;

-- name: ListArticlesStreamEnriched :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
       COALESCE(ai.title_translated, '') AS title_translated,
       COALESCE(ai.summary, '') AS summary,
       s.title AS source_title,
       COALESCE(st.is_read, false) AS is_read,
       COALESCE(st.is_starred, false) AS is_starred
FROM articles a
JOIN sources s ON a.source_id = s.id
LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = $3
LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
WHERE s.user_id = $1
  AND ($2::timestamptz IS NULL OR a.published_at < $2)
ORDER BY a.published_at DESC, a.id DESC
LIMIT $4;

-- name: ListArticlesStarredEnriched :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
       COALESCE(ai.title_translated, '') AS title_translated,
       COALESCE(ai.summary, '') AS summary,
       s.title AS source_title,
       st.is_read,
       st.is_starred
FROM articles a
JOIN article_states st ON a.id = st.article_id AND st.user_id = $1
LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = $2
JOIN sources s ON a.source_id = s.id
WHERE st.is_starred = true
ORDER BY a.published_at DESC
LIMIT 100;

-- name: ListArticlesBySourceEnriched :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
       COALESCE(ai.title_translated, '') AS title_translated,
       COALESCE(ai.summary, '') AS summary,
       s.title AS source_title,
       COALESCE(st.is_read, false) AS is_read,
       COALESCE(st.is_starred, false) AS is_starred
FROM articles a
JOIN sources s ON a.source_id = s.id AND s.user_id = @user_id
LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = @target_language
LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @user_id
WHERE a.source_id = @source_id
ORDER BY a.published_at DESC;

-- name: ListUnreadArticlesEnriched :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
       COALESCE(ai.title_translated, '') AS title_translated,
       COALESCE(ai.summary, '') AS summary,
       s.title AS source_title,
       COALESCE(st.is_read, false) AS is_read,
       COALESCE(st.is_starred, false) AS is_starred
FROM articles a
JOIN sources s ON a.source_id = s.id
LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = $2
LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
WHERE s.user_id = $1
  AND (st.is_read IS NULL OR st.is_read = false)
ORDER BY a.published_at DESC
LIMIT 200;
