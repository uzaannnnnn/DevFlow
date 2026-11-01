package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
)

func TestRespondSuccess(t *testing.T) {
	r := gin.New()
	r.GET("/test-success", func(c *gin.Context) {
		RespondSuccess(c, http.StatusOK, map[string]string{"foo": "bar"}, map[string]int{"total": 1})
	})

	req := httptest.NewRequest(http.MethodGet, "/test-success", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp domain.SuccessResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if !resp.Success {
		t.Errorf("expected success true")
	}
	dataMap, _ := resp.Data.(map[string]any)
	if dataMap["foo"] != "bar" {
		t.Errorf("expected foo=bar, got %v", dataMap["foo"])
	}
	metaMap, _ := resp.Meta.(map[string]any)
	if metaMap["total"] != float64(1) {
		t.Errorf("expected total=1, got %v", metaMap["total"])
	}
}

func TestRespondError(t *testing.T) {
	r := gin.New()
	r.GET("/test-error", func(c *gin.Context) {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "invalid input", []domain.APIErrorDetail{
			{Field: "email", Message: "required"},
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/test-error", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}

	var resp domain.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if resp.Success != false {
		t.Errorf("expected success false")
	}
	if resp.Error.Code != domain.ErrCodeValidation {
		t.Errorf("expected code %s, got %s", domain.ErrCodeValidation, resp.Error.Code)
	}
	if resp.Error.Message != "invalid input" {
		t.Errorf("expected message 'invalid input', got %s", resp.Error.Message)
	}
}

func TestRespondAppError(t *testing.T) {
	tests := []struct {
		name       string
		err        *domain.AppError
		wantStatus int
		wantCode   string
	}{
		{
			name:       "Validation",
			err:        domain.NewValidationError("bad data", nil),
			wantStatus: http.StatusBadRequest,
			wantCode:   domain.ErrCodeValidation,
		},
		{
			name:       "Unauthorized",
			err:        domain.NewUnauthorizedError("no token"),
			wantStatus: http.StatusUnauthorized,
			wantCode:   domain.ErrCodeUnauthorized,
		},
		{
			name:       "Forbidden",
			err:        domain.NewForbiddenError("no perm"),
			wantStatus: http.StatusForbidden,
			wantCode:   domain.ErrCodeForbidden,
		},
		{
			name:       "NotFound",
			err:        domain.NewNotFoundError("task missing"),
			wantStatus: http.StatusNotFound,
			wantCode:   domain.ErrCodeNotFound,
		},
		{
			name:       "Conflict",
			err:        domain.NewConflictError("email exists"),
			wantStatus: http.StatusConflict,
			wantCode:   domain.ErrCodeConflict,
		},
		{
			name:       "Unprocessable",
			err:        domain.NewUnprocessableError("assignee not member"),
			wantStatus: http.StatusUnprocessableEntity,
			wantCode:   domain.ErrCodeUnprocessable,
		},
		{
			name:       "RateLimit",
			err:        domain.NewRateLimitError("calm down"),
			wantStatus: http.StatusTooManyRequests,
			wantCode:   domain.ErrCodeTooManyRequests,
		},
		{
			name:       "Internal",
			err:        domain.NewInternalError("crash"),
			wantStatus: http.StatusInternalServerError,
			wantCode:   domain.ErrCodeInternal,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.GET("/err-test", func(c *gin.Context) {
				RespondAppError(c, tc.err)
			})

			req := httptest.NewRequest(http.MethodGet, "/err-test", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Errorf("expected status %d, got %d", tc.wantStatus, w.Code)
			}

			var resp domain.ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("unmarshal error: %v", err)
			}
			if resp.Error.Code != tc.wantCode {
				t.Errorf("expected code %s, got %s", tc.wantCode, resp.Error.Code)
			}
		})
	}
}
