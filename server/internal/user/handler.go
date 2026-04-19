package user

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/middleware"
)

type Handler struct {
	queries *gen.Queries
}

func NewHandler(pool *pgxpool.Pool) *Handler {
	return &Handler{queries: gen.New(pool)}
}

type updatePrefsRequest struct {
	NativeLanguage *string `json:"native_language"`
	DensityPref    *string `json:"density_pref"`
	ThemePref      *string `json:"theme_pref"`
}

func (h *Handler) UpdatePreferences(c *gin.Context) {
	u := middleware.GetUser(c)

	var req updatePrefsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Use current values as defaults, override with request values
	lang := u.NativeLanguage
	density := u.DensityPref
	theme := u.ThemePref
	if req.NativeLanguage != nil {
		lang = *req.NativeLanguage
	}
	if req.DensityPref != nil {
		density = *req.DensityPref
	}
	if req.ThemePref != nil {
		theme = *req.ThemePref
	}

	updated, err := h.queries.UpdateUserPreferences(c.Request.Context(), gen.UpdateUserPreferencesParams{
		ID:             u.ID,
		NativeLanguage: lang,
		DensityPref:    density,
		ThemePref:      theme,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update preferences"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"native_language": updated.NativeLanguage,
		"density_pref":    updated.DensityPref,
		"theme_pref":      updated.ThemePref,
	})
}
