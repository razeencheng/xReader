package article

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

const articleCursorPrefix = "ac1."

type ArticleCursor struct {
	PublishedAt time.Time
	ArticleID   int64
}

type articleCursorPayload struct {
	PublishedAtMicros string `json:"published_at_micros"`
	ArticleID         int64  `json:"article_id"`
}

func encodeArticleCursor(cursor ArticleCursor) string {
	payload, _ := json.Marshal(articleCursorPayload{
		PublishedAtMicros: strconv.FormatInt(cursor.PublishedAt.UTC().UnixMicro(), 10),
		ArticleID:         cursor.ArticleID,
	})
	return articleCursorPrefix + base64.RawURLEncoding.EncodeToString(payload)
}

func decodeArticleCursor(raw, tab string) (*ArticleCursor, error) {
	if raw == "" {
		return nil, nil
	}
	if !strings.HasPrefix(raw, articleCursorPrefix) {
		if tab == "stream" || tab == "all" {
			if legacy, err := parseTime(raw); err == nil {
				return &ArticleCursor{PublishedAt: legacy, ArticleID: math.MinInt64}, nil
			}
		}
		return nil, fmt.Errorf("unsupported article cursor")
	}
	encoded := strings.TrimPrefix(raw, articleCursorPrefix)
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("invalid article cursor: %w", err)
	}
	var decoded articleCursorPayload
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("invalid article cursor: %w", err)
	}
	micros, err := strconv.ParseInt(decoded.PublishedAtMicros, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid article cursor")
	}
	return &ArticleCursor{PublishedAt: time.UnixMicro(micros).UTC(), ArticleID: decoded.ArticleID}, nil
}
