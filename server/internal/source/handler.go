package source

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jin/xreader-web/internal/middleware"
)

type SourceHandler struct {
	Service *SourceService
}

func NewSourceHandler(svc *SourceService) *SourceHandler {
	return &SourceHandler{Service: svc}
}

func (h *SourceHandler) List(c *gin.Context) {
	user := middleware.GetUser(c)
	sources, err := h.Service.List(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sources"})
		return
	}
	c.JSON(http.StatusOK, sources)
}

type createSourceRequest struct {
	URL string `json:"url" binding:"required"`
}

func (h *SourceHandler) Create(c *gin.Context) {
	var req createSourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url required"})
		return
	}

	user := middleware.GetUser(c)
	src, err := h.Service.Create(c.Request.Context(), user.ID, req.URL)
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "source already exists"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, src)
}

type renameSourceRequest struct {
	Title string `json:"title" binding:"required"`
}

func (h *SourceHandler) Rename(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req renameSourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title required"})
		return
	}

	user := middleware.GetUser(c)
	if err := h.Service.Rename(c.Request.Context(), user.ID, id, req.Title); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "renamed"})
}

func (h *SourceHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user := middleware.GetUser(c)
	if err := h.Service.Delete(c.Request.Context(), user.ID, id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *SourceHandler) Refresh(c *gin.Context) {
	c.JSON(http.StatusAccepted, gin.H{"status": "refresh queued"})
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "23505") || strings.Contains(msg, "duplicate key")
}
