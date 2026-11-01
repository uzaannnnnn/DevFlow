package repository

import (
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// RunMigrationsUp applies all pending database migrations from migrationsPath.
func RunMigrationsUp(databaseURL, migrationsPath string) error {
	m, err := newMigrator(databaseURL, migrationsPath)
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("failed to apply migrations up: %w", err)
	}

	return nil
}

// RunMigrationsDown reverts all applied migrations from migrationsPath.
func RunMigrationsDown(databaseURL, migrationsPath string) error {
	m, err := newMigrator(databaseURL, migrationsPath)
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("failed to revert migrations down: %w", err)
	}

	return nil
}

// MigrationVersion returns the current migration version and dirty status.
func MigrationVersion(databaseURL, migrationsPath string) (uint, bool, error) {
	m, err := newMigrator(databaseURL, migrationsPath)
	if err != nil {
		return 0, false, err
	}
	defer m.Close()

	version, dirty, err := m.Version()
	if err != nil {
		return 0, false, err
	}
	return version, dirty, nil
}

func newMigrator(databaseURL, migrationsPath string) (*migrate.Migrate, error) {
	sourceURL := migrationsPath
	if !strings.HasPrefix(sourceURL, "file://") {
		sourceURL = "file://" + sourceURL
	}

	m, err := migrate.New(sourceURL, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize migrator: %w", err)
	}
	return m, nil
}

