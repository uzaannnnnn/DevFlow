package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting DevFlow backend service on port %s (Sprint 1 initialization)...", port)
	fmt.Printf("DevFlow backend initialized successfully.\n")
}

