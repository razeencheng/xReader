package state

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/razeencheng/xreader/db/gen"
)

const cursorPrefix = "sc1."

type Version struct {
	ChangedAtMicros string `json:"changed_at_micros"`
	ArticleID       int64  `json:"article_id"`
}

type Snapshot struct {
	ArticleID    int64    `json:"article_id"`
	IsRead       bool     `json:"is_read"`
	IsStarred    bool     `json:"is_starred"`
	StateVersion *Version `json:"state_version,omitempty"`
}

type ChangePage struct {
	Items      []Snapshot `json:"items"`
	NextCursor string     `json:"next_cursor"`
	HasMore    bool       `json:"has_more"`
}

type MutateFunc func(*gen.Queries) ([]int64, error)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) Apply(ctx context.Context, ownerID int64, mutate MutateFunc) ([]Snapshot, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := gen.New(tx)
	if err := q.AcquireStateOwnerLock(ctx, ownerID); err != nil {
		return nil, err
	}
	changedAt, err := q.AllocateStateChangeTime(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	articleIDs, err := mutate(q)
	if err != nil {
		return nil, err
	}
	articleIDs = uniqueSorted(articleIDs)
	for _, articleID := range articleIDs {
		if err := q.RecordStateChangeAt(ctx, gen.RecordStateChangeAtParams{
			UserID: ownerID, ArticleID: articleID, ChangedAt: changedAt,
		}); err != nil {
			return nil, err
		}
	}

	snapshots := make([]Snapshot, 0, len(articleIDs))
	for _, articleID := range articleIDs {
		snapshot, err := getSnapshot(ctx, q, ownerID, articleID)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return snapshots, nil
}

func (s *Service) Get(ctx context.Context, ownerID, articleID int64) (Snapshot, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := gen.New(tx)
	if err := q.AcquireStateOwnerLock(ctx, ownerID); err != nil {
		return Snapshot{}, err
	}
	snapshot, err := getSnapshot(ctx, q, ownerID, articleID)
	if err != nil {
		return Snapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Snapshot{}, err
	}
	return snapshot, nil
}

func (s *Service) Changes(ctx context.Context, ownerID int64, cursor string, limit int32) (ChangePage, error) {
	limit = clampLimit(limit)
	if cursor == "" {
		return s.bootstrap(ctx, ownerID)
	}
	position, err := decodeCursor(cursor)
	if err != nil {
		return ChangePage{}, err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		return ChangePage{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := gen.New(tx)
	keys, err := q.ListStateChangeKeys(ctx, gen.ListStateChangeKeysParams{
		UserID:          ownerID,
		CursorChangedAt: timestamptzFromMicros(position.ChangedAtMicros),
		CursorArticleID: position.ArticleID,
		Lim:             limit + 1,
	})
	if err != nil {
		return ChangePage{}, err
	}
	hasMore := len(keys) > int(limit)
	if hasMore {
		keys = keys[:limit]
	}

	items := make([]Snapshot, 0, len(keys))
	for _, key := range keys {
		snapshot, err := getSnapshot(ctx, q, ownerID, key.ArticleID)
		if err != nil {
			return ChangePage{}, err
		}
		items = append(items, snapshot)
	}
	nextCursor := cursor
	if len(keys) > 0 {
		last := keys[len(keys)-1]
		nextCursor = encodeCursor(versionFromTime(last.ChangedAt.Time, last.ArticleID))
	}
	if err := tx.Commit(ctx); err != nil {
		return ChangePage{}, err
	}
	return ChangePage{Items: items, NextCursor: nextCursor, HasMore: hasMore}, nil
}

func (s *Service) bootstrap(ctx context.Context, ownerID int64) (ChangePage, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ChangePage{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := gen.New(tx)
	if err := q.AcquireStateOwnerLock(ctx, ownerID); err != nil {
		return ChangePage{}, err
	}
	highWater, err := q.GetStateChangeHighWater(ctx, ownerID)
	version := Version{ChangedAtMicros: "0", ArticleID: 0}
	if err == nil {
		version = versionFromTime(highWater.ChangedAt.Time, highWater.ArticleID)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return ChangePage{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ChangePage{}, err
	}
	return ChangePage{Items: []Snapshot{}, NextCursor: encodeCursor(version), HasMore: false}, nil
}

func getSnapshot(ctx context.Context, q *gen.Queries, ownerID, articleID int64) (Snapshot, error) {
	row, err := q.GetArticleStateSnapshot(ctx, gen.GetArticleStateSnapshotParams{
		UserID: ownerID, ArticleID: articleID,
	})
	if err != nil {
		return Snapshot{}, err
	}
	snapshot := Snapshot{ArticleID: row.ArticleID, IsRead: row.IsRead, IsStarred: row.IsStarred}
	if row.ChangedAt.Valid {
		version := versionFromTime(row.ChangedAt.Time, row.ArticleID)
		snapshot.StateVersion = &version
	}
	return snapshot, nil
}

func uniqueSorted(articleIDs []int64) []int64 {
	sort.Slice(articleIDs, func(i, j int) bool { return articleIDs[i] < articleIDs[j] })
	result := articleIDs[:0]
	for _, articleID := range articleIDs {
		if len(result) == 0 || result[len(result)-1] != articleID {
			result = append(result, articleID)
		}
	}
	return result
}

func versionFromTime(changedAt time.Time, articleID int64) Version {
	return Version{ChangedAtMicros: strconv.FormatInt(changedAt.UTC().UnixMicro(), 10), ArticleID: articleID}
}

func VersionFromTime(changedAt time.Time, articleID int64) Version {
	return versionFromTime(changedAt, articleID)
}

func timestamptzFromMicros(value string) pgtype.Timestamptz {
	micros, _ := strconv.ParseInt(value, 10, 64)
	return pgtype.Timestamptz{Time: time.UnixMicro(micros).UTC(), Valid: true}
}

func encodeCursor(version Version) string {
	payload, _ := json.Marshal(version)
	return cursorPrefix + base64.RawURLEncoding.EncodeToString(payload)
}

func decodeCursor(cursor string) (Version, error) {
	if len(cursor) <= len(cursorPrefix) || cursor[:len(cursorPrefix)] != cursorPrefix {
		return Version{}, fmt.Errorf("unsupported state cursor")
	}
	payload, err := base64.RawURLEncoding.DecodeString(cursor[len(cursorPrefix):])
	if err != nil {
		return Version{}, fmt.Errorf("invalid state cursor: %w", err)
	}
	var version Version
	if err := json.Unmarshal(payload, &version); err != nil {
		return Version{}, fmt.Errorf("invalid state cursor: %w", err)
	}
	if _, err := strconv.ParseInt(version.ChangedAtMicros, 10, 64); err != nil || version.ArticleID < 0 {
		return Version{}, fmt.Errorf("invalid state cursor")
	}
	return version, nil
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
