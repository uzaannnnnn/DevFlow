package domain

import (
	"time"

	"github.com/google/uuid"
)

// RegisterInput represents the payload submitted to POST /api/v1/auth/register.
type RegisterInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8,max=72"`
	Name     string `json:"name"`
}

// LoginInput represents the payload submitted to POST /api/v1/auth/login.
type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// UserResponse represents the public user profile returned by the API.
// Note: PasswordHash is strictly excluded per security specification.
type UserResponse struct {
	ID        uuid.UUID  `json:"id"`
	Email     string     `json:"email"`
	Name      *string    `json:"name"`
	AvatarURL *string    `json:"avatar_url"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

// AuthTokens represents the token response envelope returned on login or token refresh.
// Note: RefreshToken is transmitted ONLY via HttpOnly cookie and is strictly excluded from JSON.
type AuthTokens struct {
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	ExpiresIn   int64        `json:"expires_in"` // Expiry in seconds
	User        UserResponse `json:"user"`
}

// SessionResponse represents an active refresh session listed in GET /api/v1/auth/sessions.
type SessionResponse struct {
	ID        uuid.UUID `json:"id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	IsCurrent bool      `json:"is_current"`
}
