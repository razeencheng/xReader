package highlight

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jin/xreader-web/db/gen"
)

var errNotFound = errors.New("not found")

type CreateParams struct {
	ArticleID       int64
	Layer           string
	ParagraphIndex  int32
	TextStartOffset int32
	TextEndOffset   int32
	QuotedText      string
	Note            *string
}

type HighlightService struct {
	pool    *pgxpool.Pool
	queries *gen.Queries
}

func NewHighlightService(pool *pgxpool.Pool) *HighlightService {
	return &HighlightService{pool: pool, queries: gen.New(pool)}
}

func (s *HighlightService) Create(ctx context.Context, userID int64, params CreateParams) (*gen.Highlight, error) {
	if err := validateLayer(params.Layer); err != nil {
		return nil, err
	}
	if err := validateOffsets(params.TextStartOffset, params.TextEndOffset); err != nil {
		return nil, err
	}

	created, err := s.queries.CreateHighlight(ctx, gen.CreateHighlightParams{
		UserID:          userID,
		ArticleID:       params.ArticleID,
		Layer:           params.Layer,
		ParagraphIndex:  params.ParagraphIndex,
		TextStartOffset: params.TextStartOffset,
		TextEndOffset:   params.TextEndOffset,
		QuotedText:      params.QuotedText,
		Note:            textPtr(params.Note),
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

func (s *HighlightService) ListByArticle(ctx context.Context, userID, articleID int64) ([]gen.Highlight, error) {
	return s.queries.ListHighlightsByArticle(ctx, gen.ListHighlightsByArticleParams{UserID: userID, ArticleID: articleID})
}

func (s *HighlightService) ListByUser(ctx context.Context, userID int64, limit, offset int32) ([]gen.ListHighlightsByUserRow, error) {
	return s.queries.ListHighlightsByUser(ctx, gen.ListHighlightsByUserParams{UserID: userID, Limit: clampLimit(limit), Offset: clampOffset(offset)})
}

func (s *HighlightService) Search(ctx context.Context, userID int64, query string, limit, offset int32) ([]gen.SearchHighlightsRow, error) {
	return s.queries.SearchHighlights(ctx, gen.SearchHighlightsParams{UserID: userID, Column2: pgtype.Text{String: query, Valid: true}, Limit: clampLimit(limit), Offset: clampOffset(offset)})
}

func (s *HighlightService) UpdateNote(ctx context.Context, userID, highlightID int64, note string) error {
	highlight, err := s.queries.GetHighlightByID(ctx, highlightID)
	if err != nil || highlight.UserID != userID {
		return errNotFound
	}
	return s.queries.UpdateHighlightNote(ctx, gen.UpdateHighlightNoteParams{ID: highlightID, Note: pgtype.Text{String: note, Valid: true}})
}

func (s *HighlightService) Delete(ctx context.Context, userID, highlightID int64) error {
	highlight, err := s.queries.GetHighlightByID(ctx, highlightID)
	if err != nil || highlight.UserID != userID {
		return errNotFound
	}
	return s.queries.DeleteHighlight(ctx, highlightID)
}

func validateLayer(layer string) error {
	switch layer {
	case "original", "translation":
		return nil
	default:
		return fmt.Errorf("invalid layer")
	}
}

func validateOffsets(start, end int32) error {
	if start < 0 || end < 0 {
		return fmt.Errorf("offsets must be non-negative")
	}
	if start >= end {
		return fmt.Errorf("text_start_offset must be less than text_end_offset")
	}
	return nil
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

func clampOffset(offset int32) int32 {
	if offset < 0 {
		return 0
	}
	return offset
}

func textPtr(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}
