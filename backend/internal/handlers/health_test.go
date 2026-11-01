package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"

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
