package ai

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func writeTempYAML(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "ai.yaml")
	require.NoError(t, os.WriteFile(path, []byte(content), 0644))
	return path
}

func TestLoadConfig_ReadsYAML(t *testing.T) {
	yaml := `
provider:
  base_url: "https://api.example.com/v1"
  api_key_env: "TEST_AI_KEY"
  model: "gpt-4"
  max_retries: 5
  timeout: 60s
  batch_paragraphs_per_call: 10
`
	t.Setenv("TEST_AI_KEY", "sk-test")
	cfg, err := LoadConfig(writeTempYAML(t, yaml))
	require.NoError(t, err)
	require.Equal(t, "https://api.example.com/v1", cfg.BaseURL)
	require.Equal(t, "sk-test", cfg.APIKey)
	require.Equal(t, "gpt-4", cfg.Model)
	require.Equal(t, 5, cfg.MaxRetries)
	require.Equal(t, 60*time.Second, cfg.Timeout)
	require.Equal(t, 10, cfg.BatchSize)
}

func TestLoadConfig_ResolvesAPIKeyFromEnv(t *testing.T) {
	t.Setenv("MY_KEY_VAR", "sk-test-123")
	yaml := `
provider:
  base_url: "https://api.example.com"
  api_key_env: "MY_KEY_VAR"
  model: "gpt-4"
`
	cfg, err := LoadConfig(writeTempYAML(t, yaml))
	require.NoError(t, err)
	require.Equal(t, "sk-test-123", cfg.APIKey)
}

func TestLoadConfig_Defaults(t *testing.T) {
	t.Setenv("K", "key")
	yaml := `
provider:
  base_url: "https://api.example.com"
  api_key_env: "K"
  model: "m"
`
	cfg, err := LoadConfig(writeTempYAML(t, yaml))
	require.NoError(t, err)
	require.Equal(t, 3, cfg.MaxRetries)
	require.Equal(t, 30*time.Second, cfg.Timeout)
	require.Equal(t, 5, cfg.BatchSize)
}

func TestLoadConfig_OverridesBaseURLFromOpenAIEndpoint(t *testing.T) {
	t.Setenv("K", "key")
	t.Setenv("OPENAI_ENDPOINT", "https://proxy.example.com")
	yaml := `
provider:
  base_url: "https://api.example.com/v1"
  api_key_env: "K"
  model: "m"
`
	cfg, err := LoadConfig(writeTempYAML(t, yaml))
	require.NoError(t, err)
	require.Equal(t, "https://proxy.example.com/v1", cfg.BaseURL)
}

func TestLoadConfig_UsesOpenAIEndpointWithExistingV1(t *testing.T) {
	t.Setenv("K", "key")
	t.Setenv("OPENAI_ENDPOINT", "https://proxy.example.com/v1/")
	yaml := `
provider:
  base_url: "https://api.example.com/v1"
  api_key_env: "K"
  model: "m"
`
	cfg, err := LoadConfig(writeTempYAML(t, yaml))
	require.NoError(t, err)
	require.Equal(t, "https://proxy.example.com/v1", cfg.BaseURL)
}
