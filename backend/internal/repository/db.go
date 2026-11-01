package repository

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ParseDatabaseURL parses and validates the given PostgreSQL connection string
// into a pgxpool.Config without establishing an active network connection.
func ParseDatabaseURL(databaseURL string) (*pgxpool.Config, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("database URL cannot be empty")
	}

	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid database URL: %w", err)
	}

	// Default pool limits optimized for lightweight development & 8GB M1
	poolConfig.MaxConns = 10
	poolConfig.MinConns = 2

	return poolConfig, nil
}
