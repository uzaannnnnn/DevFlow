package middleware

import (
	"errors"
	"net/http"
	"strings"

	"devflow/backend/internal/auth"
	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// AuthUserIDKey is the context key for the authenticated user's UUID.
	AuthUserIDKey = "auth_user_id"
	// AuthUserEmailKey is the context key for the authenticated user's email.
	AuthUserEmailKey = "auth_user_email"
)

var (
	ErrUnauthenticated = errors.New("unauthenticated: missing or invalid authentication token")
)

// RequireAuth returns a Gin middleware that extracts and validates the Bearer JWT access token.
// If valid, it stores the authenticated user's UUID and email in the gin.Context.
// If missing, expired, or invalid, it aborts with HTTP 401 Unauthorized in the standard JSON envelope.
func RequireAuth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, domain.ErrorResponse{
				Success: false,
				Error: domain.APIError{
					Code:    domain.ErrCodeUnauthorized,
					Message: "Authentication required",
					Details: []any{},
				},
			})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, domain.ErrorResponse{
				Success: false,
				Error: domain.APIError{
					Code:    domain.ErrCodeUnauthorized,
					Message: "Malformed authorization header. Expected 'Bearer <token>'",
					Details: []any{},
				},
			})
			return
		}

		tokenString := strings.TrimSpace(parts[1])
		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, domain.ErrorResponse{
				Success: false,
				Error: domain.APIError{
					Code:    domain.ErrCodeUnauthorized,
					Message: "Missing access token",
					Details: []any{},
				},
			})
			return
		}

		claims, err := auth.ValidateAccessToken(tokenString, jwtSecret)
		if err != nil {
			msg := "Invalid or expired access token"
			if errors.Is(err, auth.ErrExpiredAccessToken) {
				msg = "Access token has expired"
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, domain.ErrorResponse{
				Success: false,
				Error: domain.APIError{
					Code:    domain.ErrCodeUnauthorized,
					Message: msg,
					Details: []any{},
				},
			})
			return
		}

		// Attach authenticated user identity to context
		c.Set(AuthUserIDKey, claims.UserID)
		c.Set(AuthUserEmailKey, claims.Email)

		c.Next()
	}
}

// GetAuthenticatedUserID retrieves the verified user UUID from the gin.Context.
func GetAuthenticatedUserID(c *gin.Context) (uuid.UUID, error) {
	val, exists := c.Get(AuthUserIDKey)
	if !exists {
		return uuid.Nil, ErrUnauthenticated
	}

	id, ok := val.(uuid.UUID)
	if !ok || id == uuid.Nil {
		return uuid.Nil, ErrUnauthenticated
	}

	return id, nil
}

// GetAuthenticatedUserEmail retrieves the verified user email from the gin.Context.
func GetAuthenticatedUserEmail(c *gin.Context) string {
	val, exists := c.Get(AuthUserEmailKey)
	if !exists {
		return ""
	}

	email, ok := val.(string)
	if !ok {
		return ""
	}

	return email
}

