package article

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/razeencheng/xreader/db/gen"
	statepkg "github.com/razeencheng/xreader/internal/state"
)

var errNotFound = errors.New("not found")
var errForbidden = errors.New("forbidden")

type ArticleService struct {
	pool           *pgxpool.Pool
	queries        *gen.Queries
	originalLoader func(context.Context, string) (OriginalContent, error)
	stateMutations *statepkg.Service
}

func NewArticleService(pool *pgxpool.Pool) *ArticleService {
	return &ArticleService{pool: pool, queries: gen.New(pool), originalLoader: fetchOriginalContent, stateMutations: statepkg.NewService(pool)}
}

type EnrichedArticle struct {
	ID              int64
	SourceID        int64
	Title           string
	TitleTranslated string
	Summary         string
	SourceTitle     string
	Link            string
	Language        string
	Author          pgtype.Text
	PublishedAt     pgtype.Timestamptz
	ContentText     string
	IsRead          bool
	IsStarred       bool
}

type ArticleReadCounts struct {
	Unread int64
	All    int64
	Read   int64
}

type EnrichedArticlePage struct {
	Items      []EnrichedArticle
	NextCursor string
}

func (s *ArticleService) ListEnrichedPage(ctx context.Context, userID int64, tab string, sourceID *int64, lang, readFilter string, cursor *ArticleCursor, limit int32) (EnrichedArticlePage, error) {
	cursorTime, cursorID := articleCursorParams(cursor)
	fetchLimit := clampLimit(limit) + 1
	filter := normalizeReadFilter(readFilter)
	items := make([]EnrichedArticle, 0, fetchLimit)

	if sourceID != nil {
		rows, err := s.queries.ListArticlesBySourceEnriched(ctx, gen.ListArticlesBySourceEnrichedParams{
			UserID: userID, TargetLanguage: lang, SourceID: *sourceID, ReadFilter: filter,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
		return finishEnrichedPage(items, limit), nil
	}

	switch tab {
	case "", "today":
		rows, err := s.queries.ListArticlesTodayEnriched(ctx, gen.ListArticlesTodayEnrichedParams{
			UserID: userID, TargetLanguage: lang, ReadFilter: filter,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
	case "stream", "all":
		rows, err := s.queries.ListArticlesStreamEnriched(ctx, gen.ListArticlesStreamEnrichedParams{
			UserID: userID, TargetLanguage: lang, ReadFilter: filter,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
	case "starred":
		rows, err := s.queries.ListArticlesStarredEnriched(ctx, gen.ListArticlesStarredEnrichedParams{
			UserID: userID, TargetLanguage: lang,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
	default:
		return EnrichedArticlePage{}, fmt.Errorf("invalid tab: %s", tab)
	}
	return finishEnrichedPage(items, limit), nil
}

func (s *ArticleService) GuestListEnrichedPage(ctx context.Context, stateOwnerID, contentOwnerID int64, tab string, sourceID *int64, lang, readFilter string, cursor *ArticleCursor, limit int32) (EnrichedArticlePage, error) {
	cursorTime, cursorID := articleCursorParams(cursor)
	fetchLimit := clampLimit(limit) + 1
	filter := normalizeReadFilter(readFilter)
	items := make([]EnrichedArticle, 0, fetchLimit)

	if sourceID != nil {
		rows, err := s.queries.GuestListArticlesBySourceEnriched(ctx, gen.GuestListArticlesBySourceEnrichedParams{
			TargetLanguage: lang, StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID,
			SourceID: *sourceID, ReadFilter: filter, CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
		return finishEnrichedPage(items, limit), nil
	}

	switch tab {
	case "", "today":
		rows, err := s.queries.GuestListArticlesTodayEnriched(ctx, gen.GuestListArticlesTodayEnrichedParams{
			TargetLanguage: lang, StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, ReadFilter: filter,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
	case "stream", "all":
		rows, err := s.queries.GuestListArticlesStreamEnriched(ctx, gen.GuestListArticlesStreamEnrichedParams{
			TargetLanguage: lang, StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, ReadFilter: filter,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
	case "starred":
		rows, err := s.queries.GuestListArticlesStarredEnriched(ctx, gen.GuestListArticlesStarredEnrichedParams{
			TargetLanguage: lang, StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID,
			CursorPublishedAt: cursorTime, CursorArticleID: cursorID, Lim: fetchLimit,
		})
		if err != nil {
			return EnrichedArticlePage{}, err
		}
		for _, r := range rows {
			items = append(items, enrichedArticle(r.ID, r.SourceID, r.Title, r.TitleTranslated, r.Summary, r.SourceTitle, r.Link, r.Language, r.Author, r.PublishedAt, r.ContentText, r.IsRead, r.IsStarred))
		}
	default:
		return EnrichedArticlePage{}, fmt.Errorf("invalid tab: %s", tab)
	}
	return finishEnrichedPage(items, limit), nil
}

func enrichedArticle(id, sourceID int64, title, titleTranslated, summary, sourceTitle, link, language string, author pgtype.Text, publishedAt pgtype.Timestamptz, contentText string, isRead, isStarred bool) EnrichedArticle {
	return EnrichedArticle{ID: id, SourceID: sourceID, Title: title, TitleTranslated: titleTranslated, Summary: summary, SourceTitle: sourceTitle, Link: link, Language: language, Author: author, PublishedAt: publishedAt, ContentText: contentText, IsRead: isRead, IsStarred: isStarred}
}

func finishEnrichedPage(items []EnrichedArticle, limit int32) EnrichedArticlePage {
	publicLimit := clampLimit(limit)
	page := EnrichedArticlePage{Items: items}
	if len(items) > int(publicLimit) {
		page.Items = items[:publicLimit]
		last := page.Items[len(page.Items)-1]
		if last.PublishedAt.Valid {
			page.NextCursor = encodeArticleCursor(ArticleCursor{PublishedAt: last.PublishedAt.Time, ArticleID: last.ID})
		}
	}
	return page
}

func articleCursorParams(cursor *ArticleCursor) (pgtype.Timestamptz, int64) {
	if cursor == nil {
		return pgtype.Timestamptz{}, 0
	}
	return pgtype.Timestamptz{Time: cursor.PublishedAt.UTC(), Valid: true}, cursor.ArticleID
}

func (s *ArticleService) ListToday(ctx context.Context, userID int64) ([]gen.Article, error) {
	return s.queries.ListArticlesToday(ctx, userID)
}

func (s *ArticleService) ListTodayEnriched(ctx context.Context, userID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.ListArticlesTodayEnriched(ctx, gen.ListArticlesTodayEnrichedParams{
		UserID: userID, TargetLanguage: lang, ReadFilter: normalizeReadFilter(readFilter), Lim: 100,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) ListStream(ctx context.Context, userID int64, cursor *time.Time, limit int32) ([]gen.Article, error) {
	return s.queries.ListArticlesStream(ctx, gen.ListArticlesStreamParams{
		UserID:  userID,
		Column2: timestamptzOrNull(cursor),
		Limit:   clampLimit(limit),
	})
}

func (s *ArticleService) ListStreamEnriched(ctx context.Context, userID int64, cursor *time.Time, limit int32, lang string, readFilter string) ([]EnrichedArticle, error) {
	cursorID := int64(0)
	if cursor != nil {
		cursorID = -1 << 63
	}
	rows, err := s.queries.ListArticlesStreamEnriched(ctx, gen.ListArticlesStreamEnrichedParams{
		UserID: userID, CursorPublishedAt: timestamptzOrNull(cursor), CursorArticleID: cursorID, TargetLanguage: lang, Lim: clampLimit(limit), ReadFilter: normalizeReadFilter(readFilter),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) ListStarred(ctx context.Context, userID int64) ([]gen.Article, error) {
	return s.queries.ListArticlesStarred(ctx, userID)
}

func (s *ArticleService) ListStarredEnriched(ctx context.Context, userID int64, lang string) ([]EnrichedArticle, error) {
	rows, err := s.queries.ListArticlesStarredEnriched(ctx, gen.ListArticlesStarredEnrichedParams{
		UserID: userID, TargetLanguage: lang, Lim: 100,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) ListBySourceEnriched(ctx context.Context, userID, sourceID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.ListArticlesBySourceEnriched(ctx, gen.ListArticlesBySourceEnrichedParams{
		UserID: userID, SourceID: sourceID, TargetLanguage: lang, ReadFilter: normalizeReadFilter(readFilter), Lim: 100,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) ListBySource(ctx context.Context, userID, sourceID int64) ([]gen.Article, error) {
	_ = userID
	return s.queries.ListArticlesBySource(ctx, sourceID)
}

func (s *ArticleService) Search(ctx context.Context, userID int64, query string) ([]gen.Article, error) {
	rows, err := s.queries.SearchArticles(ctx, gen.SearchArticlesParams{
		UserID: userID,
		Q:      strings.TrimSpace(query),
	})
	if err != nil {
		return nil, err
	}

	items := make([]gen.Article, 0, len(rows))
	for _, row := range rows {
		items = append(items, gen.Article{
			ID:          row.ID,
			SourceID:    row.SourceID,
			Title:       row.Title,
			Link:        row.Link,
			Language:    row.Language,
			PublishedAt: row.PublishedAt,
		})
	}
	return items, nil
}

type ArticleWithSource struct {
	gen.Article
	SourceTitle string
}

func (s *ArticleService) GetByID(ctx context.Context, userID, articleID int64) (ArticleWithSource, error) {
	article, err := s.queries.GetArticleByID(ctx, articleID)
	if err != nil {
		return ArticleWithSource{}, errNotFound
	}

	source, err := s.queries.GetSourceByID(ctx, article.SourceID)
	if err != nil || source.UserID != userID {
		return ArticleWithSource{}, errNotFound
	}

	return ArticleWithSource{Article: article, SourceTitle: source.Title}, nil
}

func (s *ArticleService) SetRead(ctx context.Context, userID, articleID int64, isRead bool) error {
	_, err := s.SetReadState(ctx, userID, articleID, isRead)
	return err
}

func (s *ArticleService) SetReadState(ctx context.Context, userID, articleID int64, isRead bool) (statepkg.Snapshot, error) {
	return s.UpdateStateSnapshot(ctx, userID, articleID, &isRead, nil)
}

func (s *ArticleService) UpdateStateSnapshot(ctx context.Context, userID, articleID int64, isRead, isStarred *bool) (statepkg.Snapshot, error) {
	if isRead == nil && isStarred == nil {
		return s.GetStateSnapshot(ctx, userID, articleID)
	}
	states, err := s.stateMutations.Apply(ctx, userID, func(q *gen.Queries) ([]int64, error) {
		if isRead != nil {
			_, err := q.SetArticleRead(ctx, gen.SetArticleReadParams{UserID: userID, ID: articleID, IsRead: *isRead})
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, errForbidden
			}
			if err != nil {
				return nil, err
			}
		}
		if isStarred != nil {
			_, err := q.SetArticleStarred(ctx, gen.SetArticleStarredParams{UserID: userID, ID: articleID, IsStarred: *isStarred})
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, errForbidden
			}
			if err != nil {
				return nil, err
			}
		}
		return []int64{articleID}, nil
	})
	if err != nil {
		return statepkg.Snapshot{}, err
	}
	return states[0], nil
}

func (s *ArticleService) SetStarred(ctx context.Context, userID, articleID int64, isStarred bool) error {
	_, err := s.SetStarredState(ctx, userID, articleID, isStarred)
	return err
}

func (s *ArticleService) SetStarredState(ctx context.Context, userID, articleID int64, isStarred bool) (statepkg.Snapshot, error) {
	return s.UpdateStateSnapshot(ctx, userID, articleID, nil, &isStarred)
}

func (s *ArticleService) UpdateProgress(ctx context.Context, userID, articleID int64, progress []byte) error {
	_, err := s.queries.UpdateReadingProgress(ctx, gen.UpdateReadingProgressParams{
		UserID:          userID,
		ID:              articleID,
		ReadingProgress: progress,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errForbidden
	}
	return err
}

func (s *ArticleService) BatchSetRead(ctx context.Context, userID int64, scope string, isRead bool) ([]int64, error) {
	states, err := s.BatchSetReadStates(ctx, userID, scope, isRead)
	if err != nil {
		return nil, err
	}
	return snapshotIDs(states), nil
}

func (s *ArticleService) BatchSetReadStates(ctx context.Context, userID int64, scope string, isRead bool) ([]statepkg.Snapshot, error) {
	scope = strings.TrimSpace(scope)
	return s.stateMutations.Apply(ctx, userID, func(q *gen.Queries) ([]int64, error) {
		if scope == "tab:today" {
			return q.BatchSetReadToday(ctx, gen.BatchSetReadTodayParams{UserID: userID, IsRead: isRead})
		}
		if scope == "tab:stream" || scope == "tab:all" {
			return q.BatchSetReadStream(ctx, gen.BatchSetReadStreamParams{UserID: userID, IsRead: isRead})
		}
		if after, ok := strings.CutPrefix(scope, "source:"); ok {
			sourceID, err := strconv.ParseInt(after, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("invalid scope: %s", scope)
			}
			return q.BatchSetReadBySource(ctx, gen.BatchSetReadBySourceParams{UserID: userID, ID: sourceID, IsRead: isRead})
		}
		return nil, fmt.Errorf("unknown scope: %s", scope)
	})
}

func (s *ArticleService) CountTodayByReadState(ctx context.Context, userID int64) (ArticleReadCounts, error) {
	row, err := s.queries.CountArticlesTodayByReadState(ctx, userID)
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) CountStreamByReadState(ctx context.Context, userID int64) (ArticleReadCounts, error) {
	row, err := s.queries.CountArticlesStreamByReadState(ctx, userID)
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) CountBySourceReadState(ctx context.Context, userID, sourceID int64) (ArticleReadCounts, error) {
	row, err := s.queries.CountArticlesBySourceReadState(ctx, gen.CountArticlesBySourceReadStateParams{
		UserID:   userID,
		SourceID: sourceID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) ListChanges(ctx context.Context, userID int64, since time.Time) ([]gen.ListStateChangesSinceRow, error) {
	return s.queries.ListStateChangesSince(ctx, gen.ListStateChangesSinceParams{
		UserID:    userID,
		ChangedAt: pgtype.Timestamptz{Time: since.UTC(), Valid: true},
	})
}

func (s *ArticleService) ListStateChanges(ctx context.Context, userID int64, cursor string, limit int32) (statepkg.ChangePage, error) {
	return s.stateMutations.Changes(ctx, userID, cursor, limit)
}

func (s *ArticleService) GetStateSnapshot(ctx context.Context, userID, articleID int64) (statepkg.Snapshot, error) {
	return s.stateMutations.Get(ctx, userID, articleID)
}

func (s *ArticleService) ListStateSnapshots(ctx context.Context, userID int64, articleIDs []int64) (map[int64]statepkg.Snapshot, error) {
	result := make(map[int64]statepkg.Snapshot, len(articleIDs))
	for _, articleID := range articleIDs {
		row, err := s.queries.GetArticleStateSnapshot(ctx, gen.GetArticleStateSnapshotParams{UserID: userID, ArticleID: articleID})
		if err != nil {
			return nil, err
		}
		snapshot := statepkg.Snapshot{ArticleID: row.ArticleID, IsRead: row.IsRead, IsStarred: row.IsStarred}
		if row.ChangedAt.Valid {
			version := statepkg.VersionFromTime(row.ChangedAt.Time, row.ArticleID)
			snapshot.StateVersion = &version
		}
		result[articleID] = snapshot
	}
	return result, nil
}

func (s *ArticleService) GetState(ctx context.Context, userID, articleID int64) (gen.ArticleState, error) {
	return s.queries.GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: articleID})
}

func (s *ArticleService) LoadOriginal(ctx context.Context, userID, articleID int64) (OriginalContent, error) {
	article, err := s.GetByID(ctx, userID, articleID)
	if err != nil {
		return OriginalContent{}, err
	}
	content, err := s.originalLoader(ctx, article.Link)
	if err != nil {
		return OriginalContent{}, err
	}
	if _, err := s.queries.UpdateArticleContent(ctx, gen.UpdateArticleContentParams{
		ID:          article.ID,
		ContentHtml: content.ContentHTML,
		ContentText: content.ContentText,
	}); err != nil {
		return OriginalContent{}, err
	}
	return content, nil
}

func (s *ArticleService) withTx(ctx context.Context, fn func(*gen.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	if err := fn(gen.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func clampLimit(limit int32) int32 {
	if limit <= 0 {
		return 50
	}
	if limit > 100 {
		return 100
	}
	return limit
}

func normalizeReadFilter(filter string) string {
	normalized := strings.TrimSpace(strings.ToLower(filter))
	switch normalized {
	case "unread", "read":
		return normalized
	default:
		return "all"
	}
}

func timestamptzOrNull(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

// Guest variants — content is owned by contentOwnerID, state is owned by stateOwnerID.

func (s *ArticleService) GuestListTodayEnriched(ctx context.Context, stateOwnerID, contentOwnerID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesTodayEnriched(ctx, gen.GuestListArticlesTodayEnrichedParams{
		TargetLanguage: lang,
		StateOwnerID:   stateOwnerID,
		ContentOwnerID: contentOwnerID,
		ReadFilter:     normalizeReadFilter(readFilter),
		Lim:            100,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestListStreamEnriched(ctx context.Context, stateOwnerID, contentOwnerID int64, cursor *time.Time, limit int32, lang string, readFilter string) ([]EnrichedArticle, error) {
	cursorID := int64(0)
	if cursor != nil {
		cursorID = -1 << 63
	}
	rows, err := s.queries.GuestListArticlesStreamEnriched(ctx, gen.GuestListArticlesStreamEnrichedParams{
		Lim:               clampLimit(limit),
		TargetLanguage:    lang,
		StateOwnerID:      stateOwnerID,
		ContentOwnerID:    contentOwnerID,
		CursorPublishedAt: timestamptzOrNull(cursor),
		CursorArticleID:   cursorID,
		ReadFilter:        normalizeReadFilter(readFilter),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestListStarredEnriched(ctx context.Context, stateOwnerID, contentOwnerID int64, lang string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesStarredEnriched(ctx, gen.GuestListArticlesStarredEnrichedParams{
		TargetLanguage: lang,
		StateOwnerID:   stateOwnerID,
		ContentOwnerID: contentOwnerID,
		Lim:            100,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestListBySourceEnriched(ctx context.Context, stateOwnerID, contentOwnerID, sourceID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesBySourceEnriched(ctx, gen.GuestListArticlesBySourceEnrichedParams{
		TargetLanguage: lang,
		StateOwnerID:   stateOwnerID,
		ContentOwnerID: contentOwnerID,
		SourceID:       sourceID,
		ReadFilter:     normalizeReadFilter(readFilter),
		Lim:            100,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestSearch(ctx context.Context, contentOwnerID int64, query string) ([]gen.GuestSearchArticlesRow, error) {
	return s.queries.GuestSearchArticles(ctx, gen.GuestSearchArticlesParams{
		ContentOwnerID: contentOwnerID,
		Q:              strings.TrimSpace(query),
	})
}

func (s *ArticleService) GuestGetByID(ctx context.Context, contentOwnerID, articleID int64) (ArticleWithSource, error) {
	article, err := s.queries.GetArticleByID(ctx, articleID)
	if err != nil {
		return ArticleWithSource{}, errNotFound
	}

	source, err := s.queries.GetSourceByID(ctx, article.SourceID)
	if err != nil || source.UserID != contentOwnerID {
		return ArticleWithSource{}, errNotFound
	}

	return ArticleWithSource{Article: article, SourceTitle: source.Title}, nil
}

func (s *ArticleService) GuestSetRead(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, isRead bool) error {
	_, err := s.GuestUpdateStateSnapshot(ctx, stateOwnerID, contentOwnerID, articleID, &isRead, nil)
	return err
}

func (s *ArticleService) GuestSetStarred(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, isStarred bool) error {
	_, err := s.GuestUpdateStateSnapshot(ctx, stateOwnerID, contentOwnerID, articleID, nil, &isStarred)
	return err
}

func (s *ArticleService) GuestUpdateStateSnapshot(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, isRead, isStarred *bool) (statepkg.Snapshot, error) {
	if isRead == nil && isStarred == nil {
		return s.GetStateSnapshot(ctx, stateOwnerID, articleID)
	}
	states, err := s.stateMutations.Apply(ctx, stateOwnerID, func(q *gen.Queries) ([]int64, error) {
		if isRead != nil {
			_, err := q.GuestSetArticleRead(ctx, gen.GuestSetArticleReadParams{
				StateOwnerID: stateOwnerID, IsRead: *isRead, ArticleID: articleID, ContentOwnerID: contentOwnerID,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, errForbidden
			}
			if err != nil {
				return nil, err
			}
		}
		if isStarred != nil {
			_, err := q.GuestSetArticleStarred(ctx, gen.GuestSetArticleStarredParams{
				StateOwnerID: stateOwnerID, IsStarred: *isStarred, ArticleID: articleID, ContentOwnerID: contentOwnerID,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, errForbidden
			}
			if err != nil {
				return nil, err
			}
		}
		return []int64{articleID}, nil
	})
	if err != nil {
		return statepkg.Snapshot{}, err
	}
	return states[0], nil
}

func (s *ArticleService) GuestUpdateProgress(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, progress []byte) error {
	_, err := s.queries.GuestUpdateReadingProgress(ctx, gen.GuestUpdateReadingProgressParams{
		StateOwnerID:    stateOwnerID,
		ReadingProgress: progress,
		ArticleID:       articleID,
		ContentOwnerID:  contentOwnerID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errForbidden
	}
	return err
}

func (s *ArticleService) GuestBatchSetRead(ctx context.Context, stateOwnerID, contentOwnerID int64, scope string, isRead bool) ([]int64, error) {
	states, err := s.GuestBatchSetReadStates(ctx, stateOwnerID, contentOwnerID, scope, isRead)
	if err != nil {
		return nil, err
	}
	return snapshotIDs(states), nil
}

func (s *ArticleService) GuestBatchSetReadStates(ctx context.Context, stateOwnerID, contentOwnerID int64, scope string, isRead bool) ([]statepkg.Snapshot, error) {
	scope = strings.TrimSpace(scope)
	return s.stateMutations.Apply(ctx, stateOwnerID, func(q *gen.Queries) ([]int64, error) {
		if scope == "tab:today" {
			return q.GuestBatchSetReadToday(ctx, gen.GuestBatchSetReadTodayParams{
				StateOwnerID: stateOwnerID, IsRead: isRead, ContentOwnerID: contentOwnerID,
			})
		}
		if scope == "tab:stream" || scope == "tab:all" {
			return q.GuestBatchSetReadStream(ctx, gen.GuestBatchSetReadStreamParams{
				StateOwnerID: stateOwnerID, IsRead: isRead, ContentOwnerID: contentOwnerID,
			})
		}
		if after, ok := strings.CutPrefix(scope, "source:"); ok {
			sourceID, err := strconv.ParseInt(after, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("invalid scope: %s", scope)
			}
			return q.GuestBatchSetReadBySource(ctx, gen.GuestBatchSetReadBySourceParams{
				StateOwnerID: stateOwnerID, IsRead: isRead, SourceID: sourceID, ContentOwnerID: contentOwnerID,
			})
		}
		return nil, fmt.Errorf("unknown scope: %s", scope)
	})
}

func snapshotIDs(states []statepkg.Snapshot) []int64 {
	ids := make([]int64, len(states))
	for i, state := range states {
		ids[i] = state.ArticleID
	}
	return ids
}

func (s *ArticleService) GuestCountTodayByReadState(ctx context.Context, stateOwnerID, contentOwnerID int64) (ArticleReadCounts, error) {
	row, err := s.queries.GuestCountTodayByReadState(ctx, gen.GuestCountTodayByReadStateParams{
		StateOwnerID:   stateOwnerID,
		ContentOwnerID: contentOwnerID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) GuestCountStreamByReadState(ctx context.Context, stateOwnerID, contentOwnerID int64) (ArticleReadCounts, error) {
	row, err := s.queries.GuestCountStreamByReadState(ctx, gen.GuestCountStreamByReadStateParams{
		StateOwnerID:   stateOwnerID,
		ContentOwnerID: contentOwnerID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) GuestCountBySourceReadState(ctx context.Context, stateOwnerID, contentOwnerID, sourceID int64) (ArticleReadCounts, error) {
	row, err := s.queries.GuestCountBySourceReadState(ctx, gen.GuestCountBySourceReadStateParams{
		ContentOwnerID: contentOwnerID,
		StateOwnerID:   stateOwnerID,
		SourceID:       sourceID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}
