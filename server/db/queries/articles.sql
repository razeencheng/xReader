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
