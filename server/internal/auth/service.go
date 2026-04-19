package auth

import (
	"context"
	"errors"
)

var (
	ErrNotAllowlisted = errors.New("user not on allowlist")
	ErrInvalidState   = errors.New("invalid or expired CSRF state")
)

type GitHubUser struct {
	GitHubID  int64
	Username  string
	AvatarURL string
}

type GitHubClient interface {
	AuthCodeURL(state string) string
	ExchangeCode(ctx context.Context, code string) (token string, err error)
	FetchUser(ctx context.Context, token string) (*GitHubUser, error)
}

type StateStore interface {
	Save(ctx context.Context, state string) error
	Verify(ctx context.Context, state string) (bool, error)
}

type AllowlistChecker interface {
	IsAllowlisted(ctx context.Context, username string) (bool, error)
}

type UserStore interface {
	UpsertUser(ctx context.Context, githubID int64, username, avatarURL string) (userID int64, err error)
}

type SessionCreator interface {
	Create(ctx context.Context, userID int64, userAgent string) (sessionID string, err error)
}

type Service struct {
	GitHub     GitHubClient
	States     StateStore
	Allowlist  AllowlistChecker
	Users      UserStore
	Sessions   SessionCreator
}

type CallbackResult struct {
	SessionID string
	UserID    int64
}

func (s *Service) BeginLogin() (redirectURL string, err error) {
	state := generateState()
	if err := s.States.Save(context.Background(), state); err != nil {
		return "", err
	}
	return s.GitHub.AuthCodeURL(state), nil
}

func (s *Service) Callback(ctx context.Context, state, code, userAgent string) (*CallbackResult, error) {
	ok, err := s.States.Verify(ctx, state)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInvalidState
	}

	token, err := s.GitHub.ExchangeCode(ctx, code)
	if err != nil {
		return nil, err
	}

	ghUser, err := s.GitHub.FetchUser(ctx, token)
	if err != nil {
		return nil, err
	}

	allowed, err := s.Allowlist.IsAllowlisted(ctx, ghUser.Username)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrNotAllowlisted
	}

	userID, err := s.Users.UpsertUser(ctx, ghUser.GitHubID, ghUser.Username, ghUser.AvatarURL)
	if err != nil {
		return nil, err
	}

	sessionID, err := s.Sessions.Create(ctx, userID, userAgent)
	if err != nil {
		return nil, err
	}

	return &CallbackResult{SessionID: sessionID, UserID: userID}, nil
}
