package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/jackc/pgx/v5/pgxpool"
)

func getTestDatabasePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := "postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	pool, err := repository.NewPool(ctx, dbURL)
	if err != nil {
		t.Skipf("Skipping integration test: PostgreSQL is not accessible: %v", err)
	}
	return pool
}

func extractCookie(resp *http.Response, name string) *http.Cookie {
	for _, c := range resp.Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestAuth_FullLifecycleIntegration(t *testing.T) {
	pool := getTestDatabasePool(t)
	defer pool.Close()

	cfg := &config.Config{
		AppEnv:             "test",
		Port:               "8080",
		JWTSecret:          "devflow_auth_test_secret_key_at_least_32_bytes!",
		JWTAccessTTL:       15 * time.Minute,
		RefreshTokenTTL:    7 * 24 * time.Hour,
		CookieDomain:       "localhost",
		CookieSecure:       false,
		CORSAllowedOrigins: []string{"http://localhost:5173"},
	}

	router := SetupRouter(cfg, pool)

	// Unique test email
	testEmail := fmt.Sprintf("test_user_%d@devflow.local", time.Now().UnixNano())
	testPassword := "SuperSecurePassword123!"
	testName := "Ada Lovelace"

	// ==========================================
	// 1. REGISTRATION
	// ==========================================
	t.Run("Register_Success", func(t *testing.T) {
		body, _ := json.Marshal(domain.RegisterInput{
			Email:    testEmail,
			Password: testPassword,
			Name:     testName,
		})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}

		var res struct {
			Success bool `json:"success"`
			Data    struct {
				User domain.UserResponse `json:"user"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}

		if !res.Success {
			t.Fatalf("expected success: true")
		}
		if res.Data.User.Email != strings.ToLower(testEmail) {
			t.Fatalf("expected email %s, got %s", strings.ToLower(testEmail), res.Data.User.Email)
		}
		if res.Data.User.Name == nil || *res.Data.User.Name != testName {
			t.Fatalf("expected name %s, got %v", testName, res.Data.User.Name)
		}

		// Security assertion: PasswordHash must never be exposed
		rawJSON := w.Body.String()
		if strings.Contains(rawJSON, "password_hash") || strings.Contains(rawJSON, "$argon2id$") {
			t.Fatalf("CRITICAL SECURITY VIOLATION: password_hash leaked in registration response!")
		}
	})

	// ==========================================
	// 2. REJECT DUPLICATE EMAIL
	// ==========================================
	t.Run("Register_DuplicateEmailConflict", func(t *testing.T) {
		// Attempt registering with uppercase variant of existing email
		body, _ := json.Marshal(domain.RegisterInput{
			Email:    strings.ToUpper(testEmail),
			Password: "AnotherPassword123!",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409 Conflict, got %d. Body: %s", w.Code, w.Body.String())
		}

		var res domain.ErrorResponse
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res.Error.Code != domain.ErrCodeConflict {
			t.Fatalf("expected CONFLICT code, got %s", res.Error.Code)
		}
	})

	// ==========================================
	// 3. REGISTRATION VALIDATION ERROR
	// ==========================================
	t.Run("Register_InvalidPassword", func(t *testing.T) {
		body, _ := json.Marshal(domain.RegisterInput{
			Email:    "new@devflow.local",
			Password: "short", // < 8 characters
		})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})

	// ==========================================
	// 4. LOGIN - FAILURE CASES
	// ==========================================
	t.Run("Login_WrongPassword", func(t *testing.T) {
		body, _ := json.Marshal(domain.LoginInput{
			Email:    testEmail,
			Password: "WrongPassword!",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
		}
	})

	t.Run("Login_NonExistentEmail", func(t *testing.T) {
		body, _ := json.Marshal(domain.LoginInput{
			Email:    "nobody_exists@devflow.local",
			Password: testPassword,
		})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
		}
	})

	// ==========================================
	// 5. LOGIN - SUCCESS
	// ==========================================
	var accessToken string
	var refreshCookie *http.Cookie

	t.Run("Login_Success", func(t *testing.T) {
		body, _ := json.Marshal(domain.LoginInput{
			Email:    testEmail,
			Password: testPassword,
		})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}

		resp := w.Result()
		refreshCookie = extractCookie(resp, "refresh_token")
		if refreshCookie == nil || refreshCookie.Value == "" {
			t.Fatalf("expected HttpOnly refresh_token cookie to be set")
		}
		if !refreshCookie.HttpOnly {
			t.Fatalf("expected refresh_token cookie to have HttpOnly = true")
		}

		var res struct {
			Success bool              `json:"success"`
			Data    domain.AuthTokens `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		accessToken = res.Data.AccessToken
		if accessToken == "" {
			t.Fatalf("expected access token to be returned")
		}

		// Security assertion: Refresh token must never be returned in JSON body
		if strings.Contains(w.Body.String(), refreshCookie.Value) {
			t.Fatalf("CRITICAL SECURITY VIOLATION: refresh token exposed in JSON response body!")
		}
	})

	// ==========================================
	// 6. CURRENT USER (/auth/me and /users/me)
	// ==========================================
	t.Run("GetCurrentUser_Authenticated", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}

		var res struct {
			Success bool `json:"success"`
			Data    struct {
				User domain.UserResponse `json:"user"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res.Data.User.Email != strings.ToLower(testEmail) {
			t.Fatalf("expected email %s, got %s", testEmail, res.Data.User.Email)
		}
	})

	t.Run("GetCurrentUser_AliasUsersMe", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for /users/me alias, got %d", w.Code)
		}
	})

	// ==========================================
	// 7. TOKEN REFRESH & ROTATION
	// ==========================================
	var rotatedAccessToken string
	var rotatedRefreshCookie *http.Cookie

	t.Run("Refresh_SuccessAndRotation", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.AddCookie(refreshCookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d. Body: %s", w.Code, w.Body.String())
		}

		resp := w.Result()
		rotatedRefreshCookie = extractCookie(resp, "refresh_token")
		if rotatedRefreshCookie == nil || rotatedRefreshCookie.Value == "" {
			t.Fatalf("expected new rotated refresh token cookie")
		}

		if rotatedRefreshCookie.Value == refreshCookie.Value {
			t.Fatalf("expected rotated refresh token to be different from original token")
		}

		var res struct {
			Success bool              `json:"success"`
			Data    domain.AuthTokens `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		rotatedAccessToken = res.Data.AccessToken
		if rotatedAccessToken == "" {
			t.Fatalf("expected new access token to be returned")
		}
	})

	// ==========================================
	// 8. REUSE DETECTION (Compromise Response)
	// ==========================================
	t.Run("Refresh_ReuseDetectionRevokesFamily", func(t *testing.T) {
		// Attempt refreshing with the OLD (already rotated) refresh token!
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.AddCookie(refreshCookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized on reuse detection, got %d", w.Code)
		}

		// Verify that all active sessions for this user were revoked!
		// Attempting to refresh with the rotated token should now ALSO fail because family was revoked
		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req2.AddCookie(rotatedRefreshCookie)
		w2 := httptest.NewRecorder()
		router.ServeHTTP(w2, req2)

		if w2.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized for previously valid session after reuse detection triggered, got %d", w2.Code)
		}
	})

	// ==========================================
	// 9. LOGOUT & COOKIE CLEARING
	// ==========================================
	t.Run("Logout_RevokesAndClearsCookie", func(t *testing.T) {
		// Log in again to get fresh session
		body, _ := json.Marshal(domain.LoginInput{
			Email:    testEmail,
			Password: testPassword,
		})
		reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		reqLogin.Header.Set("Content-Type", "application/json")
		wLogin := httptest.NewRecorder()
		router.ServeHTTP(wLogin, reqLogin)

		freshCookie := extractCookie(wLogin.Result(), "refresh_token")
		if freshCookie == nil {
			t.Fatalf("failed to obtain fresh cookie for logout test")
		}

		// Perform logout
		reqLogout := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
		reqLogout.AddCookie(freshCookie)
		wLogout := httptest.NewRecorder()
		router.ServeHTTP(wLogout, reqLogout)

		if wLogout.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on logout, got %d", wLogout.Code)
		}

		clearedCookie := extractCookie(wLogout.Result(), "refresh_token")
		if clearedCookie == nil || clearedCookie.MaxAge >= 0 {
			t.Fatalf("expected refresh_token cookie to be expired/cleared (MaxAge < 0)")
		}

		// Verify that refreshing with the logged-out token fails
		reqRefresh := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		reqRefresh.AddCookie(freshCookie)
		wRefresh := httptest.NewRecorder()
		router.ServeHTTP(wRefresh, reqRefresh)

		if wRefresh.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized refreshing after logout, got %d", wRefresh.Code)
		}
	})
}

