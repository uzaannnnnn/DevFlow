package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"devflow/backend/internal/config"
	"devflow/backend/internal/handlers"
	"devflow/backend/internal/repository"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// 1. Load and validate configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("FATAL: Failed to load configuration: %v", err)
	}

	// 2. Initialize database connection pool (with graceful offline fallback)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var pool *pgxpool.Pool
	pool, err = repository.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("WARN: Database pool not initialized at startup (%v). Readiness check will report unready.", err)
	} else {
		log.Printf("INFO: Connected to PostgreSQL database pool successfully.")
		defer pool.Close()
	}

	// 3. Initialize router with middlewares, health, and readiness routes
	router := handlers.SetupRouter(cfg, pool)

	// 4. Configure HTTP server with timeouts
	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// 5. Start HTTP server in a separate goroutine
	go func() {
		log.Printf("INFO: DevFlow backend server starting on port %s [env=%s]", cfg.Port, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("FATAL: HTTP server ListenAndServe failed: %v", err)
		}
	}()

	// 6. Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("INFO: Received shutdown signal %v, initiating graceful shutdown...", sig)

	// 7. Graceful shutdown with timeout context
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("FATAL: Server forced to shutdown: %v", err)
	}

	log.Println("INFO: DevFlow backend server stopped cleanly.")
}
