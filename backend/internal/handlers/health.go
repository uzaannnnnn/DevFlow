package handlers

import (
	"net/http"

	"devflow/backend/internal/config"

	"github.com/gin-gonic/gin"
)

// HealthHandler manages health check endpoints.
type HealthHandler struct {
	cfg *config.Config
}

// NewHealthHandler creates a new HealthHandler instance.
func NewHealthHandler(cfg *config.Config) *HealthHandler {
	return &HealthHandler{cfg: cfg}
}

// HealthStatus represents the payload returned by GET /health.
type HealthStatus struct {
	Status      string `json:"status"`
	Service     string `json:"service"`
	Version     string `json:"version"`
	Environment string `json:"environment"`
}

// Check handles GET /health.
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
