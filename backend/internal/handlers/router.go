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

	taskUsecase := usecases.NewTaskUsecase(p, queries)
	taskHandler := NewTaskHandler(taskUsecase)

	commentUsecase := usecases.NewCommentUsecase(p, queries)
	commentHandler := NewCommentHandler(commentUsecase)

	activityUsecase := usecases.NewActivityUsecase(p, queries)
	activityHandler := NewActivityHandler(activityUsecase)

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

				// Tasks in Project (T1 & T2)
				projects.GET("/:id/tasks", taskHandler.List)
				projects.POST("/:id/tasks", taskHandler.Create)

				// Activities in Project (AC1)
				projects.GET("/:id/activities", activityHandler.ListProject)
			}

			// Tasks (T3, T4, T5, C1, C2, AC2)
			tasks := protected.Group("/tasks")
			{
				tasks.GET("/:id", taskHandler.Get)
				tasks.PATCH("/:id", taskHandler.Update)
				tasks.DELETE("/:id", taskHandler.Delete)

				// Task Comments (C1 & C2)
				tasks.GET("/:id/comments", commentHandler.List)
				tasks.POST("/:id/comments", commentHandler.Create)

				// Task Activity History (AC2)
				tasks.GET("/:id/activity", activityHandler.ListTask)
			}

			// Comments (C3 & C4)
			comments := protected.Group("/comments")
			{
				comments.PATCH("/:id", commentHandler.Update)
				comments.DELETE("/:id", commentHandler.Delete)
			}
		}
	}

	return r
}
