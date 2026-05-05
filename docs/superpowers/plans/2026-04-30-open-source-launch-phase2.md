# Phase 2: Feature Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Fever API compatibility (third-party client support), enhance full-text search with CJK bigram support, and fix critical UI/UX issues from the audit.

**Architecture:** Fever API as a new `internal/fever/` package reusing existing services. FTS enhancement via Postgres bigram function (no plugins). UI fixes are targeted CSS/component changes.

**Tech Stack:** Go, Gin, pgx, sqlc, Postgres FTS, Tailwind CSS

**Design spec:** `docs/superpowers/specs/2026-04-30-xreader-open-source-launch-design.md` §5

**Depends on:** Phase 1 completed (single binary architecture)

---

## Task 1: Fever API — Database Migration

Add `fever_api_key` column to the users table.

**Files:**
- Create: `server/db/migrations/010_fever_api_key.up.sql`
- Create: `server/db/migrations/010_fever_api_key.down.sql`

### Steps

- [ ] **Step 1: Create migration**

```sql
-- server/db/migrations/010_fever_api_key.up.sql
-- Stores SHA-256(MD5(username:password)), a 64-char hex string.
ALTER TABLE users ADD COLUMN fever_api_key CHAR(64);
CREATE INDEX idx_users_fever_api_key ON users (fever_api_key) WHERE fever_api_key IS NOT NULL;
```

```sql
-- server/db/migrations/010_fever_api_key.down.sql
DROP INDEX IF EXISTS idx_users_fever_api_key;
ALTER TABLE users DROP COLUMN IF EXISTS fever_api_key;
```

- [ ] **Step 2: Add sqlc queries**

Add to `server/db/queries/users.sql`:

```sql
-- name: SetFeverAPIKey :exec
-- Stores SHA-256 hash of the Fever API key (which is itself MD5(user:pass)).
-- The raw MD5 key is never stored; on auth we hash the submitted key and compare.
UPDATE users SET fever_api_key = $2 WHERE id = $1;

-- name: GetUserByFeverKey :one
-- fever_api_key column stores SHA-256(MD5(username:password)), not the raw MD5.
SELECT id, github_username, native_language, role
FROM users
WHERE fever_api_key = $1;
```

- [ ] **Step 3: Regenerate sqlc**

Run: `make sqlc-generate`
Expected: New Go code generated in `server/db/gen/`

- [ ] **Step 4: Run migration locally**

Run: `make migrate-up`
Expected: Migration 010 applied

- [ ] **Step 5: Commit**

```
feat(fever): add fever_api_key column to users table

Indexed CHAR(64) column for Fever API authentication. Stores
SHA-256(MD5(username:password)) — the raw Fever key is never
persisted, only shown once to the user after generation.
```

---

## Task 2: Fever API — Core Handler

Implement the Fever API endpoints.

**Files:**
- Create: `server/internal/fever/handler.go`
- Create: `server/internal/fever/handler_test.go`

### Steps

- [ ] **Step 1: Write failing test for Fever auth**

```go
// server/internal/fever/handler_test.go
package fever_test

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jin/xreader-web/internal/fever"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupFeverTest(t *testing.T) (*gin.Engine, func()) {
	t.Helper()
	pool, cleanup := testutil.SetupTestDB(t, context.Background())

	// Create a test user with fever_api_key
	// Fever protocol: api_key = MD5(username:password)
	// Database stores SHA-256(api_key)
	rawKey := fmt.Sprintf("%x", md5.Sum([]byte("testuser:testpass")))
	hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(rawKey)))
	_, err := pool.Exec(context.Background(),
		`INSERT INTO auth_allowlist (github_username) VALUES ('testuser')`)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(),
		`INSERT INTO users (github_id, github_username, role, fever_api_key)
		 VALUES (1, 'testuser', 'user', $1)`, hashedKey)
	require.NoError(t, err)

	h := fever.NewHandler(pool)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/fever/", h.Handle)

	return r, cleanup
}

func TestFever_AuthSuccess(t *testing.T) {
	r, cleanup := setupFeverTest(t)
	defer cleanup()

	apiKey := fmt.Sprintf("%x", md5.Sum([]byte("testuser:testpass")))
	form := url.Values{"api_key": {apiKey}}
	req := httptest.NewRequest("POST", "/fever/?api", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"auth":1`)
}

