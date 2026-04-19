package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Service      *Service
	SessionStore SessionStore
}

func NewHandler(svc *Service, sessions SessionStore) *Handler {
	return &Handler{Service: svc, SessionStore: sessions}
}

func (h *Handler) BeginLogin(c *gin.Context) {
	redirectURL, err := h.Service.BeginLogin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start login"})
		return
	}
	c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}

func (h *Handler) HandleCallback(c *gin.Context) {
	state := c.Query("state")
	code := c.Query("code")
	if state == "" || code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing state or code"})
		return
	}

	result, err := h.Service.Callback(c.Request.Context(), state, code, c.GetHeader("User-Agent"))
	if err != nil {
		switch err {
		case ErrInvalidState:
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid state"})
		case ErrNotAllowlisted:
			c.JSON(http.StatusForbidden, gin.H{"error": "not on allowlist"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		}
		return
	}

	c.SetCookie("xreader_session", result.SessionID, 30*24*3600, "/", "", false, true)
	c.Redirect(http.StatusTemporaryRedirect, "/")
}
