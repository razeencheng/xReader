package ai

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSettingsServiceCurrentMasksAPIKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test-secret")
	path := writeTempYAML(t, `
provider:
  base_url: "https://api.example.com/v1"
  api_key_env: "OPENAI_API_KEY"
  model: "qwen-turbo"
`)

	service := NewSettingsService(path, NewMemorySettingsRepository())
	current, err := service.Current(context.Background())
	require.NoError(t, err)

	require.Equal(t, "https://api.example.com/v1", current.Endpoint)
	require.Equal(t, "qwen-turbo", current.Model)
	require.True(t, current.APIKeySet)
	require.Equal(t, "sk-...cret", current.APIKeyHint)
}

func TestSettingsServiceUpdateOverridesResolvedConfig(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-old")
	path := writeTempYAML(t, `
provider:
  base_url: "https://api.example.com/v1"
  api_key_env: "OPENAI_API_KEY"
  model: "qwen-turbo"
  max_retries: 2
  timeout: 45s
  batch_paragraphs_per_call: 6
`)

	service := NewSettingsService(path, NewMemorySettingsRepository())
	updated, err := service.Update(context.Background(), SettingsUpdate{
		Endpoint: "https://relay.example.com",
		Model:    "deepseek-chat",
		APIKey:   "sk-new-secret",
	})
	require.NoError(t, err)
	require.Equal(t, "https://relay.example.com/v1", updated.Endpoint)
	require.Equal(t, "deepseek-chat", updated.Model)
	require.Equal(t, "sk-...cret", updated.APIKeyHint)

	resolved, err := service.LoadResolved(context.Background())
	require.NoError(t, err)
	require.Equal(t, "https://relay.example.com/v1", resolved.BaseURL)
	require.Equal(t, "deepseek-chat", resolved.Model)
	require.Equal(t, "sk-new-secret", resolved.APIKey)
	require.Equal(t, 2, resolved.MaxRetries)
	require.Equal(t, 45*time.Second, resolved.Timeout)
	require.Equal(t, 6, resolved.BatchSize)
}
