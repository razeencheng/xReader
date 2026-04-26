package ai

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type SettingsHandler struct {
	service *SettingsService
}

func NewSettingsHandler(service *SettingsService) *SettingsHandler {
	return &SettingsHandler{service: service}
}

func (h *SettingsHandler) Get(c *gin.Context) {
	settings, err := h.service.Current(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load AI settings"})
		return
	}
	c.JSON(http.StatusOK, settings)
}

type settingsUpdateRequest struct {
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
	APIKey   string `json:"api_key"`
}

func (h *SettingsHandler) Update(c *gin.Context) {
	var req settingsUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	settings, err := h.service.Update(c.Request.Context(), SettingsUpdate{
		Endpoint: req.Endpoint,
		Model:    req.Model,
		APIKey:   req.APIKey,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, settings)
}
