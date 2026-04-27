package ai

import (
	"errors"
	"time"
)

type Config struct {
	Provider ProviderConfig `yaml:"provider"`
}

type ProviderConfig struct {
	BaseURL    string        `yaml:"base_url"`
	APIKeyEnv  string        `yaml:"api_key_env"`
	Model      string        `yaml:"model"`
	MaxRetries int           `yaml:"max_retries"`
	Timeout    time.Duration `yaml:"timeout"`
	BatchSize  int           `yaml:"batch_paragraphs_per_call"`
}

type ResolvedConfig struct {
	BaseURL    string
	APIKey     string
	Model      string
	MaxRetries int
	Timeout    time.Duration
	BatchSize  int
}

func LoadConfig(path string) (ResolvedConfig, error) {
	return ResolvedConfig{}, errors.New("AI config files are no longer supported; configure the provider in Settings")
}
