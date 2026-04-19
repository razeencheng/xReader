package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
	oauthgithub "golang.org/x/oauth2/github"
)

type RealGitHubClient struct {
	config *oauth2.Config
}

func NewGitHubClient(clientID, clientSecret, callbackURL string) *RealGitHubClient {
	return &RealGitHubClient{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  callbackURL,
			Endpoint:     oauthgithub.Endpoint,
			Scopes:       []string{"read:user"},
		},
	}
}

func (c *RealGitHubClient) AuthCodeURL(state string) string {
	return c.config.AuthCodeURL(state)
}

func (c *RealGitHubClient) ExchangeCode(ctx context.Context, code string) (string, error) {
	token, err := c.config.Exchange(ctx, code)
	if err != nil {
		return "", fmt.Errorf("exchange code: %w", err)
	}
	return token.AccessToken, nil
}

func (c *RealGitHubClient) FetchUser(ctx context.Context, token string) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var ghResp struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ghResp); err != nil {
		return nil, err
	}

	return &GitHubUser{
		GitHubID:  ghResp.ID,
		Username:  ghResp.Login,
		AvatarURL: ghResp.AvatarURL,
	}, nil
}
