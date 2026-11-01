package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestRequestID_GeneratesNew(t *testing.T) {
	r := gin.New()
	r.Use(RequestID())
	r.GET("/test", func(c *gin.Context) {
		reqID := GetRequestID(c)
		c.String(http.StatusOK, reqID)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	respHeader := w.Header().Get(RequestIDHeader)
	if respHeader == "" {
		t.Errorf("expected X-Request-ID response header, got empty")
	}
	if w.Body.String() != respHeader {
		t.Errorf("expected body to match header %q, got %q", respHeader, w.Body.String())
	}
}

func TestRequestID_PreservesExisting(t *testing.T) {
	r := gin.New()
	r.Use(RequestID())
	r.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	customID := "custom-req-id-12345"
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(RequestIDHeader, customID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	respHeader := w.Header().Get(RequestIDHeader)
	if respHeader != customID {
		t.Errorf("expected header %q, got %q", customID, respHeader)
	}
}

func TestRecovery_HandlesPanicGracefully(t *testing.T) {
	r := gin.New()
	r.Use(RequestID())
	r.Use(Recovery())
	r.GET("/panic", func(c *gin.Context) {
		panic("something went completely wrong!")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}

	var resp domain.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse JSON error response: %v", err)
	}

	if resp.Success != false {
		t.Errorf("expected success=false, got true")
	}
	if resp.Error.Code != domain.ErrCodeInternal {
		t.Errorf("expected code %q, got %q", domain.ErrCodeInternal, resp.Error.Code)
	}
}

func TestLogger_OutputsJSON(t *testing.T) {
	var buf bytes.Buffer
	r := gin.New()
	r.Use(RequestID())
	r.Use(Logger(LoggerConfig{Output: &buf}))
	r.GET("/log-test", func(c *gin.Context) {
		c.String(http.StatusOK, "logged")
	})

	req := httptest.NewRequest(http.MethodGet, "/log-test?query=val", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	logOutput := buf.String()
	if logOutput == "" {
		t.Fatal("expected log output, got empty buffer")
	}

	var parsed map[string]any
	if err := json.Unmarshal(buf.Bytes(), &parsed); err != nil {
		t.Fatalf("expected valid JSON log entry, got %v: %s", err, logOutput)
	}

	if parsed["path"] != "/log-test?query=val" {
		t.Errorf("expected logged path with query, got %v", parsed["path"])
	}
	if parsed["method"] != "GET" {
		t.Errorf("expected method GET, got %v", parsed["method"])
	}
	if parsed["status"] != float64(200) {
		t.Errorf("expected status 200, got %v", parsed["status"])
	}
}

func TestCORS_AllowedOrigin(t *testing.T) {
	allowed := []string{"http://localhost:5173", "https://app.devflow.com"}
	r := gin.New()
	r.Use(CORS(allowed))
	r.GET("/cors-test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// Test allowed origin
	req := httptest.NewRequest(http.MethodGet, "/cors-test", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Errorf("expected Access-Control-Allow-Origin header to match origin")
	}
	if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Errorf("expected Access-Control-Allow-Credentials to be true")
	}

	// Test disallowed origin
	req2 := httptest.NewRequest(http.MethodGet, "/cors-test", nil)
	req2.Header.Set("Origin", "http://evil-site.com")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("expected no Access-Control-Allow-Origin header for disallowed origin, got %q", w2.Header().Get("Access-Control-Allow-Origin"))
	}

	// Test preflight OPTIONS
	reqOpt := httptest.NewRequest(http.MethodOptions, "/cors-test", nil)
	reqOpt.Header.Set("Origin", "http://localhost:5173")
	wOpt := httptest.NewRecorder()
	r.ServeHTTP(wOpt, reqOpt)

	if wOpt.Code != http.StatusNoContent {
		t.Errorf("expected 204 No Content for preflight OPTIONS, got %d", wOpt.Code)
	}
}