func TestAuth_ConcurrentRefreshRaceCondition(t *testing.T) {
	pool := getTestDatabasePool(t)
	defer pool.Close()

	cfg := &config.Config{
		AppEnv:             "test",
		Port:               "8080",
		JWTSecret:          "devflow_auth_test_secret_key_at_least_32_bytes!",
		JWTAccessTTL:       15 * time.Minute,
		RefreshTokenTTL:    7 * 24 * time.Hour,
		CookieDomain:       "localhost",
		CookieSecure:       false,
		CORSAllowedOrigins: []string{"http://localhost:5173"},
	}

	router := SetupRouter(cfg, pool)

	// Register and login a user
	testEmail := fmt.Sprintf("concurrent_%d@devflow.local", time.Now().UnixNano())
	testPassword := "SuperSecurePassword123!"

	regBody, _ := json.Marshal(domain.RegisterInput{
		Email:    testEmail,
		Password: testPassword,
	})
	reqReg := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(regBody))
	reqReg.Header.Set("Content-Type", "application/json")
	wReg := httptest.NewRecorder()
	router.ServeHTTP(wReg, reqReg)

	loginBody, _ := json.Marshal(domain.LoginInput{
		Email:    testEmail,
		Password: testPassword,
	})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	reqLogin.Header.Set("Content-Type", "application/json")
	wLogin := httptest.NewRecorder()
	router.ServeHTTP(wLogin, reqLogin)

	cookie := extractCookie(wLogin.Result(), "refresh_token")
	if cookie == nil {
		t.Fatalf("failed to get refresh token cookie")
	}

	// Launch 5 concurrent refresh requests with the EXACT SAME token
	concurrency := 5
	var wg sync.WaitGroup
	statusCodes := make([]int, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
			req.AddCookie(cookie)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			statusCodes[idx] = w.Code
		}(i)
	}

	wg.Wait()

	// Analysis: Exactly ONE request should succeed (200 OK).
	// All other concurrent requests MUST fail (401 Unauthorized), preventing double-spending / race conditions.
	successCount := 0
	unauthorizedCount := 0

	for _, code := range statusCodes {
		if code == http.StatusOK {
			successCount++
		} else if code == http.StatusUnauthorized {
			unauthorizedCount++
		}
	}

	if successCount != 1 {
		t.Fatalf("CONCURRENCY INVARIANT BROKEN: expected exactly 1 successful refresh, got %d (status codes: %v)", successCount, statusCodes)
	}
	if unauthorizedCount != concurrency-1 {
		t.Fatalf("expected %d requests to be rejected with 401, got %d", concurrency-1, unauthorizedCount)
	}
}
