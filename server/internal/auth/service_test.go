package auth

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

type mockGitHub struct {
	user *GitHubUser
	err  error
}

func (m *mockGitHub) AuthCodeURL(state string) string {
	return "https://github.com/login/oauth/authorize?state=" + state
}

func (m *mockGitHub) ExchangeCode(_ context.Context, _ string) (string, error) {
	return "mock-token", m.err
}

func (m *mockGitHub) FetchUser(_ context.Context, _ string) (*GitHubUser, error) {
	return m.user, m.err
}

type mockStateStore struct {
	states map[string]bool
}

func newMockStateStore() *mockStateStore {
	return &mockStateStore{states: make(map[string]bool)}
}

func (m *mockStateStore) Save(_ context.Context, state string) error {
	m.states[state] = true
	return nil
}

func (m *mockStateStore) Verify(_ context.Context, state string) (bool, error) {
	if m.states[state] {
		delete(m.states, state)
		return true, nil
	}
	return false, nil
}

type mockAllowlist struct {
	allowed map[string]bool
}

func (m *mockAllowlist) IsAllowlisted(_ context.Context, username string) (bool, error) {
	return m.allowed[username], nil
}

type mockUserStore struct {
	nextID int64
}

func (m *mockUserStore) UpsertUser(_ context.Context, _ int64, _, _ string) (int64, error) {
	m.nextID++
	return m.nextID, nil
}

type mockSessionCreator struct{}

func (m *mockSessionCreator) Create(_ context.Context, _ int64, _ string) (string, error) {
	return "session-123", nil
}

func newTestService(ghUser *GitHubUser, allowedUsers []string) *Service {
	allowed := make(map[string]bool)
	for _, u := range allowedUsers {
		allowed[u] = true
	}
	return &Service{
		GitHub:    &mockGitHub{user: ghUser},
		States:    newMockStateStore(),
		Allowlist: &mockAllowlist{allowed: allowed},
		Users:     &mockUserStore{},
		Sessions:  &mockSessionCreator{},
	}
}

func TestAuthService_Callback_DeniesUnallowlistedUser(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 123, Username: "stranger"},
		[]string{"alice", "bob"},
	)
	// Pre-save a state
	ctx := context.Background()
	_ = svc.States.Save(ctx, "valid-state")

	_, err := svc.Callback(ctx, "valid-state", "gh-code", "test-agent")
	require.ErrorIs(t, err, ErrNotAllowlisted)
}

func TestAuthService_Callback_HappyPath_CreatesUserAndSession(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 456, Username: "alice", AvatarURL: "https://avatar"},
		[]string{"alice"},
	)
	ctx := context.Background()
	_ = svc.States.Save(ctx, "valid-state")

	result, err := svc.Callback(ctx, "valid-state", "gh-code", "test-agent")
	require.NoError(t, err)
	require.Equal(t, "session-123", result.SessionID)
	require.Greater(t, result.UserID, int64(0))
}

func TestAuthService_Callback_RejectsInvalidState(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 123, Username: "alice"},
		[]string{"alice"},
	)
	ctx := context.Background()

	_, err := svc.Callback(ctx, "bad-state", "gh-code", "test-agent")
	require.ErrorIs(t, err, ErrInvalidState)
}
