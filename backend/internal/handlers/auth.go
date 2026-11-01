package handlers

import (
	"errors"
	"net/http"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/middleware"
	"devflow/backend/internal/usecases"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AuthHandler handles authentication and session endpoints.
type AuthHandler struct {
	cfg     *config.Config
	usecase usecases.AuthUsecase
}

// NewAuthHandler creates a new AuthHandler instance.
func NewAuthHandler(cfg *config.Config, usecase usecases.AuthUsecase) *AuthHandler {
	return &AuthHandler{
		cfg:     cfg,
		usecase: usecase,
	}
}

func (h *AuthHandler) setRefreshTokenCookie(c *gin.Context, rawToken string) {
	cookieDomain := h.cfg.CookieDomain
	if cookieDomain == "localhost" || cookieDomain == "" {
		cookieDomain = "" // Host-only cookie in development
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"refresh_token",
		rawToken,
		int(h.cfg.RefreshTokenTTL.Seconds()),
		"/", // Path scoped to allow refresh & logout across api
		cookieDomain,
		h.cfg.CookieSecure,
		true, // HttpOnly
	)
}

func (h *AuthHandler) clearRefreshTokenCookie(c *gin.Context) {
	cookieDomain := h.cfg.CookieDomain
	if cookieDomain == "localhost" || cookieDomain == "" {
		cookieDomain = ""
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"refresh_token",
		"",
		-1, // MaxAge: -1 invalidates cookie immediately
		"/",
		cookieDomain,
		h.cfg.CookieSecure,
		true, // HttpOnly
	)
}

// Register handles POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var input domain.RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Request validation failed", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	user, err := h.usecase.Register(c.Request.Context(), input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Registration failed", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"user": user,
	}, nil)
}

// Login handles POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var input domain.LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Email and password are required", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	tokens, rawRefreshToken, err := h.usecase.Login(c.Request.Context(), input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Invalid email or password", nil)
		return
	}

	h.setRefreshTokenCookie(c, rawRefreshToken)
	RespondSuccess(c, http.StatusOK, tokens, nil)
}

// Refresh handles POST /api/v1/auth/refresh
func (h *AuthHandler) Refresh(c *gin.Context) {
	rawRefreshToken, err := c.Cookie("refresh_token")
	if err != nil || rawRefreshToken == "" {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Missing refresh token cookie", nil)
		return
	}

	tokens, newRawRefreshToken, err := h.usecase.RefreshToken(c.Request.Context(), rawRefreshToken)
	if err != nil {
		// Clear compromised / invalid cookie
		h.clearRefreshTokenCookie(c)
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Failed to refresh token", nil)
		return
	}

	h.setRefreshTokenCookie(c, newRawRefreshToken)
	RespondSuccess(c, http.StatusOK, tokens, nil)
}

// Logout handles POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	rawRefreshToken, _ := c.Cookie("refresh_token")
	_ = h.usecase.Logout(c.Request.Context(), rawRefreshToken)
	h.clearRefreshTokenCookie(c)

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Logged out successfully",
	}, nil)
}

// GetCurrentUser handles GET /api/v1/auth/me and GET /api/v1/users/me
func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	user, err := h.usecase.GetCurrentUser(c.Request.Context(), userID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to fetch user profile", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"user": user,
	}, nil)
}

// ListSessions handles GET /api/v1/auth/sessions
func (h *AuthHandler) ListSessions(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	rawRefreshToken, _ := c.Cookie("refresh_token")
	sessions, err := h.usecase.ListSessions(c.Request.Context(), userID, rawRefreshToken)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list sessions", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"sessions": sessions,
	}, nil)
}

// RevokeSession handles DELETE /api/v1/auth/sessions/:id
func (h *AuthHandler) RevokeSession(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	sessionIDStr := c.Param("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid session ID format", nil)
		return
	}

	if err := h.usecase.RevokeSession(c.Request.Context(), userID, sessionID); err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to revoke session", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Session revoked successfully",
	}, nil)
}

