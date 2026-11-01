package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestHealthCheck_Root(t *testing.T) {
	cfg := &config.Config{AppEnv: "test"}
	r := SetupRouter(cfg)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp domain.SuccessResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Errorf("expected success true, got false")
	}

	dataMap, ok := resp.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected data to be a JSON object, got %T", resp.Data)
	}

	if dataMap["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got %v", dataMap["status"])
	}
	if dataMap["service"] != "devflow-api" {
		t.Errorf("expected service 'devflow-api', got %v", dataMap["service"])
	}
	if dataMap["version"] != "0.1.0" {
		t.Errorf("expected version '0.1.0', got %v", dataMap["version"])
	}
	if dataMap["environment"] != "test" {
		t.Errorf("expected environment 'test', got %v", dataMap["environment"])
	}
}

func TestHealthCheck_V1(t *testing.T) {
	cfg := &config.Config{AppEnv: "production"}
	r := SetupRouter(cfg)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp domain.SuccessResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	dataMap, ok := resp.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %T", resp.Data)
	}

	if dataMap["environment"] != "production" {
		t.Errorf("expected environment 'production', got %v", dataMap["environment"])
	}
}

func TestReadiness_NoPool(t *testing.T) {
	cfg := &config.Config{AppEnv: "test"}
	r := SetupRouter(cfg, nil) // explicitly nil pool

	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", w.Code)
	}

	var resp domain.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if resp.Success != false {
		t.Errorf("expected success false")
	}
}

func TestReadiness_WithLivePool(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := repository.NewPool(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping live readiness test: postgres connection failed: %v", err)
	}
	defer pool.Close()

	cfg := &config.Config{AppEnv: "development"}
	r := SetupRouter(cfg, pool)

	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp domain.SuccessResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	dataMap, ok := resp.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %T", resp.Data)
	}
	if dataMap["status"] != "ready" {
		t.Errorf("expected status 'ready', got %v", dataMap["status"])
	}
	if dataMap["database"] != "connected" {
		t.Errorf("expected database 'connected', got %v", dataMap["database"])
	}
}
