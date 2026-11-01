package usecases

import (
	"context"
	"errors"
	"strings"
	"time"

	"devflow/backend/internal/auth"
	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuthUsecase defines the interface for authentication operations.
type AuthUsecase interface {
	Register(ctx context.Context, input domain.RegisterInput) (*domain.UserResponse, error)
	Login(ctx context.Context, input domain.LoginInput) (*domain.AuthTokens, string, error)
	RefreshToken(ctx context.Context, rawRefreshToken string) (*domain.AuthTokens, string, error)
	Logout(ctx context.Context, rawRefreshToken string) error
	GetCurrentUser(ctx context.Context, userID uuid.UUID) (*domain.UserResponse, error)
	ListSessions(ctx context.Context, userID uuid.UUID, currentRawRefreshToken string) ([]domain.SessionResponse, error)
	RevokeSession(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error
}

type authUsecase struct {
	cfg     *config.Config
	pool    *pgxpool.Pool
	queries *repository.Queries
}

// NewAuthUsecase creates a new AuthUsecase instance with the given configuration, database pool, and queries.
func NewAuthUsecase(cfg *config.Config, pool *pgxpool.Pool, queries *repository.Queries) AuthUsecase {
	return &authUsecase{
		cfg:     cfg,
		pool:    pool,
		queries: queries,
	}
}

// UUID conversion helpers
func uuidToPgtype(u uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: u, Valid: true}
}

func pgtypeToUUID(p pgtype.UUID) uuid.UUID {
	if !p.Valid {
		return uuid.Nil
	}
	return uuid.UUID(p.Bytes)
}

func toUserResponse(u repository.User) domain.UserResponse {
	var namePtr *string
	if u.Name.Valid {
		nameStr := u.Name.String
		namePtr = &nameStr
	}

	var avatarPtr *string
	if u.AvatarUrl.Valid {
		avatarStr := u.AvatarUrl.String
		avatarPtr = &avatarStr
	}

	var updatedAtPtr *time.Time
	if u.UpdatedAt.Valid {
		t := u.UpdatedAt.Time
		updatedAtPtr = &t
	}

	return domain.UserResponse{
		ID:        pgtypeToUUID(u.ID),
		Email:     u.Email,
		Name:      namePtr,
		AvatarURL: avatarPtr,
		CreatedAt: u.CreatedAt.Time,
		UpdatedAt: updatedAtPtr,
	}
}

// Register creates a new user account with an Argon2id hashed password.
func (u *authUsecase) Register(ctx context.Context, input domain.RegisterInput) (*domain.UserResponse, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email == "" {
		return nil, domain.NewValidationError("Email address is required", nil)
	}

	if err := auth.ValidatePassword(input.Password); err != nil {
		return nil, domain.NewValidationError(err.Error(), nil)
	}

	// 1. Check if user already exists
	existing, err := u.queries.GetUserByEmail(ctx, email)
	if err == nil && existing.ID.Valid {
		return nil, domain.NewConflictError("A user with this email address already exists")
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NewInternalError("Database error checking user existence", err)
	}

	// 2. Hash password with Argon2id
	passwordHash, err := auth.HashPassword(input.Password)
	if err != nil {
		return nil, domain.NewInternalError("Failed to hash password", err)
	}

	var nameText pgtype.Text
	trimmedName := strings.TrimSpace(input.Name)
	if trimmedName != "" {
		nameText = pgtype.Text{String: trimmedName, Valid: true}
	}

	// 3. Persist user atomically
	user, err := u.queries.CreateUser(ctx, repository.CreateUserParams{
		Lower:        email,
		PasswordHash: passwordHash,
		Name:         nameText,
		AvatarUrl:    pgtype.Text{Valid: false},
	})
	if err != nil {
		// Detect unique constraint violation in case of concurrent insert
		if strings.Contains(err.Error(), "users_email_ci_idx") || strings.Contains(err.Error(), "users_email_key") {
			return nil, domain.NewConflictError("A user with this email address already exists")
		}
		return nil, domain.NewInternalError("Failed to persist user", err)
	}

	res := toUserResponse(user)
	return &res, nil
}

// Login verifies credentials and issues a JWT access token and HttpOnly refresh token.
func (u *authUsecase) Login(ctx context.Context, input domain.LoginInput) (*domain.AuthTokens, string, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email == "" || input.Password == "" {
		return nil, "", domain.NewUnauthorizedError("Invalid email or password")
	}

	// 1. Lookup user by email
	user, err := u.queries.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Generic message to avoid email enumeration
			return nil, "", domain.NewUnauthorizedError("Invalid email or password")
		}
		return nil, "", domain.NewInternalError("Failed to lookup user", err)
	}

	// 2. Verify password with constant-time comparison
	match, err := auth.VerifyPassword(input.Password, user.PasswordHash)
	if err != nil || !match {
		return nil, "", domain.NewUnauthorizedError("Invalid email or password")
	}

	userUUID := pgtypeToUUID(user.ID)

	// 3. Generate short-lived JWT access token
	accessToken, err := auth.GenerateAccessToken(userUUID, user.Email, u.cfg.JWTSecret, u.cfg.JWTAccessTTL)
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to generate access token", err)
	}

	// 4. Generate opaque refresh token and compute SHA-256 hash
	rawRefreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to generate refresh token", err)
	}
	tokenHash := auth.HashRefreshToken(rawRefreshToken)

	expiresAt := time.Now().UTC().Add(u.cfg.RefreshTokenTTL)
	_, err = u.queries.CreateRefreshSession(ctx, repository.CreateRefreshSessionParams{
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to create refresh session", err)
	}

	tokens := &domain.AuthTokens{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(u.cfg.JWTAccessTTL.Seconds()),
		User:        toUserResponse(user),
	}

	return tokens, rawRefreshToken, nil
}

