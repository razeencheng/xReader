package ai

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"gopkg.in/yaml.v3"
)

const redisAISettingsKey = "settings:ai"

type SettingsSnapshot struct {
	Endpoint   string `json:"endpoint"`
	Model      string `json:"model"`
	APIKeySet  bool   `json:"api_key_set"`
	APIKeyHint string `json:"api_key_hint"`
}

type SettingsUpdate struct {
	Endpoint string
	Model    string
	APIKey   string
}

type settingsOverrides struct {
	Endpoint string
	Model    string
	APIKey   string
}

type SettingsRepository interface {
	LoadAISettings(ctx context.Context) (settingsOverrides, error)
	SaveAISettings(ctx context.Context, settings settingsOverrides) error
}

type MemorySettingsRepository struct {
	mu       sync.Mutex
	settings settingsOverrides
}

func NewMemorySettingsRepository() *MemorySettingsRepository {
	return &MemorySettingsRepository{}
}

func (r *MemorySettingsRepository) LoadAISettings(context.Context) (settingsOverrides, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.settings, nil
}

func (r *MemorySettingsRepository) SaveAISettings(_ context.Context, settings settingsOverrides) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.settings = settings
	return nil
}

type RedisSettingsRepository struct {
	client redis.Cmdable
}

func NewRedisSettingsRepository(client redis.Cmdable) *RedisSettingsRepository {
	return &RedisSettingsRepository{client: client}
}

func (r *RedisSettingsRepository) LoadAISettings(ctx context.Context) (settingsOverrides, error) {
	if r == nil || r.client == nil {
		return settingsOverrides{}, nil
	}
	values, err := r.client.HGetAll(ctx, redisAISettingsKey).Result()
	if err != nil {
		return settingsOverrides{}, err
	}
	return settingsOverrides{
		Endpoint: values["endpoint"],
		Model:    values["model"],
		APIKey:   values["api_key"],
	}, nil
}

func (r *RedisSettingsRepository) SaveAISettings(ctx context.Context, settings settingsOverrides) error {
	if r == nil || r.client == nil {
		return nil
	}
	return r.client.HSet(ctx, redisAISettingsKey, map[string]any{
		"endpoint": settings.Endpoint,
		"model":    settings.Model,
		"api_key":  settings.APIKey,
	}).Err()
}

type SettingsService struct {
	configPath string
	repo       SettingsRepository
}

func NewSettingsService(configPath string, repo SettingsRepository) *SettingsService {
	return &SettingsService{configPath: configPath, repo: repo}
}

func (s *SettingsService) Current(ctx context.Context) (SettingsSnapshot, error) {
	resolved, err := s.LoadResolved(ctx)
	if err != nil {
		return SettingsSnapshot{}, err
	}
	return SettingsSnapshot{
		Endpoint:   resolved.BaseURL,
		Model:      resolved.Model,
		APIKeySet:  strings.TrimSpace(resolved.APIKey) != "",
		APIKeyHint: maskAPIKey(resolved.APIKey),
	}, nil
}

func (s *SettingsService) Update(ctx context.Context, update SettingsUpdate) (SettingsSnapshot, error) {
	if s.repo == nil {
		return SettingsSnapshot{}, errors.New("AI settings repository not configured")
	}

	current, err := s.repo.LoadAISettings(ctx)
	if err != nil {
		return SettingsSnapshot{}, fmt.Errorf("load settings: %w", err)
	}

	if strings.TrimSpace(update.Endpoint) != "" {
		endpoint, err := normalizeEndpoint(update.Endpoint)
		if err != nil {
			return SettingsSnapshot{}, err
		}
		current.Endpoint = endpoint
	}
	if strings.TrimSpace(update.Model) != "" {
		current.Model = strings.TrimSpace(update.Model)
	}
	if strings.TrimSpace(update.APIKey) != "" {
		current.APIKey = strings.TrimSpace(update.APIKey)
	}
	if current.Endpoint == "" || current.Model == "" {
		resolved, err := s.LoadResolved(ctx)
		if err != nil {
			return SettingsSnapshot{}, err
		}
		if current.Endpoint == "" {
			current.Endpoint = resolved.BaseURL
		}
		if current.Model == "" {
			current.Model = resolved.Model
		}
	}

	if err := s.repo.SaveAISettings(ctx, current); err != nil {
		return SettingsSnapshot{}, fmt.Errorf("save settings: %w", err)
	}
	return s.Current(ctx)
}

func (s *SettingsService) LoadResolved(ctx context.Context) (ResolvedConfig, error) {
	cfg, err := readConfigFile(s.configPath)
	if err != nil {
		return ResolvedConfig{}, err
	}

	overrides := settingsOverrides{}
	if s.repo != nil {
		overrides, err = s.repo.LoadAISettings(ctx)
		if err != nil {
			return ResolvedConfig{}, fmt.Errorf("load settings: %w", err)
		}
	}

	baseURL := cfg.Provider.BaseURL
	if endpoint := strings.TrimSpace(os.Getenv("OPENAI_ENDPOINT")); endpoint != "" {
		baseURL = endpoint
	}
	if overrides.Endpoint != "" {
		baseURL = overrides.Endpoint
	}
	baseURL, err = normalizeEndpoint(baseURL)
	if err != nil {
		return ResolvedConfig{}, err
	}

	apiKey := os.Getenv(cfg.Provider.APIKeyEnv)
	if overrides.APIKey != "" {
		apiKey = overrides.APIKey
	}
	model := cfg.Provider.Model
	if overrides.Model != "" {
		model = overrides.Model
	}

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
		BaseURL:    baseURL,
		APIKey:     apiKey,
		Model:      model,
		MaxRetries: maxRetries,
		Timeout:    timeout,
		BatchSize:  batchSize,
	}, nil
}

func readConfigFile(path string) (Config, error) {
	if path == "" {
		return Config{}, errors.New("AI config path not set")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	return cfg, nil
}

func normalizeEndpoint(raw string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
	if trimmed == "" {
		return "", errors.New("endpoint is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("endpoint must be a valid http(s) URL")
	}
	if !strings.HasSuffix(trimmed, "/v1") {
		trimmed += "/v1"
	}
	return trimmed, nil
}

func maskAPIKey(key string) string {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 8 {
		return "***"
	}
	return trimmed[:3] + "..." + trimmed[len(trimmed)-4:]
}
