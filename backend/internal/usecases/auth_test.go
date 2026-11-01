package usecases

import (
	"context"
	"fmt"
	"testing"
	"time"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/jackc/pgx/v5/pgxpool"
)

func getTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := "postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	pool, err := repository.NewPool(ctx, dbURL)
	if err != nil {
		t.Skipf("Skipping integration test: PostgreSQL not reachable: %v", err)
	}
	return pool
}

func TestAuthUsecase_SessionsManagement(t *testing.T) {
	pool := getTestPool(t)
	defer pool.Close()

	cfg := &config.Config{
		AppEnv:          "test",
		JWTSecret:       "devflow_usecase_test_secret_key_at_least_32_bytes!",
		JWTAccessTTL:    15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
	}
	queries := repository.New(pool)
	uc := NewAuthUsecase(cfg, pool, queries)

	ctx := context.Background()
	email := fmt.Sprintf("usecase_session_%d@devflow.local", time.Now().UnixNano())
	pwd := "Password123456!"

	// 1. Register user
	user, err := uc.Register(ctx, domain.RegisterInput{
		Email:    email,
		Password: pwd,
		Name:     "Session Tester",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// 2. Login twice to create 2 active sessions
	tokens1, rawToken1, err := uc.Login(ctx, domain.LoginInput{
		Email:    email,
		Password: pwd,
	})
	if err != nil {
		t.Fatalf("Login 1 failed: %v", err)
	}
	if tokens1.AccessToken == "" {
		t.Fatalf("expected access token")
	}

	_, rawToken2, err := uc.Login(ctx, domain.LoginInput{
		Email:    email,
		Password: pwd,
	})
	if err != nil {
		t.Fatalf("Login 2 failed: %v", err)
	}

	// 3. List active sessions
	sessions, err := uc.ListSessions(ctx, user.ID, rawToken1)
	if err != nil {
		t.Fatalf("ListSessions failed: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 active sessions, got %d", len(sessions))
	}

	// Verify IsCurrent flag
	hasCurrent := false
	for _, s := range sessions {
		if s.IsCurrent {
			hasCurrent = true
		}
	}
	if !hasCurrent {
		t.Fatalf("expected at least one session to be flagged as current")
	}

	// 4. Test rotating session 1 first while both are active
	tokensRotated, newRawToken1, err := uc.RefreshToken(ctx, rawToken1)
	if err != nil {
		t.Fatalf("expected RefreshToken with session 1 to succeed, got: %v", err)
	}
	if tokensRotated.AccessToken == "" || newRawToken1 == "" {
		t.Fatalf("expected rotated access token and refresh token")
	}

	// 5. Revoke session 2 explicitly by ID
	var session2ID = sessions[0].ID
	if sessions[0].IsCurrent {
		session2ID = sessions[1].ID
	}

	err = uc.RevokeSession(ctx, user.ID, session2ID)
	if err != nil {
		t.Fatalf("RevokeSession failed: %v", err)
	}

	// 6. Verify only 1 active session remains (the rotated session 1)
	sessionsAfter, err := uc.ListSessions(ctx, user.ID, newRawToken1)
	if err != nil {
		t.Fatalf("ListSessions after revocation failed: %v", err)
	}
	if len(sessionsAfter) != 1 {
		t.Fatalf("expected 1 active session after revocation, got %d", len(sessionsAfter))
	}

	// 7. Attempting to refresh with the revoked session 2 triggers reuse/theft detection
	_, _, err = uc.RefreshToken(ctx, rawToken2)
	if err == nil {
		t.Fatalf("expected RefreshToken to fail with revoked session 2, but succeeded")
	}
}

func TestAuthUsecase_PasswordPolicyErrors(t *testing.T) {
	cfg := &config.Config{
		AppEnv:    "test",
		JWTSecret: "devflow_usecase_test_secret_key_at_least_32_bytes!",
	}
	uc := NewAuthUsecase(cfg, nil, nil)
	ctx := context.Background()

	_, err := uc.Register(ctx, domain.RegisterInput{
		Email:    "test@devflow.local",
		Password: "short",
	})
	if err == nil {
		t.Fatalf("expected password validation error, got nil")
	}
}
