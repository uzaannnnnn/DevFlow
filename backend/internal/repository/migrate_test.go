package repository

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

func getBaseTestDBURL() string {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return "postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable"
	}
	return url
}

func TestDatabase_MigrationsAndConstraints(t *testing.T) {
	ctx := context.Background()
	baseURL := getBaseTestDBURL()

	// Connect to default DB to manage disposable test DB
	adminDB, err := sql.Open("postgres", baseURL)
	if err != nil {
		t.Skipf("skipping live database test: cannot connect to PostgreSQL: %v", err)
	}
	defer adminDB.Close()

	if err := adminDB.Ping(); err != nil {
		t.Skipf("skipping live database test: PostgreSQL ping failed: %v", err)
	}

	// Create unique disposable test database
	disposableDBName := fmt.Sprintf("devflow_disposable_%d", time.Now().UnixNano())
	_, err = adminDB.Exec(fmt.Sprintf("CREATE DATABASE %s;", disposableDBName))
	if err != nil {
		t.Fatalf("failed to create disposable database: %v", err)
	}
	defer func() {
		// Clean up disposable DB
		_, _ = adminDB.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE);", disposableDBName))
	}()

	testDBURL := fmt.Sprintf("postgres://devflow:devflow@localhost:5432/%s?sslmode=disable", disposableDBName)

	// Resolve migrations directory path
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working dir: %v", err)
	}
	migrationsPath := filepath.Join(wd, "..", "..", "migrations")
	if _, err := os.Stat(filepath.Join(migrationsPath, "000001_init_schema.up.sql")); err != nil {
		migrationsPath = filepath.Join(wd, "migrations")
	}

	// 1. Test Migration UP
	t.Run("MigrationUp", func(t *testing.T) {
		err := RunMigrationsUp(testDBURL, migrationsPath)
		if err != nil {
			t.Fatalf("RunMigrationsUp failed: %v", err)
		}

		ver, dirty, err := MigrationVersion(testDBURL, migrationsPath)
		if err != nil {
			t.Fatalf("MigrationVersion failed: %v", err)
		}
		if ver != 1 || dirty {
			t.Errorf("expected version 1 (clean), got version %d, dirty=%v", ver, dirty)
		}
	})

	// Connect pgxpool to disposable test DB
	pool, err := NewPool(ctx, testDBURL)
	if err != nil {
		t.Fatalf("failed to connect to test db with pgxpool: %v", err)
	}
	defer pool.Close()

	// 2. Test Table Existence (All 10 MVP tables)
	t.Run("TableExistence", func(t *testing.T) {
		expectedTables := []string{
			"users",
			"refresh_sessions",
			"workspaces",
			"workspace_members",
			"workspace_invitations",
			"projects",
			"project_members",
			"tasks",
			"comments",
			"activity_logs",
		}

		for _, table := range expectedTables {
			var exists bool
			query := `SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'public' AND table_name = $1
			);`
			err := pool.QueryRow(ctx, query, table).Scan(&exists)
			if err != nil {
				t.Errorf("error checking table %s: %v", table, err)
			} else if !exists {
				t.Errorf("expected table %s to exist in public schema", table)
			}
		}

		// Confirm deferred table does NOT exist
		var passwordResetExists bool
		_ = pool.QueryRow(ctx, "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'password_reset_tokens');").Scan(&passwordResetExists)
		if passwordResetExists {
			t.Errorf("table password_reset_tokens should NOT exist in MVP migrations")
		}
	})

	// 3. Test Constraints
	t.Run("UniqueAndCheckConstraints", func(t *testing.T) {
		// A. Insert base user
		var userID string
		err := pool.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, name)
			VALUES ('test@devflow.local', 'argon2id_dummy_hash', 'Test User')
			RETURNING id::text;
		`).Scan(&userID)
		if err != nil {
			t.Fatalf("failed to insert test user: %v", err)
		}

		// Duplicate email should fail
		_, err = pool.Exec(ctx, `
			INSERT INTO users (email, password_hash)
			VALUES ('TEST@devflow.local', 'hash2');
		`)
		if err == nil {
			t.Errorf("expected duplicate email error via users_email_ci_idx, got nil")
		}

		// B. Create workspace
		var workspaceID string
		err = pool.QueryRow(ctx, `
			INSERT INTO workspaces (name, slug, owner_id)
			VALUES ('Dev Workspace', 'dev-ws', $1)
			RETURNING id::text;
		`, userID).Scan(&workspaceID)
		if err != nil {
			t.Fatalf("failed to insert workspace: %v", err)
		}

		// C. Workspace Members: Check role constraint
		_, err = pool.Exec(ctx, `
			INSERT INTO workspace_members (workspace_id, user_id, role)
			VALUES ($1, $2, 'invalid_role');
		`, workspaceID, userID)
		if err == nil {
			t.Errorf("expected check constraint error on invalid workspace role, got nil")
		}

		// Insert valid owner membership
		_, err = pool.Exec(ctx, `
			INSERT INTO workspace_members (workspace_id, user_id, role)
			VALUES ($1, $2, 'owner');
		`, workspaceID, userID)
		if err != nil {
			t.Fatalf("failed to insert owner member: %v", err)
		}

		// Second owner in same workspace must fail partial unique index
		var user2ID string
		err = pool.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, name)
			VALUES ('user2@devflow.local', 'hash', 'User 2')
			RETURNING id::text;
		`).Scan(&user2ID)
		if err != nil {
			t.Fatalf("failed to insert user2: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO workspace_members (workspace_id, user_id, role)
			VALUES ($1, $2, 'member');
		`, workspaceID, user2ID)
		if err != nil {
			t.Fatalf("failed to insert user2 workspace member: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO workspace_members (workspace_id, user_id, role)
			VALUES ($1, $2, 'owner');
		`, workspaceID, user2ID)
		if err == nil {
			t.Errorf("expected duplicate owner error via workspace_members_owner_partial_key, got nil")
		}

		// D. Project & Project Key Uniqueness
		var projectID string
		err = pool.QueryRow(ctx, `
			INSERT INTO projects (workspace_id, key, name, created_by)
			VALUES ($1, 'DEV', 'Dev Project', $2)
			RETURNING id::text;
		`, workspaceID, userID).Scan(&projectID)
		if err != nil {
			t.Fatalf("failed to insert project: %v", err)
		}

		// Duplicate project key in same workspace should fail
		_, err = pool.Exec(ctx, `
			INSERT INTO projects (workspace_id, key, name, created_by)
			VALUES ($1, 'DEV', 'Duplicate Key Project', $2);
		`, workspaceID, userID)
		if err == nil {
			t.Errorf("expected error on duplicate project key within workspace, got nil")
		}

		// E. Project Membership composite FK
		_, err = pool.Exec(ctx, `
			INSERT INTO project_members (project_id, workspace_id, user_id, role)
			VALUES ($1, $2, $3, 'owner');
		`, projectID, workspaceID, userID)
		if err != nil {
			t.Fatalf("failed to insert project member: %v", err)
		}

		// F. Task Check & Composite FK: Assignee must be project member
		// Non-member assignment should fail
		_, err = pool.Exec(ctx, `
			INSERT INTO tasks (project_id, identifier, title, status, priority, assignee_id, created_by)
			VALUES ($1, 'DEV-001', 'Task 1', 'todo', 'medium', $2, $3);
		`, projectID, user2ID, userID)
		if err == nil {
			t.Errorf("expected composite FK error when assigning task to non-project-member, got nil")
		}

		// Valid member assignment succeeds
		var taskID string
		err = pool.QueryRow(ctx, `
			INSERT INTO tasks (project_id, identifier, title, status, priority, assignee_id, created_by)
			VALUES ($1, 'DEV-001', 'Task 1', 'todo', 'medium', $2, $2)
			RETURNING id::text;
		`, projectID, userID).Scan(&taskID)
		if err != nil {
			t.Fatalf("failed to insert valid task: %v", err)
		}

		// G. Task status check constraint
		_, err = pool.Exec(ctx, `
			INSERT INTO tasks (project_id, identifier, title, status, priority, created_by)
			VALUES ($1, 'DEV-002', 'Task 2', 'invalid_status', 'medium', $2);
		`, projectID, userID)
		if err == nil {
			t.Errorf("expected check constraint error on invalid task status, got nil")
		}

		// H. Composite FK RESTRICT on project member deletion
		_, err = pool.Exec(ctx, `
			DELETE FROM project_members WHERE project_id = $1 AND user_id = $2;
		`, projectID, userID)
		if err == nil {
			t.Errorf("expected composite FK RESTRICT error when deleting project member with assigned task, got nil")
		}

		// I. Activity logs insert & references
		_, err = pool.Exec(ctx, `
			INSERT INTO activity_logs (project_id, task_id, actor_id, action, metadata)
			VALUES ($1, $2, $3, 'task_created', '{"title": "Task 1"}'::jsonb);
		`, projectID, taskID, userID)
		if err != nil {
			t.Fatalf("failed to insert activity log: %v", err)
		}
	})

	// 4. Test Migration DOWN and REAPPLICATION
	t.Run("MigrationDownAndReapply", func(t *testing.T) {
		// Close pool connections before dropping tables
		pool.Close()

		// Migration DOWN
		err := RunMigrationsDown(testDBURL, migrationsPath)
		if err != nil {
			t.Fatalf("RunMigrationsDown failed: %v", err)
		}

		// Verify tables are gone
		testDB, err := sql.Open("postgres", testDBURL)
		if err != nil {
			t.Fatalf("failed to connect to test db: %v", err)
		}
		defer testDB.Close()

		var count int
		err = testDB.QueryRow(`
			SELECT count(*) FROM information_schema.tables 
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations';
		`).Scan(&count)
		if err != nil {
			t.Fatalf("failed to query remaining tables: %v", err)
		}
		if count != 0 {
			t.Errorf("expected 0 application tables after migration down, got %d", count)
		}

		// Migration REAPPLICATION UP
		err = RunMigrationsUp(testDBURL, migrationsPath)
		if err != nil {
			t.Fatalf("RunMigrationsUp (reapply) failed: %v", err)
		}

		ver, dirty, err := MigrationVersion(testDBURL, migrationsPath)
		if err != nil {
			t.Fatalf("MigrationVersion failed: %v", err)
		}
		if ver != 1 || dirty {
			t.Errorf("expected version 1 clean after reapply, got %d, dirty=%v", ver, dirty)
		}
	})
}
