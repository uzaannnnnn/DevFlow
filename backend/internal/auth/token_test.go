package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const testSecret = "devflow_super_secret_test_key_at_least_32_bytes!!"

func TestGenerateAndValidateAccessToken(t *testing.T) {
	userID := uuid.New()
	email := "engineer@devflow.local"
	ttl := 15 * time.Minute

	tokenString, err := GenerateAccessToken(userID, email, testSecret, ttl)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	if tokenString == "" {
		t.Fatalf("expected non-empty token string")
	}

	claims, err := ValidateAccessToken(tokenString, testSecret)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected UserID %v, got %v", userID, claims.UserID)
	}
	if claims.Email != email {
		t.Errorf("expected Email %s, got %s", email, claims.Email)
	}
}

func TestValidateAccessToken_Expired(t *testing.T) {
	userID := uuid.New()
	email := "expired@devflow.local"
	// Negative TTL to simulate already-expired token
	ttl := -1 * time.Minute

	tokenString, err := GenerateAccessToken(userID, email, testSecret, ttl)
	if err != nil {
		t.Fatalf("failed to create expired token: %v", err)
	}

	_, err = ValidateAccessToken(tokenString, testSecret)
	if !errors.Is(err, ErrExpiredAccessToken) {
		t.Fatalf("expected ErrExpiredAccessToken, got %v", err)
	}
}

func TestValidateAccessToken_InvalidSecret(t *testing.T) {
	userID := uuid.New()
	email := "wrongsecret@devflow.local"
	tokenString, err := GenerateAccessToken(userID, email, testSecret, 15*time.Minute)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	wrongSecret := "another_completely_different_secret_key_32_bytes!"
	_, err = ValidateAccessToken(tokenString, wrongSecret)
	if err == nil {
		t.Fatalf("expected error validating with wrong secret, got nil")
	}
}

func TestValidateAccessToken_SecretTooShort(t *testing.T) {
	userID := uuid.New()
	_, err := GenerateAccessToken(userID, "a@b.com", "too_short", 15*time.Minute)
	if err == nil {
		t.Fatalf("expected error generating token with secret < 32 chars")
	}

	_, err = ValidateAccessToken("some.token.here", "too_short")
	if err == nil {
		t.Fatalf("expected error validating token with secret < 32 chars")
	}
}

func TestValidateAccessToken_AlgorithmNoneRejected(t *testing.T) {
	claims := AccessTokenClaims{
		UserID: uuid.New(),
		Email:  "hacker@devflow.local",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}

	// Forge token with "none" algorithm
	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokenString, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("failed to create unsigned token: %v", err)
	}

	_, err = ValidateAccessToken(tokenString, testSecret)
	if err == nil {
		t.Fatalf("expected 'none' algorithm token to be rejected, but it was accepted!")
	}
}

func TestValidateAccessToken_RSAAlgorithmConfusion(t *testing.T) {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}

	claims := AccessTokenClaims{
		UserID: uuid.New(),
		Email:  "rsa_user@devflow.local",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, err := token.SignedString(privKey)
	if err != nil {
		t.Fatalf("failed to sign with RSA: %v", err)
	}

	_, err = ValidateAccessToken(tokenString, testSecret)
	if err == nil {
		t.Fatalf("expected RS256 token to be rejected when validating against HMAC secret")
	}
}

func TestRefreshToken_GenerationAndHashing(t *testing.T) {
	token1, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	token2, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	if token1 == token2 {
		t.Fatalf("expected distinct refresh tokens")
	}

	// Base64 URL Raw check (32 bytes = 43 chars in unpadded base64)
	if len(token1) != 43 {
		t.Fatalf("expected 43 character unpadded base64 token, got len %d: %s", len(token1), token1)
	}

	hash1 := HashRefreshToken(token1)
	hash2 := HashRefreshToken(token2)

	// SHA-256 hex string must be exactly 64 characters
	if len(hash1) != 64 || len(hash2) != 64 {
		t.Fatalf("expected 64 char hex hash, got len %d and %d", len(hash1), len(hash2))
	}

	if hash1 == hash2 {
		t.Fatalf("expected distinct hashes for distinct tokens")
	}

	// Verify constant-time validation
	if !VerifyRefreshToken(token1, hash1) {
		t.Fatalf("VerifyRefreshToken failed on valid token and hash")
	}
	if VerifyRefreshToken(token1, hash2) {
		t.Fatalf("VerifyRefreshToken matched wrong hash!")
	}
	if VerifyRefreshToken("invalid_token", hash1) {
		t.Fatalf("VerifyRefreshToken matched invalid token!")
	}
}
