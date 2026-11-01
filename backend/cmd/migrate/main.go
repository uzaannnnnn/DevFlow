package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"devflow/backend/internal/config"
	"devflow/backend/internal/repository"
)

func main() {
	var migrationsDir string
	flag.StringVar(&migrationsDir, "dir", "migrations", "Path to migrations directory")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		fmt.Println("Usage: migrate [options] <command>")
		fmt.Println("Commands: up, down, version")
		os.Exit(1)
	}

	command := args[0]

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("FATAL: Failed to load config: %v", err)
	}

	targetDBURL := cfg.DatabaseURLUnpooled
	if targetDBURL == "" {
		targetDBURL = cfg.DatabaseURL
	}

	// Resolve migrations directory relative to cwd
	absDir, err := filepath.Abs(migrationsDir)
	if err != nil {
		log.Fatalf("FATAL: Failed to resolve migrations directory: %v", err)
	}

	switch command {
	case "up":
		log.Printf("INFO: Applying migrations UP from %s...", absDir)
		if err := repository.RunMigrationsUp(targetDBURL, absDir); err != nil {
			log.Fatalf("FATAL: Migration UP failed: %v", err)
		}
		ver, dirty, _ := repository.MigrationVersion(targetDBURL, absDir)
		log.Printf("SUCCESS: Migrations applied successfully. Current version: %d (dirty: %v)", ver, dirty)

	case "down":
		log.Printf("INFO: Reverting migrations DOWN from %s...", absDir)
		if err := repository.RunMigrationsDown(targetDBURL, absDir); err != nil {
			log.Fatalf("FATAL: Migration DOWN failed: %v", err)
		}
		log.Printf("SUCCESS: Migrations reverted successfully.")

	case "version":
		ver, dirty, err := repository.MigrationVersion(targetDBURL, absDir)
		if err != nil {
			log.Fatalf("FATAL: Failed to get migration version: %v", err)
		}
		log.Printf("INFO: Current migration version: %d (dirty: %v)", ver, dirty)

	default:
		log.Fatalf("FATAL: Unknown migration command %q. Valid commands: up, down, version", command)
	}
}