func TestFever_AuthFailure(t *testing.T) {
	r, cleanup := setupFeverTest(t)
	defer cleanup()

	form := url.Values{"api_key": {"wrong-key"}}
	req := httptest.NewRequest("POST", "/fever/?api", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"auth":0`)
}

func TestFever_Feeds(t *testing.T) {
	r, cleanup := setupFeverTest(t)
	defer cleanup()

	apiKey := fmt.Sprintf("%x", md5.Sum([]byte("testuser:testpass")))
	form := url.Values{"api_key": {apiKey}}
	req := httptest.NewRequest("POST", "/fever/?api&feeds", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"feeds"`)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/fever/... -v -count=1`
Expected: FAIL — package not found

- [ ] **Step 3: Implement Fever handler**

```go
// server/internal/fever/handler.go
package fever

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool *pgxpool.Pool
}

func NewHandler(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

type feverUser struct {
	ID             int64
	GitHubUsername  string
	NativeLanguage string
}

func (h *Handler) Handle(c *gin.Context) {
	apiKey := c.PostForm("api_key")
	user := h.authenticate(c.Request.Context(), apiKey)

	resp := gin.H{
		"api_version":    3,
		"auth":           boolToInt(user != nil),
		"last_refreshed_on_time": time.Now().Unix(),
	}

	if user == nil {
		c.JSON(http.StatusOK, resp)
		return
	}

	q := c.Request.URL.Query()

	if _, ok := q["feeds"]; ok {
		feeds, groups, feedGroups := h.getFeeds(c.Request.Context(), user.ID)
		resp["feeds"] = feeds
		resp["feeds_groups"] = feedGroups
		if _, ok := q["groups"]; ok {
			resp["groups"] = groups
		}
	}

	if _, ok := q["groups"]; ok {
		if _, exists := resp["groups"]; !exists {
			_, groups, _ := h.getFeeds(c.Request.Context(), user.ID)
			resp["groups"] = groups
		}
	}

	if _, ok := q["favicons"]; ok {
		resp["favicons"] = h.getFavicons(c.Request.Context(), user.ID)
	}

	if _, ok := q["items"]; ok {
		resp["items"], resp["total_items"] = h.getItems(c, user.ID)
	}

	if _, ok := q["unread_item_ids"]; ok {
		resp["unread_item_ids"] = h.getUnreadIDs(c.Request.Context(), user.ID)
	}

	if _, ok := q["saved_item_ids"]; ok {
		resp["saved_item_ids"] = h.getSavedIDs(c.Request.Context(), user.ID)
	}

	if mark := c.PostForm("mark"); mark != "" {
		h.handleMark(c, user.ID, mark)
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) authenticate(ctx context.Context, apiKey string) *feverUser {
	if apiKey == "" {
		return nil
	}
	// Database stores SHA-256(api_key), not the raw MD5.
	// Hash the submitted key before lookup.
	hashed := hashFeverKey(apiKey)
	var u feverUser
	err := h.pool.QueryRow(ctx,
		`SELECT id, github_username, COALESCE(native_language, 'en-US')
		 FROM users WHERE fever_api_key = $1`, hashed).
		Scan(&u.ID, &u.GitHubUsername, &u.NativeLanguage)
	if err != nil {
		return nil
	}
	return &u
}

func hashFeverKey(apiKey string) string {
	h := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(h[:])
}

func (h *Handler) getFeeds(ctx context.Context, userID int64) ([]gin.H, []gin.H, []gin.H) {
	rows, err := h.pool.Query(ctx,
		`SELECT id, COALESCE(title, ''), url, COALESCE(icon_url, ''), COALESCE(category, 'General')
		 FROM sources WHERE user_id = $1 AND deleted_at IS NULL
		 ORDER BY id`, userID)
	if err != nil {
		return nil, nil, nil
	}
	defer rows.Close()

	var feeds []gin.H
	categoryMap := make(map[string]int64)
	var nextGroupID int64 = 1
	var feedGroups []gin.H

	for rows.Next() {
		var id int64
		var title, feedURL, iconURL, category string
		rows.Scan(&id, &title, &feedURL, &iconURL, &category)

		groupID, exists := categoryMap[category]
		if !exists {
			groupID = nextGroupID
			categoryMap[category] = groupID
			nextGroupID++
		}

		feeds = append(feeds, gin.H{
			"id":            id,
			"favicon_id":    id,
			"title":         title,
			"url":           feedURL,
			"site_url":      feedURL,
			"is_spark":      0,
			"last_updated_on_time": time.Now().Unix(),
		})
		feedGroups = append(feedGroups, gin.H{
			"group_id": groupID,
			"feed_ids": strconv.FormatInt(id, 10),
		})
	}

	var groups []gin.H
	for name, id := range categoryMap {
		groups = append(groups, gin.H{"id": id, "title": name})
	}

	return feeds, groups, feedGroups
}

func (h *Handler) getFavicons(ctx context.Context, userID int64) []gin.H {
	rows, err := h.pool.Query(ctx,
		`SELECT id, COALESCE(icon_url, '') FROM sources
		 WHERE user_id = $1 AND deleted_at IS NULL`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var favicons []gin.H
	for rows.Next() {
		var id int64
		var iconURL string
		rows.Scan(&id, &iconURL)
		favicons = append(favicons, gin.H{
			"id":   id,
			"data": "image/gif;base64,R0lGODlhAQABAIAAAObm5gAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
		})
	}
	return favicons
}

func (h *Handler) getItems(c *gin.Context, userID int64) ([]gin.H, int) {
	sinceID, _ := strconv.ParseInt(c.Query("since_id"), 10, 64)
	maxID, _ := strconv.ParseInt(c.Query("max_id"), 10, 64)

	query := `SELECT a.id, a.source_id, COALESCE(a.title, ''), COALESCE(a.author, ''),
		COALESCE(a.content_html, a.content_text, ''), a.link,
		COALESCE(EXTRACT(EPOCH FROM a.published_at)::bigint, 0),
		COALESCE(s.is_read, false), COALESCE(s.is_starred, false)
		FROM articles a
		JOIN sources src ON a.source_id = src.id AND src.user_id = $1 AND src.deleted_at IS NULL
		LEFT JOIN article_states s ON s.article_id = a.id AND s.user_id = $1
		WHERE 1=1`
	args := []any{userID}

	if sinceID > 0 {
		args = append(args, sinceID)
		query += ` AND a.id > $` + strconv.Itoa(len(args))
	}
	if maxID > 0 {
		args = append(args, maxID)
		query += ` AND a.id < $` + strconv.Itoa(len(args))
	}
	query += ` ORDER BY a.id DESC LIMIT 50`

	rows, err := h.pool.Query(c.Request.Context(), query, args...)
	if err != nil {
		return nil, 0
	}
	defer rows.Close()

	var items []gin.H
	for rows.Next() {
		var id, sourceID, publishedAt int64
		var title, author, html, link string
		var isRead, isStarred bool
		rows.Scan(&id, &sourceID, &title, &author, &html, &link, &publishedAt, &isRead, &isStarred)
		items = append(items, gin.H{
			"id":         id,
			"feed_id":    sourceID,
			"title":      title,
			"author":     author,
			"html":       html,
			"url":        link,
			"is_saved":   boolToInt(isStarred),
			"is_read":    boolToInt(isRead),
			"created_on_time": publishedAt,
		})
	}

	var total int
	h.pool.QueryRow(c.Request.Context(),
		`SELECT COUNT(*) FROM articles a JOIN sources s ON a.source_id = s.id
		 WHERE s.user_id = $1 AND s.deleted_at IS NULL`, userID).Scan(&total)

	return items, total
}

func (h *Handler) getUnreadIDs(ctx context.Context, userID int64) string {
	rows, err := h.pool.Query(ctx,
		`SELECT a.id FROM articles a
		 JOIN sources s ON a.source_id = s.id AND s.user_id = $1 AND s.deleted_at IS NULL
		 LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
		 WHERE COALESCE(st.is_read, false) = false`, userID)
	if err != nil {
		return ""
	}
	defer rows.Close()
	return collectIDs(rows)
}

func (h *Handler) getSavedIDs(ctx context.Context, userID int64) string {
	rows, err := h.pool.Query(ctx,
		`SELECT a.id FROM articles a
		 JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
		 WHERE st.is_starred = true`, userID)
	if err != nil {
		return ""
	}
	defer rows.Close()
	return collectIDs(rows)
}

func (h *Handler) handleMark(c *gin.Context, userID int64, mark string) {
	ctx := c.Request.Context()
	switch mark {
	case "item":
		itemID, _ := strconv.ParseInt(c.PostForm("id"), 10, 64)
		as := c.PostForm("as")
		switch as {
		case "read":
			h.pool.Exec(ctx, `INSERT INTO article_states (user_id, article_id, is_read) VALUES ($1, $2, true)
				ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = true`, userID, itemID)
		case "unread":
			h.pool.Exec(ctx, `INSERT INTO article_states (user_id, article_id, is_read) VALUES ($1, $2, false)
				ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = false`, userID, itemID)
		case "saved":
			h.pool.Exec(ctx, `INSERT INTO article_states (user_id, article_id, is_starred) VALUES ($1, $2, true)
				ON CONFLICT (user_id, article_id) DO UPDATE SET is_starred = true`, userID, itemID)
		case "unsaved":
			h.pool.Exec(ctx, `INSERT INTO article_states (user_id, article_id, is_starred) VALUES ($1, $2, false)
				ON CONFLICT (user_id, article_id) DO UPDATE SET is_starred = false`, userID, itemID)
		}
	case "feed":
		feedID, _ := strconv.ParseInt(c.PostForm("id"), 10, 64)
		before, _ := strconv.ParseInt(c.PostForm("before"), 10, 64)
		beforeTime := time.Unix(before, 0)
		h.pool.Exec(ctx,
			`INSERT INTO article_states (user_id, article_id, is_read)
			 SELECT $1, a.id, true FROM articles a
			 WHERE a.source_id = $2 AND a.published_at < $3
			 ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = true`,
			userID, feedID, beforeTime)
	case "group":
		before, _ := strconv.ParseInt(c.PostForm("before"), 10, 64)
		beforeTime := time.Unix(before, 0)
		h.pool.Exec(ctx,
			`INSERT INTO article_states (user_id, article_id, is_read)
			 SELECT $1, a.id, true FROM articles a
			 JOIN sources s ON a.source_id = s.id AND s.user_id = $1 AND s.deleted_at IS NULL
			 WHERE a.published_at < $2
			 ON CONFLICT (user_id, article_id) DO UPDATE SET is_read = true`,
			userID, beforeTime)
	}
}

func collectIDs(rows pgx.Rows) string {
	var ids []string
	for rows.Next() {
		var id int64
		rows.Scan(&id)
		ids = append(ids, strconv.FormatInt(id, 10))
	}
	return strings.Join(ids, ",")
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && go test ./internal/fever/... -v -count=1`
Expected: All tests PASS

- [ ] **Step 5: Wire Fever route into router**

In `server/internal/platform/router.go`:

```go
feverH := fever.NewHandler(deps.Pool)
router.POST("/fever/", feverH.Handle)
```

- [ ] **Step 6: Commit**

```
feat(fever): implement Fever API compatibility layer

Full Fever API implementation enabling third-party RSS clients
(Reeder, NetNewsWire, etc.) to connect. Supports feeds, groups,
items, unread/saved IDs, and mark read/unread/saved/unsaved.
Auth via SHA-256 hash of the Fever api_key, stored in users.fever_api_key.
```

---

## Task 3: Fever API — Settings UI

Add Fever password configuration to the Settings page.

**Files:**
- Modify: `web/src/app/(app)/settings/page.tsx`
- Add sqlc query for setting fever key

### Steps

- [ ] **Step 1: Add backend endpoint for setting Fever password**

Add to the user handler (`server/internal/user/handler.go`) or create a new endpoint:

```go
// POST /api/users/me/fever
func (h *Handler) SetFeverPassword(c *gin.Context) {
    user := middleware.GetUser(c)
    var req struct {
        Password string `json:"password" binding:"required,min=6"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    // Fever protocol: api_key = MD5(username:password)
    apiKey := fmt.Sprintf("%x", md5.Sum([]byte(user.GitHubUsername+":"+req.Password)))
    // Store SHA-256(api_key) in database — never store the raw MD5
    hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(apiKey)))
    _, err := h.pool.Exec(c.Request.Context(),
        `UPDATE users SET fever_api_key = $1 WHERE id = $2`, hashedKey, user.ID)
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to save"})
        return
    }
    // Return the raw api_key to the user (they need it for client config)
    // It won't be stored or retrievable after this response
    c.JSON(200, gin.H{
        "status":    "ok",
        "api_key":   apiKey,
        "fever_url": "/fever/",
    })
}
```

Register route: `authed.POST("/api/users/me/fever", userH.SetFeverPassword)`

- [ ] **Step 2: Add Fever section to Settings page**

Add a "Third-party clients" card to `web/src/app/(app)/settings/page.tsx` with:
- Password input
- "Generate API Key" button
- Display the Fever URL and connection instructions after generation

- [ ] **Step 3: Test with a Fever-compatible client**

Configure Reeder or NetNewsWire:
- Server: `http://your-host:3000/fever/`
- Username: GitHub username
- Password: the password you set

Verify: feeds sync, articles load, mark read/starred works.

- [ ] **Step 4: Commit**

```
feat(fever): add Fever password settings UI

Settings page now has a "Third-party clients" section where users
can set a Fever API password. Shows connection URL and instructions
for Reeder, NetNewsWire, and other Fever-compatible clients.
```

---

## Task 4: Full-Text Search — CJK Bigram Enhancement

The database already has `search_vec` tsvector + GIN index + `SearchArticles` query (migration 003). Enhance with bigram tokenization for CJK text.

**Files:**
- Create: `server/db/migrations/011_fts_bigram.up.sql`
- Create: `server/db/migrations/011_fts_bigram.down.sql`
- Modify: `server/db/queries/articles.sql` (update SearchArticles if needed)

### Steps

- [ ] **Step 1: Check existing FTS implementation**

Run: `cd server && grep -n "search_vec\|SearchArticles\|to_tsvector" db/queries/articles.sql db/migrations/003*.sql`

Understand the current tokenization approach, then decide what needs to change for CJK.

- [ ] **Step 2: Create bigram migration**

```sql
-- server/db/migrations/011_fts_bigram.up.sql

-- Function to generate bigrams from CJK text
CREATE OR REPLACE FUNCTION cjk_bigrams(input text) RETURNS tsvector AS $$
DECLARE
    result tsvector := ''::tsvector;
    clean text;
    i integer;
    ch text;
    bigram text;
BEGIN
    clean := regexp_replace(input, '[[:space:][:punct:]]+', ' ', 'g');
    FOR i IN 1..length(clean)-1 LOOP
        ch := substr(clean, i, 1);
        -- Check if character is CJK (Unicode ranges)
        IF ascii(ch) > 11903 THEN
            bigram := substr(clean, i, 2);
            IF length(bigram) = 2 AND ascii(substr(bigram, 2, 1)) > 11903 THEN
                result := result || to_tsvector('simple', bigram);
            END IF;
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update the search_vec trigger to include CJK bigrams
CREATE OR REPLACE FUNCTION articles_search_vec_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vec :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(cjk_bigrams(COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content_text, '')), 'B') ||
        setweight(cjk_bigrams(LEFT(COALESCE(NEW.content_text, ''), 5000)), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rebuild existing search vectors
UPDATE articles SET search_vec =
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(cjk_bigrams(COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(content_text, '')), 'B') ||
    setweight(cjk_bigrams(LEFT(COALESCE(content_text, ''), 5000)), 'B');
```

```sql
-- server/db/migrations/011_fts_bigram.down.sql
DROP FUNCTION IF EXISTS cjk_tsquery(text);
DROP FUNCTION IF EXISTS cjk_bigrams(text);
-- Restore original search_vec trigger from migration 003
-- (copy the original articles_search_vec_update function definition here)
```

- [ ] **Step 3: Add query-side bigram function**

The index stores bigrams, but the query must ALSO generate bigrams from the search term. Otherwise `plainto_tsquery('simple', '量子加密')` produces a single lexeme that won't match the bigram index.

```sql
-- Add to the same migration 011_fts_bigram.up.sql:

-- Generate a tsquery from CJK text using bigrams (matching the index)
CREATE OR REPLACE FUNCTION cjk_tsquery(input text) RETURNS tsquery AS $$
DECLARE
    result tsquery;
    clean text;
    i integer;
    bigram text;
    bq tsquery;
BEGIN
    clean := regexp_replace(input, '[[:space:][:punct:]]+', ' ', 'g');
    result := NULL;
    FOR i IN 1..length(clean)-1 LOOP
        IF ascii(substr(clean, i, 1)) > 11903 AND ascii(substr(clean, i+1, 1)) > 11903 THEN
            bigram := substr(clean, i, 2);
            bq := to_tsquery('simple', bigram);
            IF result IS NULL THEN
                result := bq;
            ELSE
                result := result && bq;
            END IF;
        END IF;
    END LOOP;
    RETURN COALESCE(result, plainto_tsquery('simple', input));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

- [ ] **Step 4: Update SearchArticles query to use bigram query**

Update `server/db/queries/articles.sql` — the `SearchArticles` query should combine English tsquery with CJK bigram tsquery:

```sql
-- name: SearchArticles :many
-- Combines english FTS for Latin text with CJK bigram matching.
SELECT id, source_id, title, link, published_at, language,
       ts_headline('english', COALESCE(title,''), query) as headline
FROM articles,
     (SELECT plainto_tsquery('english', @q::text) || cjk_tsquery(@q::text) AS query) q
WHERE search_vec @@ q.query
ORDER BY ts_rank(search_vec, q.query) DESC
LIMIT @lim::int;
```

Run: `make sqlc-generate`

- [ ] **Step 5: Add regression test for CJK search**

```go
// In server/internal/article/ or a test file
func TestSearchArticles_CJK(t *testing.T) {
    pool, cleanup := testutil.SetupTestDB(t, context.Background())
    defer cleanup()

    // Insert an article with Chinese title
    pool.Exec(context.Background(),
        `INSERT INTO sources (id, user_id, kind, url, normalized_url, title)
         VALUES (1, 1, 'rss', 'https://example.com/feed', 'https://example.com/feed', 'Test')`)
    pool.Exec(context.Background(),
        `INSERT INTO articles (source_id, external_id, link, normalized_link, title, content_text, published_at, fetched_at)
         VALUES (1, 'ext1', 'https://example.com/1', 'https://example.com/1',
                 '量子加密技术的最新进展', '这是一篇关于量子计算的文章', NOW(), NOW())`)

    // Search for "量子加密" — should match via bigrams
    var count int
    err := pool.QueryRow(context.Background(),
        `SELECT COUNT(*) FROM articles,
         (SELECT plainto_tsquery('english', '量子加密') || cjk_tsquery('量子加密') AS query) q
         WHERE search_vec @@ q.query`).Scan(&count)
    require.NoError(t, err)
    assert.Equal(t, 1, count, "CJK bigram search should find the article")
}
```

- [ ] **Step 6: Run migration and test**

```bash
make migrate-up
cd server && go test ./... -run TestSearch -v -count=1
```

Test CJK search via API:
```bash
curl "http://localhost:3000/api/articles?q=量子加密&tab=stream" -H "Cookie: xreader_session=..."
```

Expected: Articles containing "量子加密" appear in results.

- [ ] **Step 7: Add search bar to frontend feed list (if not already present)**

Check if the feed list already has a search input wired to the `q` parameter. If not, add one in `web/src/components/feed/FeedList.tsx` — a simple text input that sets the `q` query parameter on the articles API call.

The `/` keyboard shortcut should focus this search input (already wired in `useGlobalShortcuts`).

- [ ] **Step 5: Commit**

```
feat(search): add CJK bigram tokenization for full-text search

Postgres FTS now supports Chinese/Japanese/Korean search via
bigram tokenization. No external plugins required. Search vectors
rebuilt for existing articles. English search continues to use
the built-in 'english' text search configuration.
```

---

## Task 5: UI/UX Fixes — P0

Fix critical issues from the 2026-04-30 audit.

**Files:**
- Modify: `web/src/app/(app)/admin/page.tsx` (Invalid Date)
- Modify: `web/src/components/reader/PrevNextBar.tsx` (hide-mobile class)

### Steps

- [ ] **Step 1: Fix Invalid Date in Admin page**

Read `web/src/app/(app)/admin/page.tsx`, find where `added_at` / `created_at` is formatted. The API likely returns a date string that `new Date()` can't parse, or the field is null/undefined.

Fix: add a safe date formatting function:

```typescript
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}
```

Replace the raw `new Date(item.added_at).toLocaleString()` with `formatDate(item.added_at)`.

- [ ] **Step 2: Fix undefined `hide-mobile` CSS class**

In `web/src/components/reader/PrevNextBar.tsx`, replace `hide-mobile` with Tailwind's `hidden md:inline-flex`:

```
// Find: hide-mobile
// Replace with: hidden md:inline-flex
```

- [ ] **Step 3: Verify fixes**

Run: `cd web && pnpm build && pnpm lint`
Expected: No errors

- [ ] **Step 4: Commit**

```
fix(web): resolve Invalid Date display and undefined CSS class

Admin page now safely handles null/invalid date values.
PrevNextBar keyboard hints use Tailwind responsive classes
instead of undefined 'hide-mobile' class.
```

---

## Task 6: UI/UX Fixes — P1 (Touch Targets + Safe Area)

Fix important mobile UX issues.

**Files:**
- Modify: `web/src/components/feed/FeedRowComfortable.tsx`
- Modify: `web/src/components/feed/FeedRowCompact.tsx`
- Modify: `web/src/components/reader/HighlightToolbar.tsx`
- Modify: `web/src/components/reader/TweaksPanel.tsx`
- Modify: `web/src/components/reader/PrevNextBar.tsx`
- Modify: `web/src/components/layout/KeyboardShortcutsModal.tsx`

### Steps

- [ ] **Step 1: Increase feed row button touch targets**

In `FeedRowComfortable.tsx` and `FeedRowCompact.tsx`:
- "Mark read" / "Undo" buttons: change `py-[3px]` to `py-2` and add `min-h-[44px]`
- Star button: change `p-[3px]` to `p-2.5` to achieve 44px touch target

- [ ] **Step 2: Increase highlight toolbar touch targets**

In `HighlightToolbar.tsx`:
- Icon buttons: change `p-2` to `p-3` (44px total)
- Text buttons (cancel/save): add `min-h-[44px] px-4`

- [ ] **Step 3: Add safe-area-inset to fixed-position elements**

In `TweaksPanel.tsx`:
```
// Change: fixed bottom-5 right-5
// To: fixed bottom-[max(20px,env(safe-area-inset-bottom,0px)+12px)] right-5
```

In `PrevNextBar.tsx`:
```
// Add safe-area padding to the bottom bar
// Change: bottom-0 or bottom-N
// To: pb-[env(safe-area-inset-bottom,0px)]
```

In `KeyboardShortcutsModal.tsx`:
```
// Change: fixed bottom-4 left-4
// To: fixed bottom-[max(16px,env(safe-area-inset-bottom,0px)+8px)] left-4
```

- [ ] **Step 4: Fix dark mode hardcoded colors**

In `KeyboardShortcutsModal.tsx`:
```
// Replace: bg-[rgba(248,244,238,0.92)]
// With: bg-[color-mix(in_srgb,var(--bg-body)_92%,transparent)] backdrop-blur-sm
```

In `PrevNextBar.tsx`:
```
// Replace: bg-[rgba(248,244,238,0.92)]  
// With: glass-effect class (already defined in globals.css)

// Replace: bg-[rgba(255,255,255,0.86)]
// With: bg-[color-mix(in_srgb,var(--bg-panel)_86%,transparent)]
```

In `NextUpCard.tsx`:
```
// Replace hardcoded white gradient with CSS variable-based gradient
```

In `SourceExcerptNotice.tsx`:
```
// Replace: text-[#b42318]
// With: text-[var(--text-error)]
```

- [ ] **Step 5: Test on mobile viewport**

Run: `cd web && pnpm dev`
Test in browser devtools at 375px width:
- Feed rows: buttons are easily tappable
- Highlight toolbar: buttons are 44px+
- TweaksPanel: not overlapping home indicator
- Dark mode: no white patches

- [ ] **Step 6: Commit**

```
fix(web): improve mobile touch targets, safe-area, and dark mode

Feed row buttons, highlight toolbar, and tweaks panel now meet
44px minimum touch target. Fixed-position elements respect iOS
safe-area-inset-bottom. Six hardcoded color values replaced with
CSS variables for proper dark mode support.
```

---

## Task 7: End-to-End Verification

### Steps

- [ ] **Step 1: Full test suite**

```bash
cd server && go test ./... -count=1
cd web && pnpm vitest run && pnpm lint
```

- [ ] **Step 2: Fever API verification with real client**

Test with Reeder or NetNewsWire — verify feeds sync, articles load, mark read/starred.

- [ ] **Step 3: Search verification**

Test CJK search (Chinese article titles) and English search through the web UI.

- [ ] **Step 4: UI verification on mobile**

Use browser devtools at 375px — verify all P0/P1 fixes are visible and functional.
