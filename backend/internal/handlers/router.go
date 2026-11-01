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

	workspaceUsecase := usecases.NewWorkspaceUsecase(p, queries)
	workspaceHandler := NewWorkspaceHandler(workspaceUsecase)

	projectUsecase := usecases.NewProjectUsecase(p, queries)
	projectHandler := NewProjectHandler(projectUsecase)

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

			// Workspaces
			workspaces := protected.Group("/workspaces")
			{
				workspaces.POST("", workspaceHandler.Create)
				workspaces.GET("", workspaceHandler.List)
				workspaces.GET("/:id", workspaceHandler.Get)
				workspaces.PATCH("/:id", workspaceHandler.Update)
				workspaces.DELETE("/:id", workspaceHandler.Delete)

				// Members
				workspaces.GET("/:id/members", workspaceHandler.ListMembers)
				workspaces.POST("/:id/members", workspaceHandler.AddMember)
				workspaces.PATCH("/:id/members/:userId", workspaceHandler.UpdateMemberRole)
				workspaces.DELETE("/:id/members/:userId", workspaceHandler.RemoveMember)

				// Projects in Workspace (P1 & P2)
				workspaces.GET("/:id/projects", projectHandler.List)
				workspaces.POST("/:id/projects", projectHandler.Create)
			}

			// Projects (P3 - P8)
			projects := protected.Group("/projects")
			{
				projects.GET("/:id", projectHandler.Get)
				projects.PATCH("/:id", projectHandler.Update)
				projects.DELETE("/:id", projectHandler.Archive)

				// Project Members
				projects.GET("/:id/members", projectHandler.ListMembers)
				projects.POST("/:id/members", projectHandler.AddMember)
				projects.PATCH("/:id/members/:userId", projectHandler.UpdateMemberRole)
				projects.DELETE("/:id/members/:userId", projectHandler.RemoveMember)
			}
		}
	}

	return r
}
