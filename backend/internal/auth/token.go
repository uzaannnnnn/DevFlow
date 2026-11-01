package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	// ErrInvalidAccessToken is returned when a JWT is malformed, has an invalid signature, or wrong claims.
	ErrInvalidAccessToken = errors.New("invalid or malformed access token")
	// ErrExpiredAccessToken is returned when a JWT has passed its expiration time.
	ErrExpiredAccessToken = errors.New("access token has expired")
	// ErrInvalidSigningMethod is returned when the token uses an algorithm other than HMAC-SHA256.
	ErrInvalidSigningMethod = errors.New("unexpected token signing algorithm")
)

// AccessTokenClaims represents the payload stored inside a DevFlow JWT access token.
type AccessTokenClaims struct {
	UserID uuid.UUID `json:"sub"`
	Email  string    `json:"email"`
	jwt.RegisteredClaims
}

// GenerateAccessToken creates a short-lived JWT access token signed with HMAC-SHA256.
func GenerateAccessToken(userID uuid.UUID, email string, secret string, ttl time.Duration) (string, error) {
	if len(secret) < 32 {
		return "", fmt.Errorf("JWT secret must be at least 32 characters long")
	}

	now := time.Now().UTC()
	claims := AccessTokenClaims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("failed to sign access token: %w", err)
	}

	return tokenString, nil
}

// ValidateAccessToken parses and validates a JWT access token against the given HMAC secret.
// It strictly enforces the HS256 signing method and checks expiration.
func ValidateAccessToken(tokenString string, secret string) (*AccessTokenClaims, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("JWT secret must be at least 32 characters long")
	}

	token, err := jwt.ParseWithClaims(tokenString, &AccessTokenClaims{}, func(token *jwt.Token) (any, error) {
		// Enforce HS256 only
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("%w: %v", ErrInvalidSigningMethod, token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredAccessToken
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidAccessToken, err)
	}

	claims, ok := token.Claims.(*AccessTokenClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidAccessToken
	}

	if claims.UserID == uuid.Nil {
		// Fallback: try parsing from Subject string if UserID was not populated directly from sub
		if claims.Subject != "" {
			parsedID, parseErr := uuid.Parse(claims.Subject)
			if parseErr != nil {
				return nil, ErrInvalidAccessToken
			}
			claims.UserID = parsedID
		} else {
			return nil, ErrInvalidAccessToken
		}
	}

	return claims, nil
}

// GenerateRefreshToken generates a cryptographically secure random token (32 bytes = 256 bits).
// The plaintext token is safe for URL / cookie transmission (base64 URL raw encoded).
func GenerateRefreshToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random refresh token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// HashRefreshToken computes the SHA-256 hash of a plaintext refresh token.
// The resulting 64-character hex string is stored in refresh_sessions.token_hash.
func HashRefreshToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// VerifyRefreshToken verifies a plaintext refresh token against a stored SHA-256 hex hash
// using a constant-time comparison to prevent timing attacks.
func VerifyRefreshToken(token string, expectedHash string) bool {
	computedHash := HashRefreshToken(token)
	return subtle.ConstantTimeCompare([]byte(computedHash), []byte(expectedHash)) == 1
}
