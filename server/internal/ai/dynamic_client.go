package ai

import (
	"context"
	"errors"
)

type DynamicClient struct {
	settings *SettingsService
}

func NewDynamicClient(settings *SettingsService) *DynamicClient {
	return &DynamicClient{settings: settings}
}

func (c *DynamicClient) ChatCompletion(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	if c == nil || c.settings == nil {
		return ChatResponse{}, errors.New("AI settings not configured")
	}
	cfg, err := c.settings.LoadResolved(ctx)
	if err != nil {
		return ChatResponse{}, err
	}
	if cfg.APIKey == "" {
		return ChatResponse{}, errors.New("AI API key not configured")
	}
	return NewClient(cfg).ChatCompletion(ctx, req)
}
