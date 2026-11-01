package handlers

import (
	"devflow/backend/internal/config"
	"devflow/backend/internal/middleware"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SetupRouter initializes Gin, attaches global middleware, and registers routes.
// The pool parameter is optional to allow offline test execution.
func SetupRouter(cfg *config.Config, pool ...*pgxpool.Pool) *gin.Engine {
	if cfg != nil && cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.HandleMethodNotAllowed = true

	// Global middlewares
	r.Use(middleware.RequestID())
	r.Use(middleware.Logger())
	r.Use(middleware.Recovery())

	var corsOrigins []string
	if cfg != nil {
		corsOrigins = cfg.CORSAllowedOrigins
	}
	r.Use(middleware.CORS(corsOrigins))

	// Handle unmatched routes with standard JSON error envelopes
	r.NoRoute(NotFoundHandler)
	r.NoMethod(MethodNotAllowedHandler)

	var p *pgxpool.Pool
	if len(pool) > 0 {
		p = pool[0]
	}

	// Health and readiness handlers
	healthHandler := NewHealthHandler(cfg, p)
	r.GET("/health", healthHandler.Check)
	r.GET("/health/ready", healthHandler.Ready)

	// API v1 route group
	v1 := r.Group("/api/v1")
	{
		v1.GET("/health", healthHandler.Check)
		v1.GET("/health/ready", healthHandler.Ready)
	}

	return r
}