// RefreshToken rotates the refresh token and issues a new access token.
// It implements concurrency control via SELECT ... FOR UPDATE and reuse detection.
func (u *authUsecase) RefreshToken(ctx context.Context, rawRefreshToken string) (*domain.AuthTokens, string, error) {
	if strings.TrimSpace(rawRefreshToken) == "" {
		return nil, "", domain.NewUnauthorizedError("Refresh token is required")
	}

	tokenHash := auth.HashRefreshToken(rawRefreshToken)

	if u.pool == nil {
		return nil, "", domain.NewInternalError("Database pool not available", nil)
	}

	// Begin atomic transaction
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx) // Safe to call: no-op if tx.Commit succeeded

	qtx := u.queries.WithTx(tx)

	// 1. Lock and inspect the session row
	session, err := qtx.GetRefreshSessionByTokenHashForUpdate(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", domain.NewUnauthorizedError("Invalid or non-existent refresh session")
		}
		return nil, "", domain.NewInternalError("Failed to query refresh session", err)
	}

	// 2. REUSE DETECTION: If token was already revoked, someone is replaying an old token!
	if session.RevokedAt.Valid {
		// Compromise suspected! Revoke all sessions for this user family
		_ = qtx.RevokeAllUserRefreshSessions(ctx, session.UserID)
		_ = tx.Commit(ctx)
		return nil, "", domain.NewUnauthorizedError("Refresh token reuse detected; all active sessions have been revoked")
	}

	// 3. Expiration check
	now := time.Now().UTC()
	if session.ExpiresAt.Valid && session.ExpiresAt.Time.Before(now) {
		// Mark expired session revoked
		_, _ = qtx.RevokeRefreshSessionByTokenHash(ctx, tokenHash)
		_ = tx.Commit(ctx)
		return nil, "", domain.NewUnauthorizedError("Refresh session has expired")
	}

	// 4. Token is valid: Revoke the current token
	_, err = qtx.RevokeRefreshSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to revoke previous session", err)
	}

	// 5. Issue new rotated refresh token
	newRawRefreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to generate rotated refresh token", err)
	}
	newTokenHash := auth.HashRefreshToken(newRawRefreshToken)
	newExpiresAt := now.Add(u.cfg.RefreshTokenTTL)

	_, err = qtx.CreateRefreshSession(ctx, repository.CreateRefreshSessionParams{
		UserID:    session.UserID,
		TokenHash: newTokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: newExpiresAt, Valid: true},
	})
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to create rotated refresh session", err)
	}

	// 6. Fetch user profile
	user, err := qtx.GetUserByID(ctx, session.UserID)
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to retrieve user profile", err)
	}

	// 7. Generate new short-lived JWT access token
	userUUID := pgtypeToUUID(user.ID)
	newAccessToken, err := auth.GenerateAccessToken(userUUID, user.Email, u.cfg.JWTSecret, u.cfg.JWTAccessTTL)
	if err != nil {
		return nil, "", domain.NewInternalError("Failed to generate access token", err)
	}

	// 8. Commit atomic transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, "", domain.NewInternalError("Failed to commit session rotation", err)
	}

	tokens := &domain.AuthTokens{
		AccessToken: newAccessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(u.cfg.JWTAccessTTL.Seconds()),
		User:        toUserResponse(user),
	}

	return tokens, newRawRefreshToken, nil
}

