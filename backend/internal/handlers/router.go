package handlers

import (
	"devflow/backend/internal/config"
	"devflow/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

// SetupRouter initializes Gin, attaches global middleware, and registers routes.
func SetupRouter(cfg *config.Config) *gin.Engine {
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

	// Health check handlers
	healthHandler := NewHealthHandler(cfg)
	r.GET("/health", healthHandler.Check)

	// API v1 route group
	v1 := r.Group("/api/v1")
	{
		v1.GET("/health", healthHandler.Check)
	}

	return r
}
