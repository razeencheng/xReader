package article

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
)

var errNotFound = errors.New("not found")

type ArticleService struct {
	pool    *pgxpool.Pool
	queries *gen.Queries
}

func NewArticleService(pool *pgxpool.Pool) *ArticleService {
	return &ArticleService{pool: pool, queries: gen.New(pool)}
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
}

func (s *ArticleService) ListToday(ctx context.Context, userID int64) ([]gen.Article, error) {
	return s.queries.ListArticlesToday(ctx, userID)
}

func (s *ArticleService) ListTodayEnriched(ctx context.Context, userID int64, lang string) ([]EnrichedArticle, error) {
	rows, err := s.queries.ListArticlesTodayEnriched(ctx, gen.ListArticlesTodayEnrichedParams{
		UserID: userID, TargetLanguage: lang,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{ID: r.ID, SourceID: r.SourceID, Title: r.Title, TitleTranslated: r.TitleTranslated, Summary: r.Summary, SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language, Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText}
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

func (s *ArticleService) ListStreamEnriched(ctx context.Context, userID int64, cursor *time.Time, limit int32, lang string) ([]EnrichedArticle, error) {
	rows, err := s.queries.ListArticlesStreamEnriched(ctx, gen.ListArticlesStreamEnrichedParams{
		UserID: userID, Column2: timestamptzOrNull(cursor), TargetLanguage: lang, Limit: clampLimit(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{ID: r.ID, SourceID: r.SourceID, Title: r.Title, TitleTranslated: r.TitleTranslated, Summary: r.Summary, SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language, Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText}
	}
	return out, nil
}

func (s *ArticleService) ListStarred(ctx context.Context, userID int64) ([]gen.Article, error) {
	return s.queries.ListArticlesStarred(ctx, userID)
}

func (s *ArticleService) ListStarredEnriched(ctx context.Context, userID int64, lang string) ([]EnrichedArticle, error) {
	rows, err := s.queries.ListArticlesStarredEnriched(ctx, gen.ListArticlesStarredEnrichedParams{
		UserID: userID, TargetLanguage: lang,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{ID: r.ID, SourceID: r.SourceID, Title: r.Title, TitleTranslated: r.TitleTranslated, Summary: r.Summary, SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language, Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText}
	}
	return out, nil
}

func (s *ArticleService) ListBySource(ctx context.Context, userID, sourceID int64) ([]gen.Article, error) {
	_ = userID
	return s.queries.ListArticlesBySource(ctx, sourceID)
}

func (s *ArticleService) Search(ctx context.Context, userID int64, query string) ([]gen.Article, error) {
	rows, err := s.queries.SearchArticles(ctx, gen.SearchArticlesParams{
		UserID:         userID,
		PlaintoTsquery: strings.TrimSpace(query),
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

func (s *ArticleService) GetByID(ctx context.Context, userID, articleID int64) (gen.Article, error) {
	article, err := s.queries.GetArticleByID(ctx, articleID)
	if err != nil {
		return gen.Article{}, errNotFound
	}

	source, err := s.queries.GetSourceByID(ctx, article.SourceID)
	if err != nil || source.UserID != userID {
		return gen.Article{}, errNotFound
	}

	return article, nil
}

func (s *ArticleService) SetRead(ctx context.Context, userID, articleID int64, isRead bool) error {
	return s.withTx(ctx, func(q *gen.Queries) error {
		if err := q.SetArticleRead(ctx, gen.SetArticleReadParams{UserID: userID, ArticleID: articleID, IsRead: isRead}); err != nil {
			return err
		}
		return q.RecordStateChange(ctx, gen.RecordStateChangeParams{UserID: userID, ArticleID: articleID})
	})
}

func (s *ArticleService) SetStarred(ctx context.Context, userID, articleID int64, isStarred bool) error {
	return s.withTx(ctx, func(q *gen.Queries) error {
		if err := q.SetArticleStarred(ctx, gen.SetArticleStarredParams{UserID: userID, ArticleID: articleID, IsStarred: isStarred}); err != nil {
			return err
		}
		return q.RecordStateChange(ctx, gen.RecordStateChangeParams{UserID: userID, ArticleID: articleID})
	})
}

func (s *ArticleService) UpdateProgress(ctx context.Context, userID, articleID int64, progress []byte) error {
	return s.queries.UpdateReadingProgress(ctx, gen.UpdateReadingProgressParams{
		UserID:          userID,
		ArticleID:       articleID,
		ReadingProgress: progress,
	})
}

func (s *ArticleService) BatchMarkRead(ctx context.Context, userID int64, scope string) error {
	scope = strings.TrimSpace(scope)
	if scope == "tab:today" {
		return s.queries.BatchMarkReadToday(ctx, userID)
	}
	if after, ok := strings.CutPrefix(scope, "source:"); ok {
		sourceID, err := strconv.ParseInt(after, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid scope: %s", scope)
		}
		return s.queries.BatchMarkReadBySource(ctx, gen.BatchMarkReadBySourceParams{UserID: userID, ID: sourceID})
	}
	return fmt.Errorf("unknown scope: %s", scope)
}

func (s *ArticleService) ListChanges(ctx context.Context, userID int64, since time.Time) ([]gen.ListStateChangesSinceRow, error) {
	return s.queries.ListStateChangesSince(ctx, gen.ListStateChangesSinceParams{
		UserID:    userID,
		ChangedAt: pgtype.Timestamptz{Time: since.UTC(), Valid: true},
	})
}

func (s *ArticleService) GetState(ctx context.Context, userID, articleID int64) (gen.ArticleState, error) {
	return s.queries.GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: articleID})
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

func timestamptzOrNull(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}