// Logout revokes the active refresh session and invalidates the session token.
func (u *authUsecase) Logout(ctx context.Context, rawRefreshToken string) error {
	if strings.TrimSpace(rawRefreshToken) == "" {
		return nil
	}

	tokenHash := auth.HashRefreshToken(rawRefreshToken)
	_, _ = u.queries.RevokeRefreshSessionByTokenHash(ctx, tokenHash)
	return nil
}

// GetCurrentUser returns the public profile of the authenticated user.
func (u *authUsecase) GetCurrentUser(ctx context.Context, userID uuid.UUID) (*domain.UserResponse, error) {
	pgID := uuidToPgtype(userID)
	user, err := u.queries.GetUserByID(ctx, pgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("User not found")
		}
		return nil, domain.NewInternalError("Failed to lookup user profile", err)
	}

	res := toUserResponse(user)
	return &res, nil
}

// ListSessions lists all active non-expired refresh sessions for the authenticated user.
func (u *authUsecase) ListSessions(ctx context.Context, userID uuid.UUID, currentRawRefreshToken string) ([]domain.SessionResponse, error) {
	pgID := uuidToPgtype(userID)
	sessions, err := u.queries.ListActiveUserRefreshSessions(ctx, pgID)
	if err != nil {
		return nil, domain.NewInternalError("Failed to list active sessions", err)
	}

	var currentHash string
	if currentRawRefreshToken != "" {
		currentHash = auth.HashRefreshToken(currentRawRefreshToken)
	}

	result := make([]domain.SessionResponse, 0, len(sessions))
	for _, s := range sessions {
		result = append(result, domain.SessionResponse{
			ID:        pgtypeToUUID(s.ID),
			ExpiresAt: s.ExpiresAt.Time,
			CreatedAt: s.CreatedAt.Time,
			IsCurrent: currentHash != "" && s.TokenHash == currentHash,
		})
	}

	return result, nil
}

// RevokeSession revokes a specific refresh session belonging to the authenticated user.
func (u *authUsecase) RevokeSession(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error {
	pgUserID := uuidToPgtype(userID)
	pgSessionID := uuidToPgtype(sessionID)

	_, err := u.queries.RevokeRefreshSessionByID(ctx, repository.RevokeRefreshSessionByIDParams{
		ID:     pgSessionID,
		UserID: pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Session not found or already revoked")
		}
		return domain.NewInternalError("Failed to revoke session", err)
	}

	return nil
}
