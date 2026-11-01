package repository

import (
	"testing"
)

func TestParseDatabaseURL_Valid(t *testing.T) {
	validURL := "postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable"
	cfg, err := ParseDatabaseURL(validURL)
	if err != nil {
		t.Fatalf("expected valid config, got error: %v", err)
	}

	if cfg.ConnConfig.Database != "devflow" {
		t.Errorf("expected database 'devflow', got %q", cfg.ConnConfig.Database)
	}
	if cfg.ConnConfig.User != "devflow" {
		t.Errorf("expected user 'devflow', got %q", cfg.ConnConfig.User)
	}
	if cfg.ConnConfig.Host != "localhost" {
		t.Errorf("expected host 'localhost', got %q", cfg.ConnConfig.Host)
	}
	if cfg.ConnConfig.Port != 5432 {
		t.Errorf("expected port 5432, got %d", cfg.ConnConfig.Port)
	}
	if cfg.MaxConns != 10 {
		t.Errorf("expected MaxConns 10, got %d", cfg.MaxConns)
	}
}

func TestParseDatabaseURL_Invalid(t *testing.T) {
	tests := []struct {
		name string
		url  string
	}{
		{"Empty", ""},
		{"NotAUrl", "::::not-a-valid-url"},
		{"InvalidPort", "postgres://user:pass@localhost:notaport/db"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseDatabaseURL(tc.url)
			if err == nil {
				t.Errorf("expected error for url %q, got nil", tc.url)
			}
		})
	}
}
