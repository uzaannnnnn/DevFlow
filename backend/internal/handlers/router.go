package handlers

import (
	"devflow/backend/internal/config"
	"devflow/backend/internal/middleware"
	"devflow/backend/internal/repository"
	"devflow/backend/internal/usecases"

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
	jwtSecret := config.DefaultDevJWTSecret
	if cfg != nil {
		corsOrigins = cfg.CORSAllowedOrigins
		if cfg.JWTSecret != "" {
			jwtSecret = cfg.JWTSecret
		}
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

	// Repositories & usecases
	var queries *repository.Queries
	if p != nil {
		queries = repository.New(p)
	} else {
		queries = repository.New(nil)
	}

	authUsecase := usecases.NewAuthUsecase(cfg, p, queries)
	authHandler := NewAuthHandler(cfg, authUsecase)

	// API v1 route group
	v1 := r.Group("/api/v1")
	{
		// Health
		v1.GET("/health", healthHandler.Check)
		v1.GET("/health/ready", healthHandler.Ready)

		// Public Auth
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/refresh", authHandler.Refresh)
			authGroup.POST("/logout", authHandler.Logout)
		}

		// Authenticated Routes
		protected := v1.Group("")
		protected.Use(middleware.RequireAuth(jwtSecret))
		{
			protected.GET("/auth/me", authHandler.GetCurrentUser)
			protected.GET("/users/me", authHandler.GetCurrentUser)
			protected.GET("/auth/sessions", authHandler.ListSessions)
			protected.DELETE("/auth/sessions/:id", authHandler.RevokeSession)
		}
	}

	return r
}
