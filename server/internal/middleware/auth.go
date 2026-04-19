package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/auth"
)

type User struct {
	ID              int64  `json:"id"`
	GitHubID        int64  `json:"github_id"`
	GitHubUsername  string `json:"github_username"`
	AvatarURL       string `json:"avatar_url,omitempty"`
	NativeLanguage  string `json:"native_language"`
	Role            string `json:"role"`
	DensityPref     string `json:"density_pref"`
	ThemePref       string `json:"theme_pref"`
}

func RequireAuth(sessions auth.SessionStore, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, err := c.Cookie("xreader_session")
		if err != nil || cookie == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}

		userID, err := sessions.Get(c.Request.Context(), cookie)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired"})
			return
		}

		var u User
		var avatarURL *string
		err = pool.QueryRow(c.Request.Context(),
			"SELECT id, github_id, github_username, avatar_url, native_language, role, density_pref, theme_pref FROM users WHERE id = $1",
			userID,
		).Scan(&u.ID, &u.GitHubID, &u.GitHubUsername, &avatarURL, &u.NativeLanguage, &u.Role, &u.DensityPref, &u.ThemePref)
		if avatarURL != nil {
			u.AvatarURL = *avatarURL
		}
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		_ = sessions.Touch(c.Request.Context(), cookie)
		c.Set("user", &u)
		c.Next()
	}
}

func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, exists := c.Get("user")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}
		user := u.(*User)
		if user.Role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin required"})
			return
		}
		c.Next()
	}
}

func GetUser(c *gin.Context) *User {
	u, exists := c.Get("user")
	if !exists {
		return nil
	}
	return u.(*User)
}
