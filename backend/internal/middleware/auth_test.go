package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"devflow/backend/internal/auth"
	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const middlewareTestSecret = "devflow_middleware_test_secret_32_bytes_long!!"

func setupAuthTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequireAuth(middlewareTestSecret))
	r.GET("/protected", func(c *gin.Context) {
		userID, err := GetAuthenticatedUserID(c)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		email := GetAuthenticatedUserEmail(c)
		c.JSON(http.StatusOK, gin.H{
			"user_id": userID.String(),
			"email":   email,
		})
	})
	return r
}

func TestRequireAuth_MissingHeader(t *testing.T) {
	r := setupAuthTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}

	var res domain.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse JSON response: %v", err)
	}
	if res.Error.Code != domain.ErrCodeUnauthorized {
		t.Fatalf("expected UNAUTHORIZED code, got %s", res.Error.Code)
	}
}

func TestRequireAuth_MalformedHeader(t *testing.T) {
	r := setupAuthTestRouter()

	badHeaders := []string{
		"Basic dXNlcjpwYXNz",
		"Bearer",
		"Token abc.def.ghi",
		"Bearer   ",
	}

	for _, h := range badHeaders {
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", h)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for header %q, got %d", h, w.Code)
		}
	}
}

func TestRequireAuth_ValidToken(t *testing.T) {
	r := setupAuthTestRouter()
	userID := uuid.New()
	email := "user@devflow.local"

	token, err := auth.GenerateAccessToken(userID, email, middlewareTestSecret, 15*time.Minute)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var data map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if data["user_id"] != userID.String() {
		t.Fatalf("expected user_id %s, got %s", userID.String(), data["user_id"])
	}
	if data["email"] != email {
		t.Fatalf("expected email %s, got %s", email, data["email"])
	}
}

func TestRequireAuth_ExpiredToken(t *testing.T) {
	r := setupAuthTestRouter()
	userID := uuid.New()
	email := "expired@devflow.local"

	token, err := auth.GenerateAccessToken(userID, email, middlewareTestSecret, -1*time.Minute)
	if err != nil {
		t.Fatalf("failed to generate expired token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %d", w.Code)
	}
}

func TestRequireAuth_WrongSecret(t *testing.T) {
	r := setupAuthTestRouter()
	userID := uuid.New()
	email := "attacker@devflow.local"

	differentSecret := "completely_different_secret_key_32_bytes_long!"
	token, err := auth.GenerateAccessToken(userID, email, differentSecret, 15*time.Minute)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid signature, got %d", w.Code)
	}
}

