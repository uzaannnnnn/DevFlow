package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"

	"github.com/google/uuid"
)

func TestProject_ComprehensiveIntegration(t *testing.T) {
	ctx := context.Background()

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

	ts := time.Now().UnixNano()
	ownerEmail := fmt.Sprintf("owner_%d@devflow.local", ts)
	adminEmail := fmt.Sprintf("admin_%d@devflow.local", ts)
	memberEmail := fmt.Sprintf("member_%d@devflow.local", ts)
	outsideEmail := fmt.Sprintf("outside_%d@devflow.local", ts)

	ownerID, ownerToken := createAuthenticatedUser(t, router, ownerEmail, "Password123!", "Workspace Owner")
	adminID, adminToken := createAuthenticatedUser(t, router, adminEmail, "Password123!", "Workspace Admin")
	memberID, memberToken := createAuthenticatedUser(t, router, memberEmail, "Password123!", "Workspace Member")
	outsideID, outsideToken := createAuthenticatedUser(t, router, outsideEmail, "Password123!", "Outside User")

	// 1. Create Workspace
	createWsBody, _ := json.Marshal(domain.CreateWorkspaceInput{
		Name: fmt.Sprintf("Project Test WS %d", ts),
	})
	reqWs := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(createWsBody))
	reqWs.Header.Set("Content-Type", "application/json")
	reqWs.Header.Set("Authorization", "Bearer "+ownerToken)
	wWs := httptest.NewRecorder()
	router.ServeHTTP(wWs, reqWs)
	if wWs.Code != http.StatusCreated {
		t.Fatalf("failed to create workspace: code=%d, body=%s", wWs.Code, wWs.Body.String())
	}
	var wsRes struct {
		Data struct {
			Workspace domain.WorkspaceResponse `json:"workspace"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wWs.Body.Bytes(), &wsRes)
	workspaceID := wsRes.Data.Workspace.ID.String()

	// Add Admin and Member to Workspace
	addAdminBody, _ := json.Marshal(domain.AddMemberInput{Email: adminEmail, Role: domain.RoleAdmin})
	reqAddAdmin := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(addAdminBody))
	reqAddAdmin.Header.Set("Content-Type", "application/json")
	reqAddAdmin.Header.Set("Authorization", "Bearer "+ownerToken)
	wAddAdmin := httptest.NewRecorder()
	router.ServeHTTP(wAddAdmin, reqAddAdmin)
	if wAddAdmin.Code != http.StatusCreated {
		t.Fatalf("failed to add admin to workspace: %s", wAddAdmin.Body.String())
	}

	addMemberBody, _ := json.Marshal(domain.AddMemberInput{Email: memberEmail, Role: domain.RoleMember})
	reqAddMem := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(addMemberBody))
	reqAddMem.Header.Set("Content-Type", "application/json")
	reqAddMem.Header.Set("Authorization", "Bearer "+ownerToken)
	wAddMem := httptest.NewRecorder()
	router.ServeHTTP(wAddMem, reqAddMem)
	if wAddMem.Code != http.StatusCreated {
		t.Fatalf("failed to add member to workspace: %s", wAddMem.Body.String())
	}

	var projectID string
	projectKey := "DEV"

	// ==========================================
	// 1. CREATE PROJECT (Atomic Creator As Owner)
	// ==========================================
	t.Run("CreateProject_SuccessAndAutomaticOwner", func(t *testing.T) {
		keyStr := projectKey
		descStr := "Core API Development Project"
		body, _ := json.Marshal(domain.CreateProjectInput{
			Name:        "Backend Core",
			Key:         &keyStr,
			Description: &descStr,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/projects", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}

		var res struct {
			Data struct {
				Project domain.ProjectResponse `json:"project"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if res.Data.Project.Key != "DEV" {
			t.Fatalf("expected key 'DEV', got %s", res.Data.Project.Key)
		}
		if res.Data.Project.Role != domain.ProjectRoleOwner {
			t.Fatalf("expected creator to automatically have project role 'owner', got %s", res.Data.Project.Role)
		}
		if res.Data.Project.TaskCounter != 0 {
			t.Fatalf("expected task counter 0, got %d", res.Data.Project.TaskCounter)
		}

		projectID = res.Data.Project.ID.String()
	})

	// ==========================================
	// 2. PROJECT KEY UNIQUENESS IN WORKSPACE
	// ==========================================
	t.Run("CreateProject_DuplicateKeyConflictInSameWorkspace", func(t *testing.T) {
		keyStr := projectKey
		body, _ := json.Marshal(domain.CreateProjectInput{
			Name: "Backend V2",
			Key:  &keyStr,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/projects", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409 Conflict on duplicate project key in workspace, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	// ==========================================
	// 3. SAME PROJECT KEY IN DIFFERENT WORKSPACE (ALLOWED)
	// ==========================================
	t.Run("CreateProject_SameKeyInDifferentWorkspaceAllowed", func(t *testing.T) {
		// Create Workspace 2
		ws2Body, _ := json.Marshal(domain.CreateWorkspaceInput{
			Name: fmt.Sprintf("Project Test WS 2 %d", ts),
		})
		reqWs2 := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(ws2Body))
		reqWs2.Header.Set("Content-Type", "application/json")
		reqWs2.Header.Set("Authorization", "Bearer "+ownerToken)
		wWs2 := httptest.NewRecorder()
		router.ServeHTTP(wWs2, reqWs2)
		var ws2Res struct {
			Data struct {
				Workspace domain.WorkspaceResponse `json:"workspace"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wWs2.Body.Bytes(), &ws2Res)
		ws2ID := ws2Res.Data.Workspace.ID.String()

		// Create project in Workspace 2 using same key 'DEV'
		keyStr := projectKey
		body, _ := json.Marshal(domain.CreateProjectInput{
			Name: "Workspace 2 Dev",
			Key:  &keyStr,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+ws2ID+"/projects", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for same key in different workspace, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	// ==========================================
	// 4. PROJECT LISTING & DECISION 5 ISOLATION
	// ==========================================
	t.Run("ListProjects_Decision5_WorkspaceAdminCannotSeeNonMemberProjects", func(t *testing.T) {
		// Workspace Admin is in the workspace, but has NOT been added to the project yet!
		reqAdmin := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+workspaceID+"/projects", nil)
		reqAdmin.Header.Set("Authorization", "Bearer "+adminToken)
		wAdmin := httptest.NewRecorder()
		router.ServeHTTP(wAdmin, reqAdmin)

		if wAdmin.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for admin listing projects, got %d", wAdmin.Code)
		}

		var resAdmin struct {
			Data struct {
				Projects []domain.ProjectResponse `json:"projects"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wAdmin.Body.Bytes(), &resAdmin)

		// Per Decision 5 and AC-Z2, workspace Admin must NOT see projects they are not members of!
		if len(resAdmin.Data.Projects) != 0 {
			t.Fatalf("DECISION 5 VIOLATION: Workspace admin without project membership was able to see %d project(s)!", len(resAdmin.Data.Projects))
		}

		// Owner sees 1 project
		reqOwner := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+workspaceID+"/projects", nil)
		reqOwner.Header.Set("Authorization", "Bearer "+ownerToken)
		wOwner := httptest.NewRecorder()
		router.ServeHTTP(wOwner, reqOwner)

		var resOwner struct {
			Data struct {
				Projects []domain.ProjectResponse `json:"projects"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wOwner.Body.Bytes(), &resOwner)
		if len(resOwner.Data.Projects) != 1 {
			t.Fatalf("expected project creator to see 1 project, got %d", len(resOwner.Data.Projects))
		}
	})

	// ==========================================
	// 5. GET PROJECT DETAIL (IDOR Prevention)
	// ==========================================
	t.Run("GetProject_NonMemberResourceWithholding", func(t *testing.T) {
		// Non-member (workspace admin not in project) gets 404 resource withholding
		req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+projectID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound && w.Code != http.StatusForbidden {
			t.Fatalf("IDOR VIOLATION: Non-member was able to get project details! Code: %d", w.Code)
		}

		// Outside user gets 404 resource withholding
		reqOutside := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+projectID, nil)
		reqOutside.Header.Set("Authorization", "Bearer "+outsideToken)
		wOutside := httptest.NewRecorder()
		router.ServeHTTP(wOutside, reqOutside)
		if wOutside.Code != http.StatusNotFound && wOutside.Code != http.StatusForbidden {
			t.Fatalf("IDOR VIOLATION: Outside user was able to get project details! Code: %d", wOutside.Code)
		}

		// Project member (owner) gets 200 OK
		reqMember := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+projectID, nil)
		reqMember.Header.Set("Authorization", "Bearer "+ownerToken)
		wMember := httptest.NewRecorder()
		router.ServeHTTP(wMember, reqMember)

		if wMember.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for project member, got %d", wMember.Code)
		}
	})

	// ==========================================
	// 6. ADD PROJECT MEMBER
	// ==========================================
	t.Run("AddProjectMember_SuccessAndWorkspaceEnforcement", func(t *testing.T) {
		// Attempt to add outside user who is NOT in the workspace
		addOutsideBody, _ := json.Marshal(domain.AddProjectMemberInput{
			UserID: outsideID, // outside user
			Role:   domain.ProjectRoleMember,
		})
		reqOutside := httptest.NewRequest(http.MethodPost, "/api/v1/projects/"+projectID+"/members", bytes.NewReader(addOutsideBody))
		reqOutside.Header.Set("Content-Type", "application/json")
		reqOutside.Header.Set("Authorization", "Bearer "+ownerToken)
		wOutside := httptest.NewRecorder()
		router.ServeHTTP(wOutside, reqOutside)

		if wOutside.Code != http.StatusBadRequest {
			t.Fatalf("SECURITY VIOLATION: User not in workspace was added to project! Code: %d, Body: %s", wOutside.Code, wOutside.Body.String())
		}

		// Add workspace member (memberID) to project
		addValidBody, _ := json.Marshal(domain.AddProjectMemberInput{
			UserID: memberID,
			Role:   domain.ProjectRoleMember,
		})
		reqValid := httptest.NewRequest(http.MethodPost, "/api/v1/projects/"+projectID+"/members", bytes.NewReader(addValidBody))
		reqValid.Header.Set("Content-Type", "application/json")
		reqValid.Header.Set("Authorization", "Bearer "+ownerToken)
		wValid := httptest.NewRecorder()
		router.ServeHTTP(wValid, reqValid)

		if wValid.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created adding member to project, got %d. Body: %s", wValid.Code, wValid.Body.String())
		}

		// Add workspace admin (adminID) to project with role 'admin'
		addAdminBody, _ := json.Marshal(domain.AddProjectMemberInput{
			UserID: adminID,
			Role:   domain.ProjectRoleAdmin,
		})
		reqAdmin := httptest.NewRequest(http.MethodPost, "/api/v1/projects/"+projectID+"/members", bytes.NewReader(addAdminBody))
		reqAdmin.Header.Set("Content-Type", "application/json")
		reqAdmin.Header.Set("Authorization", "Bearer "+ownerToken)
		wAdmin := httptest.NewRecorder()
		router.ServeHTTP(wAdmin, reqAdmin)

		if wAdmin.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created adding admin to project, got %d. Body: %s", wAdmin.Code, wAdmin.Body.String())
		}
	})

	// ==========================================
	// 7. PREVENT DUPLICATE PROJECT MEMBERSHIP
	// ==========================================
	t.Run("AddProjectMember_DuplicateConflict", func(t *testing.T) {
		body, _ := json.Marshal(domain.AddProjectMemberInput{
			UserID: memberID,
			Role:   domain.ProjectRoleMember,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/"+projectID+"/members", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409 Conflict on duplicate project member, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	// ==========================================
	// 8. UPDATE PROJECT (Key Immutability & RBAC)
	// ==========================================
	t.Run("UpdateProject_KeyImmutabilityAndRBAC", func(t *testing.T) {
		// Ordinary project member cannot update project info
		newName := "Hacked By Member"
		bodyMember, _ := json.Marshal(domain.UpdateProjectInput{
			Name: &newName,
		})
		reqMember := httptest.NewRequest(http.MethodPatch, "/api/v1/projects/"+projectID, bytes.NewReader(bodyMember))
		reqMember.Header.Set("Content-Type", "application/json")
		reqMember.Header.Set("Authorization", "Bearer "+memberToken)
		wMember := httptest.NewRecorder()
		router.ServeHTTP(wMember, reqMember)

		if wMember.Code != http.StatusForbidden {
			t.Fatalf("RBAC VIOLATION: Ordinary project member was able to update project! Code: %d", wMember.Code)
		}

		// Project Admin updates project name
		updatedName := "Backend Core Updated"
		newDesc := "New project description"
		bodyAdmin, _ := json.Marshal(domain.UpdateProjectInput{
			Name:        &updatedName,
			Description: &newDesc,
		})
		reqAdmin := httptest.NewRequest(http.MethodPatch, "/api/v1/projects/"+projectID, bytes.NewReader(bodyAdmin))
		reqAdmin.Header.Set("Content-Type", "application/json")
		reqAdmin.Header.Set("Authorization", "Bearer "+adminToken)
		wAdmin := httptest.NewRecorder()
		router.ServeHTTP(wAdmin, reqAdmin)

		if wAdmin.Code != http.StatusOK {
			t.Fatalf("expected 200 OK updating project by admin, got %d. Body: %s", wAdmin.Code, wAdmin.Body.String())
		}

		// Verify project key DEV remained unchanged
		var res struct {
			Data struct {
				Project domain.ProjectResponse `json:"project"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wAdmin.Body.Bytes(), &res)
		if res.Data.Project.Key != "DEV" {
			t.Fatalf("IMMUTABILITY VIOLATION: Project key changed to %s!", res.Data.Project.Key)
		}
		if res.Data.Project.Name != "Backend Core Updated" {
			t.Fatalf("expected updated name, got %s", res.Data.Project.Name)
		}
	})

	// ==========================================
	// 9. REMOVE PROJECT MEMBER & TASK UNASSIGNMENT (§8.13)
	// ==========================================
	t.Run("RemoveProjectMember_TaskUnassignmentAndOwnerProtection", func(t *testing.T) {
		// Project Owner attempts to remove self (sole owner protection)
		reqOwnerLeave := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", projectID, ownerID.String()), nil)
		reqOwnerLeave.Header.Set("Authorization", "Bearer "+ownerToken)
		wOwnerLeave := httptest.NewRecorder()
		router.ServeHTTP(wOwnerLeave, reqOwnerLeave)

		if wOwnerLeave.Code != http.StatusBadRequest {
			t.Fatalf("INVARIANT VIOLATION: Sole project owner was able to leave without transfer! Code: %d", wOwnerLeave.Code)
		}

		// Insert ACTIVE task assigned to memberID in this project
		var activeTaskID string
		err := pool.QueryRow(ctx, `
			INSERT INTO tasks (project_id, identifier, title, status, priority, assignee_id, created_by)
			VALUES ($1, 'DEV-001', 'Active Assignment Task', 'todo', 'medium', $2, $3)
			RETURNING id::text;
		`, projectID, memberID, ownerID).Scan(&activeTaskID)
		if err != nil {
			t.Fatalf("failed to insert active test task: %v", err)
		}

		// Insert SOFT-DELETED task assigned to memberID in this project (§8.13 requirement)
		var softDeletedTaskID string
		err = pool.QueryRow(ctx, `
			INSERT INTO tasks (project_id, identifier, title, status, priority, assignee_id, created_by, deleted_at)
			VALUES ($1, 'DEV-002', 'Soft-deleted Task', 'done', 'low', $2, $3, now())
			RETURNING id::text;
		`, projectID, memberID, ownerID).Scan(&softDeletedTaskID)
		if err != nil {
			t.Fatalf("failed to insert soft-deleted test task: %v", err)
		}

		// Insert task in an UNRELATED project assigned to memberID (should NOT be unassigned)
		var unrelatedProjectID string
		err = pool.QueryRow(ctx, `
			INSERT INTO projects (workspace_id, key, name, created_by)
			VALUES ($1, 'OTHER', 'Other Unrelated Project', $2)
			RETURNING id::text;
		`, workspaceID, ownerID).Scan(&unrelatedProjectID)
		if err != nil {
			t.Fatalf("failed to insert unrelated project: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO project_members (project_id, workspace_id, user_id, role)
			VALUES ($1, $2, $3, 'member');
		`, unrelatedProjectID, workspaceID, memberID)
		if err != nil {
			t.Fatalf("failed to insert membership in other project: %v", err)
		}

		var unrelatedTaskID string
		err = pool.QueryRow(ctx, `
			INSERT INTO tasks (project_id, identifier, title, status, priority, assignee_id, created_by)
			VALUES ($1, 'OTHER-001', 'Other Project Task', 'todo', 'high', $2, $3)
			RETURNING id::text;
		`, unrelatedProjectID, memberID, ownerID).Scan(&unrelatedTaskID)
		if err != nil {
			t.Fatalf("failed to insert unrelated task: %v", err)
		}

		// Count initial activity logs
		var initialLogCount int
		_ = pool.QueryRow(ctx, "SELECT count(*) FROM activity_logs WHERE action = 'task_unassigned'").Scan(&initialLogCount)

		// Project Admin removes Member from target project
		reqRemove := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", projectID, memberID.String()), nil)
		reqRemove.Header.Set("Authorization", "Bearer "+adminToken)
		wRemove := httptest.NewRecorder()
		router.ServeHTTP(wRemove, reqRemove)

		if wRemove.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on member removal, got %d. Body: %s", wRemove.Code, wRemove.Body.String())
		}

		// 1. Verify ACTIVE task assignee_id was set to NULL per §8.13
		var activeAssignee *uuid.UUID
		err = pool.QueryRow(ctx, "SELECT assignee_id FROM tasks WHERE id = $1", activeTaskID).Scan(&activeAssignee)
		if err != nil || activeAssignee != nil {
			t.Fatalf("TASK UNASSIGNMENT VIOLATION: active task assignee was not set to NULL after member removal!")
		}

		// 2. Verify SOFT-DELETED task assignee_id was set to NULL per §8.13
		var softDeletedAssignee *uuid.UUID
		err = pool.QueryRow(ctx, "SELECT assignee_id FROM tasks WHERE id = $1", softDeletedTaskID).Scan(&softDeletedAssignee)
		if err != nil || softDeletedAssignee != nil {
			t.Fatalf("TASK UNASSIGNMENT VIOLATION: soft-deleted task assignee was not set to NULL after member removal!")
		}

		// 3. Verify UNRELATED project task assignee_id was UNTOUCHED (single-project scoping)
		var unrelatedAssignee *uuid.UUID
		err = pool.QueryRow(ctx, "SELECT assignee_id FROM tasks WHERE id = $1", unrelatedTaskID).Scan(&unrelatedAssignee)
		if err != nil || unrelatedAssignee == nil || *unrelatedAssignee != memberID {
			t.Fatalf("PROJECT SCOPE VIOLATION: task in unrelated project was modified during member removal!")
		}

		// 4. Verify ATOMIC ACTIVITY LOGS were recorded for the 2 unassigned tasks (§8.13)
		var newLogCount int
		err = pool.QueryRow(ctx, "SELECT count(*) FROM activity_logs WHERE action = 'task_unassigned' AND project_id = $1", projectID).Scan(&newLogCount)
		if err != nil || newLogCount != 2 {
			t.Fatalf("ACTIVITY LOG VIOLATION: expected 2 task_unassigned activity logs, found %d", newLogCount)
		}
	})

	// ==========================================
	// 10. ARCHIVE PROJECT PERMISSIONS (AC-C5) & SOFT DELETE
	// ==========================================
	t.Run("ArchiveProject_PermissionsAndSoftDelete", func(t *testing.T) {
		// Create another project for granular permission testing
		var projForArchiveID string
		err := pool.QueryRow(ctx, `
			INSERT INTO projects (workspace_id, key, name, created_by)
			VALUES ($1, 'ARC', 'Archive Test Project', $2)
			RETURNING id::text;
		`, workspaceID, ownerID).Scan(&projForArchiveID)
		if err != nil {
			t.Fatalf("failed to insert archive test project: %v", err)
		}

		// Add member as ProjectRoleMember
		_, err = pool.Exec(ctx, `
			INSERT INTO project_members (project_id, workspace_id, user_id, role)
			VALUES ($1, $2, $3, 'member');
		`, projForArchiveID, workspaceID, memberID)
		if err != nil {
			t.Fatalf("failed to insert project member: %v", err)
		}

		// Add admin as ProjectRoleAdmin
		_, err = pool.Exec(ctx, `
			INSERT INTO project_members (project_id, workspace_id, user_id, role)
			VALUES ($1, $2, $3, 'admin');
		`, projForArchiveID, workspaceID, adminID)
		if err != nil {
			t.Fatalf("failed to insert project admin: %v", err)
		}

		// 1. Ordinary Member attempts to archive: MUST return 403 Forbidden
		reqMemArchive := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projForArchiveID, nil)
		reqMemArchive.Header.Set("Authorization", "Bearer "+memberToken)
		wMemArchive := httptest.NewRecorder()
		router.ServeHTTP(wMemArchive, reqMemArchive)
		if wMemArchive.Code != http.StatusForbidden {
			t.Fatalf("SECURITY VIOLATION: Ordinary member was able to archive project! Code: %d", wMemArchive.Code)
		}

		// 2. Non-member attempts to archive: MUST return 404 Not Found (resource withholding)
		reqOutArchive := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projForArchiveID, nil)
		reqOutArchive.Header.Set("Authorization", "Bearer "+outsideToken)
		wOutArchive := httptest.NewRecorder()
		router.ServeHTTP(wOutArchive, reqOutArchive)
		if wOutArchive.Code != http.StatusNotFound {
			t.Fatalf("SECURITY VIOLATION: Non-member got status %d, expected 404", wOutArchive.Code)
		}

		// 3. Project Admin archives: MUST return 200 OK per AC-C5
		reqAdminArchive := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projForArchiveID, nil)
		reqAdminArchive.Header.Set("Authorization", "Bearer "+adminToken)
		wAdminArchive := httptest.NewRecorder()
		router.ServeHTTP(wAdminArchive, reqAdminArchive)
		if wAdminArchive.Code != http.StatusOK {
			t.Fatalf("AC-C5 VIOLATION: Project Admin could not archive project! Code: %d, body: %s", wAdminArchive.Code, wAdminArchive.Body.String())
		}

		// Subsequent GET returns 404
		reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+projForArchiveID, nil)
		reqGet.Header.Set("Authorization", "Bearer "+ownerToken)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)
		if wGet.Code != http.StatusNotFound {
			t.Fatalf("SOFT DELETE VIOLATION: Archived project still accessible via GET! Code: %d", wGet.Code)
		}

		// 4. Project Owner archives projectID: MUST return 200 OK
		reqOwnerArchive := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projectID, nil)
		reqOwnerArchive.Header.Set("Authorization", "Bearer "+ownerToken)
		wOwnerArchive := httptest.NewRecorder()
		router.ServeHTTP(wOwnerArchive, reqOwnerArchive)
		if wOwnerArchive.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for owner archiving project, got %d", wOwnerArchive.Code)
		}
	})

	// ==========================================
	// 11. CONCURRENT OPERATIONS & SOLE OWNER PROTECTION INVARIANT
	// ==========================================
	t.Run("ConcurrentOperations_SoleOwnerProtectionInvariant", func(t *testing.T) {
		// Create a separate project with 1 owner and 1 admin
		var cProjID string
		err := pool.QueryRow(ctx, `
			INSERT INTO projects (workspace_id, key, name, created_by)
			VALUES ($1, 'CONC', 'Concurrency Test Project', $2)
			RETURNING id::text;
		`, workspaceID, ownerID).Scan(&cProjID)
		if err != nil {
			t.Fatalf("failed to insert concurrency project: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO project_members (project_id, workspace_id, user_id, role)
			VALUES ($1, $2, $3, 'owner');
		`, cProjID, workspaceID, ownerID)
		if err != nil {
			t.Fatalf("failed to insert owner: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO project_members (project_id, workspace_id, user_id, role)
			VALUES ($1, $2, $3, 'admin');
		`, cProjID, workspaceID, adminID)
		if err != nil {
			t.Fatalf("failed to insert admin: %v", err)
		}

		// Run 10 concurrent requests attempting to demote or remove the sole owner
		const workers = 10
		results := make(chan int, workers)

		for i := 0; i < workers; i++ {
			go func(idx int) {
				if idx%2 == 0 {
					// Attempt to remove/leave
					req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", cProjID, ownerID.String()), nil)
					req.Header.Set("Authorization", "Bearer "+ownerToken)
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					results <- w.Code
				} else {
					// Attempt to demote
					body, _ := json.Marshal(domain.UpdateProjectMemberRoleInput{Role: "member"})
					req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/projects/%s/members/%s", cProjID, ownerID.String()), bytes.NewReader(body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Authorization", "Bearer "+adminToken)
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					results <- w.Code
				}
			}(i)
		}

		// Every single concurrent request MUST be rejected (400 Bad Request or 403 Forbidden)
		for i := 0; i < workers; i++ {
			code := <-results
			if code == http.StatusOK {
				t.Fatalf("RACE CONDITION VIOLATION: A concurrent request succeeded in demoting or removing the sole owner! Code: %d", code)
			}
		}

		// Verify project STILL has exactly 1 owner with role = 'owner'
		var ownerCount int
		err = pool.QueryRow(ctx, "SELECT count(*) FROM project_members WHERE project_id = $1 AND role = 'owner'", cProjID).Scan(&ownerCount)
		if err != nil {
			t.Fatalf("failed to count owners: %v", err)
		}
		if ownerCount != 1 {
			t.Fatalf("INVARIANT VIOLATION: expected exactly 1 owner after concurrent operations, found %d", ownerCount)
		}
	})
}
