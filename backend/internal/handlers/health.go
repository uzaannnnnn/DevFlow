package handlers

import (
	"context"
	"net/http"
	"time"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// HealthHandler manages health check and readiness endpoints.
type HealthHandler struct {
	cfg  *config.Config
	pool *pgxpool.Pool
}

// NewHealthHandler creates a new HealthHandler instance with optional database pool.
func NewHealthHandler(cfg *config.Config, pool *pgxpool.Pool) *HealthHandler {
	return &HealthHandler{
		cfg:  cfg,
		pool: pool,
	}
}

// HealthStatus represents the payload returned by GET /health.
type HealthStatus struct {
	Status      string `json:"status"`
	Service     string `json:"service"`
	Version     string `json:"version"`
	Environment string `json:"environment"`
}

// ReadinessStatus represents the payload returned by GET /health/ready.
type ReadinessStatus struct {
	Status      string `json:"status"`
	Database    string `json:"database"`
	Service     string `json:"service"`
	Version     string `json:"version"`
	Environment string `json:"environment"`
}

// Check handles GET /health (Liveness).
// It verifies HTTP operational readiness without falsely claiming database health.
func (h *HealthHandler) Check(c *gin.Context) {
	env := "development"
	if h.cfg != nil {
		env = h.cfg.AppEnv
	}

	RespondSuccess(c, http.StatusOK, HealthStatus{
		Status:      "healthy",
		Service:     "devflow-api",
		Version:     "0.1.0",
		Environment: env,
	}, nil)
}

// Ready handles GET /health/ready (Readiness).
// It pings the database connection pool to verify end-to-end readiness.
func (h *HealthHandler) Ready(c *gin.Context) {
	env := "development"
	if h.cfg != nil {
		env = h.cfg.AppEnv
	}

	if h.pool == nil {
		RespondError(c, http.StatusServiceUnavailable, domain.ErrCodeInternal, "Database pool not initialized", nil)
		return
	}

	pingCtx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if err := h.pool.Ping(pingCtx); err != nil {
		RespondError(c, http.StatusServiceUnavailable, domain.ErrCodeInternal, "Database readiness check failed", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, ReadinessStatus{
		Status:      "ready",
		Database:    "connected",
		Service:     "devflow-api",
		Version:     "0.1.0",
		Environment: env,
	}, nil)
}
