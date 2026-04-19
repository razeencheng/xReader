package ai

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Provider ProviderConfig `yaml:"provider"`
}

type ProviderConfig struct {
	BaseURL   string        `yaml:"base_url"`
	APIKeyEnv string        `yaml:"api_key_env"`
	Model     string        `yaml:"model"`
	MaxRetries int          `yaml:"max_retries"`
	Timeout   time.Duration `yaml:"timeout"`
	BatchSize int           `yaml:"batch_paragraphs_per_call"`
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
	data, err := os.ReadFile(path)
	if err != nil {
		return ResolvedConfig{}, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return ResolvedConfig{}, fmt.Errorf("parse config: %w", err)
	}

	apiKey := os.Getenv(cfg.Provider.APIKeyEnv)

	maxRetries := cfg.Provider.MaxRetries
	if maxRetries <= 0 {
		maxRetries = 3
	}
	timeout := cfg.Provider.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	batchSize := cfg.Provider.BatchSize
	if batchSize <= 0 {
		batchSize = 5
	}

	return ResolvedConfig{
		BaseURL:    cfg.Provider.BaseURL,
		APIKey:     apiKey,
		Model:      cfg.Provider.Model,
		MaxRetries: maxRetries,
		Timeout:    timeout,
		BatchSize:  batchSize,
	}, nil
}
