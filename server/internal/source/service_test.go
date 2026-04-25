package source

import (
	"context"
	"fmt"
	"testing"

	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/require"
)

type mockAdapter struct {
	validateErr  error
	validateMeta SourceMetadata
}

func (m *mockAdapter) Kind() string { return "rss" }
func (m *mockAdapter) Fetch(ctx context.Context, src Source) ([]RawItem, error) {
	return nil, nil
}
func (m *mockAdapter) Validate(ctx context.Context, url string) (SourceMetadata, error) {
	if m.validateErr != nil {
		return SourceMetadata{}, m.validateErr
	}
	return m.validateMeta, nil
}

func setupService(t *testing.T) (*SourceService, int64, func()) {
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)

	var userID int64
	err := pool.QueryRow(ctx,
		"INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id",
		1, "testuser", "user",
	).Scan(&userID)
	require.NoError(t, err)

	adapter := &mockAdapter{
		validateMeta: SourceMetadata{Title: "Test Feed", LanguageHint: "en"},
	}
	svc := NewSourceService(pool, adapter)

	return svc, userID, cleanup
}

func TestSourceService_Create_ListSuccess(t *testing.T) {
	svc, userID, cleanup := setupService(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	src, err := svc.Create(ctx, userID, "https://example.com/feed.xml", "")
	require.NoError(t, err)
	require.Equal(t, "Test Feed", src.Title)
	require.Equal(t, "rss", src.Kind)

	sources, err := svc.List(ctx, userID)
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.Equal(t, src.ID, sources[0].ID)
	require.EqualValues(t, 0, sources[0].UnreadCount)
}

func TestSourceService_List_TracksUnreadCounts(t *testing.T) {
	svc, userID, cleanup := setupService(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	src, err := svc.Create(ctx, userID, "https://example.com/feed.xml", "Technology")
	require.NoError(t, err)

	_, err = svc.pool.Exec(ctx, `
		INSERT INTO articles (source_id, external_id, link, normalized_link, title, language, content_html, content_text, published_at)
		VALUES
		  ($1, $2, $3, $4, $5, $6, $7, $8, now()),
		  ($1, $9, $10, $11, $12, $13, $14, $15, now())
	`,
		src.ID,
		"guid-1", "https://example.com/post-1", "https://example.com/post-1", "Post 1", "en", "<p>hi</p>", "hi",
		"guid-2", "https://example.com/post-2", "https://example.com/post-2", "Post 2", "en", "<p>bye</p>", "bye",
	)
	require.NoError(t, err)

	var articleID int64
	err = svc.pool.QueryRow(ctx, "SELECT id FROM articles WHERE normalized_link = $1", "https://example.com/post-1").Scan(&articleID)
	require.NoError(t, err)

	_, err = svc.pool.Exec(ctx, `
		INSERT INTO article_states (user_id, article_id, is_read, is_starred)
		VALUES ($1, $2, true, false)
	`, userID, articleID)
	require.NoError(t, err)

	sources, err := svc.List(ctx, userID)
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.EqualValues(t, 1, sources[0].UnreadCount)
	require.Equal(t, "Technology", sources[0].Category)
}

func TestSourceService_Create_DuplicateURL_ReturnsError(t *testing.T) {
	svc, userID, cleanup := setupService(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	_, err := svc.Create(ctx, userID, "https://example.com/feed.xml", "")
	require.NoError(t, err)

	_, err = svc.Create(ctx, userID, "https://example.com/feed.xml", "")
	require.Error(t, err)
}

func TestSourceService_Create_InvalidURL_ReturnsError(t *testing.T) {
	svc, userID, cleanup := setupService(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	_, err := svc.Create(ctx, userID, "://bad-url", "")
	require.Error(t, err)
	require.Contains(t, err.Error(), "discover feed")
}

func TestSourceService_Create_ValidateFails_ReturnsError(t *testing.T) {
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)
	t.Cleanup(cleanup)

	var userID int64
	err := pool.QueryRow(ctx,
		"INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id",
		1, "testuser", "user",
	).Scan(&userID)
	require.NoError(t, err)

	adapter := &mockAdapter{validateErr: fmt.Errorf("connection refused")}
	svc := NewSourceService(pool, adapter)

	_, err = svc.Create(ctx, userID, "https://example.com/feed.xml", "")
	require.Error(t, err)
	require.Contains(t, err.Error(), "discover feed")
}

func TestSourceService_Delete_OwnerOnly(t *testing.T) {
	svc, userID, cleanup := setupService(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	src, err := svc.Create(ctx, userID, "https://example.com/feed.xml", "")
	require.NoError(t, err)

	err = svc.Delete(ctx, userID+999, src.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found")

	err = svc.Delete(ctx, userID, src.ID)
	require.NoError(t, err)

	sources, err := svc.List(ctx, userID)
	require.NoError(t, err)
	require.Len(t, sources, 0)
}

func TestSourceService_Rename(t *testing.T) {
	svc, userID, cleanup := setupService(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	src, err := svc.Create(ctx, userID, "https://example.com/feed.xml", "")
	require.NoError(t, err)

	err = svc.Rename(ctx, userID, src.ID, "New Title")
	require.NoError(t, err)

	sources, err := svc.List(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, "New Title", sources[0].Title)
}
