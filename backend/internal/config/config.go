package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all configuration variables for the DevFlow backend service.
type Config struct {
	// App environment: "development", "test", or "production"
	AppEnv string

	// HTTP server port (e.g. "8080")
	Port string

	// Graceful shutdown timeout
	ShutdownTimeout time.Duration

	// Database connection string (PostgreSQL 14+)
	DatabaseURL string

	// JWT signing secret (minimum 32 bytes)
	JWTSecret string

	// Token lifetimes
	JWTAccessTTL    time.Duration
	RefreshTokenTTL time.Duration

	// Cookie settings
	CookieDomain string
	CookieSecure bool

	// CORS allowed origins list
	CORSAllowedOrigins []string
}

// Default development constants (never used for production secrets).
const (
	DefaultDevJWTSecret = "devflow_dev_secret_key_minimum_32_bytes_length!!"
	DefaultPort         = "8080"
	DefaultAppEnv       = "development"
	DefaultDBURL        = "postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable"
	DefaultDevFrontend  = "http://localhost:5173"
)

// Load reads configuration from environment variables, optionally loading from a .env file if present.
// If filenames are passed, it will attempt to load from those files.
func Load(envFiles ...string) (*Config, error) {
	// Load .env file if available (ignore error if file does not exist)
	if len(envFiles) > 0 {
		_ = godotenv.Load(envFiles...)
	} else {
		_ = godotenv.Load()
	}

	appEnv := getEnv("APP_ENV", DefaultAppEnv)

	port := getEnv("PORT", DefaultPort)

	dbURL := getEnv("DATABASE_URL", DefaultDBURL)

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" && appEnv != "production" {
		jwtSecret = DefaultDevJWTSecret
	}

	jwtAccessTTLStr := getEnv("JWT_ACCESS_TTL", "15m")
	jwtAccessTTL, err := time.ParseDuration(jwtAccessTTLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_TTL %q: %w", jwtAccessTTLStr, err)
	}

	refreshTokenTTLStr := getEnv("REFRESH_TOKEN_TTL", "168h") // 7 days = 168h
	refreshTokenTTL, err := time.ParseDuration(refreshTokenTTLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid REFRESH_TOKEN_TTL %q: %w", refreshTokenTTLStr, err)
	}

	cookieDomain := getEnv("COOKIE_DOMAIN", "localhost")

	cookieSecure := false
	if rawSecure := os.Getenv("COOKIE_SECURE"); rawSecure != "" {
		cookieSecure = parseBool(rawSecure, false)
	} else if appEnv == "production" {
		cookieSecure = true
	}

	corsOriginsStr := getEnv("CORS_ALLOWED_ORIGINS", DefaultDevFrontend)
	var corsOrigins []string
	for _, origin := range strings.Split(corsOriginsStr, ",") {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			corsOrigins = append(corsOrigins, trimmed)
		}
	}

	cfg := &Config{
		AppEnv:             appEnv,
		Port:               port,
		ShutdownTimeout:    5 * time.Second,
		DatabaseURL:        dbURL,
		JWTSecret:          jwtSecret,
		JWTAccessTTL:       jwtAccessTTL,
		RefreshTokenTTL:    refreshTokenTTL,
		CookieDomain:       cookieDomain,
		CookieSecure:       cookieSecure,
		CORSAllowedOrigins: corsOrigins,
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Validate checks that required configuration values meet security and operational requirements.
func (c *Config) Validate() error {
	// Validate Port
	portNum, err := strconv.Atoi(c.Port)
	if err != nil || portNum < 1 || portNum > 65535 {
		return fmt.Errorf("invalid PORT %q: must be a valid port number between 1 and 65535", c.Port)
	}

	// Validate DatabaseURL format is present
	if strings.TrimSpace(c.DatabaseURL) == "" {
		return errors.New("DATABASE_URL must not be empty")
	}

	// Validate JWTSecret length
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters long (got %d)", len(c.JWTSecret))
	}

	// Production-specific strict checks
	if c.AppEnv == "production" {
		if c.JWTSecret == DefaultDevJWTSecret {
			return errors.New("cannot use default development JWT_SECRET in production")
		}
		if len(c.CORSAllowedOrigins) == 0 {
			return errors.New("CORS_ALLOWED_ORIGINS must contain at least one valid origin in production")
		}
		for _, origin := range c.CORSAllowedOrigins {
			if origin == "*" {
				return errors.New("wildcard CORS origin '*' is not allowed in production with credential support")
			}
		}
	}

	return nil
}

// IsProduction returns true if running in production mode.
func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func getEnv(key, defaultVal string) string {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	return val
}

func parseBool(val string, defaultVal bool) bool {
	b, err := strconv.ParseBool(strings.TrimSpace(val))
	if err != nil {
		return defaultVal
	}
	return b
}
