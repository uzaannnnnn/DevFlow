package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/middleware"
)

func TestRouter_NotFoundEnvelope(t *testing.T) {
	cfg := &config.Config{
		AppEnv:             "test",
		CORSAllowedOrigins: []string{"http://localhost:5173"},
	}
	r := SetupRouter(cfg)

	req := httptest.NewRequest(http.MethodGet, "/non-existent-endpoint", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}

	var resp domain.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Success != false {
		t.Errorf("expected success false")
	}
	if resp.Error.Code != domain.ErrCodeNotFound {
		t.Errorf("expected code NOT_FOUND, got %s", resp.Error.Code)
	}

	reqID := w.Header().Get(middleware.RequestIDHeader)
	if reqID == "" {
		t.Errorf("expected RequestID header on 404 response")
	}
}

func TestRouter_MethodNotAllowed(t *testing.T) {
	cfg := &config.Config{
		AppEnv:             "test",
		CORSAllowedOrigins: []string{"http://localhost:5173"},
	}
	r := SetupRouter(cfg)

	// /health is GET only
	req := httptest.NewRequest(http.MethodPost, "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 Method Not Allowed, got %d", w.Code)
	}

	var resp domain.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Success != false {
		t.Errorf("expected success false")
	}
}
