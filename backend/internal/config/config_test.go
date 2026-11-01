package config

import (
	"os"
	"testing"
	"time"
)

func clearEnv(keys ...string) {
	for _, k := range keys {
		_ = os.Unsetenv(k)
	}
}

func TestLoad_Defaults(t *testing.T) {
	clearEnv("APP_ENV", "PORT", "DATABASE_URL", "JWT_SECRET", "JWT_ACCESS_TTL", "REFRESH_TOKEN_TTL", "COOKIE_DOMAIN", "COOKIE_SECURE", "CORS_ALLOWED_ORIGINS")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected successful Load with defaults, got error: %v", err)
	}

	if cfg.AppEnv != "development" {
		t.Errorf("expected AppEnv 'development', got %q", cfg.AppEnv)
	}
	if cfg.Port != "8080" {
		t.Errorf("expected Port '8080', got %q", cfg.Port)
	}
	if cfg.DatabaseURL != DefaultDBURL {
		t.Errorf("expected default DB URL, got %q", cfg.DatabaseURL)
	}
	if cfg.JWTSecret != DefaultDevJWTSecret {
		t.Errorf("expected default dev JWT secret, got %q", cfg.JWTSecret)
	}
	if cfg.JWTAccessTTL != 15*time.Minute {
		t.Errorf("expected JWTAccessTTL 15m, got %v", cfg.JWTAccessTTL)
	}
	if cfg.RefreshTokenTTL != 168*time.Hour {
		t.Errorf("expected RefreshTokenTTL 168h, got %v", cfg.RefreshTokenTTL)
	}
	if cfg.CookieDomain != "localhost" {
		t.Errorf("expected CookieDomain 'localhost', got %q", cfg.CookieDomain)
	}
	if cfg.CookieSecure != false {
		t.Errorf("expected CookieSecure false in dev, got %v", cfg.CookieSecure)
	}
	if len(cfg.CORSAllowedOrigins) != 1 || cfg.CORSAllowedOrigins[0] != DefaultDevFrontend {
		t.Errorf("expected default CORS origin %v, got %v", DefaultDevFrontend, cfg.CORSAllowedOrigins)
	}
	if cfg.IsProduction() {
		t.Errorf("expected IsProduction() to be false")
	}
}

func TestLoad_CustomEnv(t *testing.T) {
	clearEnv("APP_ENV", "PORT", "DATABASE_URL", "JWT_SECRET", "JWT_ACCESS_TTL", "REFRESH_TOKEN_TTL", "COOKIE_DOMAIN", "COOKIE_SECURE", "CORS_ALLOWED_ORIGINS")

	t.Setenv("APP_ENV", "development")
	t.Setenv("PORT", "9090")
	t.Setenv("DATABASE_URL", "postgres://custom:custom@localhost:5432/custom_db")
	t.Setenv("JWT_SECRET", "custom_secret_that_is_at_least_32_characters_long_for_test")
	t.Setenv("JWT_ACCESS_TTL", "30m")
	t.Setenv("REFRESH_TOKEN_TTL", "72h")
	t.Setenv("COOKIE_DOMAIN", "devflow.local")
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000, http://localhost:5173")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "9090" {
		t.Errorf("expected Port '9090', got %q", cfg.Port)
	}
	if cfg.DatabaseURL != "postgres://custom:custom@localhost:5432/custom_db" {
		t.Errorf("unexpected DatabaseURL: %q", cfg.DatabaseURL)
	}
	if cfg.JWTAccessTTL != 30*time.Minute {
		t.Errorf("expected JWTAccessTTL 30m, got %v", cfg.JWTAccessTTL)
	}
	if cfg.RefreshTokenTTL != 72*time.Hour {
		t.Errorf("expected RefreshTokenTTL 72h, got %v", cfg.RefreshTokenTTL)
	}
	if cfg.CookieSecure != true {
		t.Errorf("expected CookieSecure true, got %v", cfg.CookieSecure)
	}
	if len(cfg.CORSAllowedOrigins) != 2 || cfg.CORSAllowedOrigins[0] != "http://localhost:3000" || cfg.CORSAllowedOrigins[1] != "http://localhost:5173" {
		t.Errorf("unexpected CORS origins: %v", cfg.CORSAllowedOrigins)
	}
}

func TestLoad_InvalidPort(t *testing.T) {
	clearEnv("PORT")
	t.Setenv("PORT", "not-a-number")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error on non-numeric PORT, got nil")
	}

	t.Setenv("PORT", "99999")
	_, err = Load()
	if err == nil {
		t.Fatal("expected error on out-of-range PORT, got nil")
	}
}

func TestLoad_InvalidDuration(t *testing.T) {
	clearEnv("JWT_ACCESS_TTL", "REFRESH_TOKEN_TTL")

	t.Setenv("JWT_ACCESS_TTL", "invalid-duration")
	_, err := Load()
	if err == nil {
		t.Fatal("expected error on invalid JWT_ACCESS_TTL, got nil")
	}

	t.Setenv("JWT_ACCESS_TTL", "15m")
	t.Setenv("REFRESH_TOKEN_TTL", "bad-ttl")
	_, err = Load()
	if err == nil {
		t.Fatal("expected error on invalid REFRESH_TOKEN_TTL, got nil")
	}
}

func TestLoad_EmptyDatabaseURL(t *testing.T) {
	clearEnv("DATABASE_URL")
	t.Setenv("DATABASE_URL", "   ")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error on whitespace DATABASE_URL, got nil")
	}
}

func TestLoad_ProductionStrictValidation(t *testing.T) {
	clearEnv("APP_ENV", "PORT", "DATABASE_URL", "JWT_SECRET", "CORS_ALLOWED_ORIGINS")

	t.Setenv("APP_ENV", "production")
	t.Setenv("PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://user:pass@prod-db:5432/devflow_prod")

	// 1. Missing or default secret should fail in production
	t.Setenv("JWT_SECRET", DefaultDevJWTSecret)
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.devflow.com")
	_, err := Load()
	if err == nil {
		t.Fatal("expected error using default JWT secret in production, got nil")
	}

	// 2. Secret too short should fail
	t.Setenv("JWT_SECRET", "short_secret")
	_, err = Load()
	if err == nil {
		t.Fatal("expected error on short JWT secret in production, got nil")
	}

	// 3. Wildcard CORS origin should fail in production
	t.Setenv("JWT_SECRET", "super_secure_production_secret_key_32_chars_minimum!")
	t.Setenv("CORS_ALLOWED_ORIGINS", "*")
	_, err = Load()
	if err == nil {
		t.Fatal("expected error on wildcard CORS origin in production, got nil")
	}

	// 4. Valid production config should pass
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.devflow.com")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected valid production config to pass, got: %v", err)
	}
	if !cfg.IsProduction() {
		t.Errorf("expected IsProduction() true")
	}
	if !cfg.CookieSecure {
		t.Errorf("expected CookieSecure default to true in production")
	}
}
