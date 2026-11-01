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

	"github.com/google/uuid"
)

func TestTask_ComprehensiveIntegration(t *testing.T) {
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

	ownerID, ownerToken := createAuthenticatedUser(t, router, ownerEmail, "Password123!", "Task Owner")
	adminID, adminToken := createAuthenticatedUser(t, router, adminEmail, "Password123!", "Workspace Admin")
	memberID, memberToken := createAuthenticatedUser(t, router, memberEmail, "Password123!", "Project Member")
	outsideID, outsideToken := createAuthenticatedUser(t, router, outsideEmail, "Password123!", "Outside User")

	// 1. Create Workspace
	createWsBody, _ := json.Marshal(domain.CreateWorkspaceInput{
		Name: fmt.Sprintf("Task Test WS %d", ts),
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
	reqAddAdmin := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/members", workspaceID), bytes.NewReader(addAdminBody))
	reqAddAdmin.Header.Set("Content-Type", "application/json")
	reqAddAdmin.Header.Set("Authorization", "Bearer "+ownerToken)
	wAddAdmin := httptest.NewRecorder()
	router.ServeHTTP(wAddAdmin, reqAddAdmin)

	addMemberBody, _ := json.Marshal(domain.AddMemberInput{Email: memberEmail, Role: domain.RoleMember})
	reqAddMember := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/members", workspaceID), bytes.NewReader(addMemberBody))
	reqAddMember.Header.Set("Content-Type", "application/json")
	reqAddMember.Header.Set("Authorization", "Bearer "+ownerToken)
	wAddMember := httptest.NewRecorder()
	router.ServeHTTP(wAddMember, reqAddMember)

	// 2. Create Project (Owner is creator -> automatically added as Project Owner)
	projKey := "CORE"
	createProjBody, _ := json.Marshal(domain.CreateProjectInput{
		Name: "Core Platform",
		Key:  &projKey,
	})
	reqProj := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/projects", workspaceID), bytes.NewReader(createProjBody))
	reqProj.Header.Set("Content-Type", "application/json")
	reqProj.Header.Set("Authorization", "Bearer "+ownerToken)
	wProj := httptest.NewRecorder()
	router.ServeHTTP(wProj, reqProj)
	if wProj.Code != http.StatusCreated {
		t.Fatalf("failed to create project: code=%d, body=%s", wProj.Code, wProj.Body.String())
	}
	var projRes struct {
		Data struct {
			Project domain.ProjectResponse `json:"project"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wProj.Body.Bytes(), &projRes)
	projectID := projRes.Data.Project.ID.String()

	// Add Member to Project (role: member)
	addPMBody, _ := json.Marshal(domain.AddProjectMemberInput{UserID: memberID, Role: domain.ProjectRoleMember})
	reqPM := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/members", projectID), bytes.NewReader(addPMBody))
	reqPM.Header.Set("Content-Type", "application/json")
	reqPM.Header.Set("Authorization", "Bearer "+ownerToken)
	wPM := httptest.NewRecorder()
	router.ServeHTTP(wPM, reqPM)
	if wPM.Code != http.StatusCreated {
		t.Fatalf("failed to add member to project: code=%d, body=%s", wPM.Code, wPM.Body.String())
	}

	// NOTE: adminID is a Workspace Admin, but NOT a member of this project!

	var task1ID string
	var task2ID string

	// ==========================================
	// 1. Task Creation & Identifier Generation
	// ==========================================
	t.Run("CreateTask_MinimalAndFull", func(t *testing.T) {
		// Task 1: Minimal fields
		t1Input, _ := json.Marshal(domain.CreateTaskInput{
			Title: "Setup database migrations",
		})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(t1Input))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for minimal task, got %d: %s", w.Code, w.Body.String())
		}
		var res1 struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &res1)
		task1ID = res1.Data.Task.ID.String()

		// Verify project-specific identifier pattern DEV-001 (here CORE-001)
		if res1.Data.Task.Identifier != "CORE-001" {
			t.Errorf("expected identifier CORE-001, got %q", res1.Data.Task.Identifier)
		}
		if res1.Data.Task.Status != domain.TaskStatusTodo {
			t.Errorf("expected default status todo, got %q", res1.Data.Task.Status)
		}
		if res1.Data.Task.Priority != domain.TaskPriorityMedium {
			t.Errorf("expected default priority medium, got %q", res1.Data.Task.Priority)
		}
		if res1.Data.Task.AssigneeID != nil {
			t.Errorf("expected unassigned task, got %v", res1.Data.Task.AssigneeID)
		}

		// Task 2: Full fields with assignee and due date
		dueDate := time.Now().Add(48 * time.Hour).UTC().Truncate(time.Second)
		desc := "Configure golang-migrate in CI/CD pipeline"
		status := domain.TaskStatusInProgress
		priority := domain.TaskPriorityHigh

		t2Input, _ := json.Marshal(domain.CreateTaskInput{
			Title:       "Configure CI migration runner",
			Description: &desc,
			Status:      &status,
			Priority:    &priority,
			AssigneeID:  &memberID,
			DueDate:     &dueDate,
		})
		req2 := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(t2Input))
		req2.Header.Set("Content-Type", "application/json")
		req2.Header.Set("Authorization", "Bearer "+ownerToken)
		w2 := httptest.NewRecorder()
		router.ServeHTTP(w2, req2)

		if w2.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for full task, got %d: %s", w2.Code, w2.Body.String())
		}
		var res2 struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w2.Body.Bytes(), &res2)
		task2ID = res2.Data.Task.ID.String()

		if res2.Data.Task.Identifier != "CORE-002" {
			t.Errorf("expected identifier CORE-002, got %q", res2.Data.Task.Identifier)
		}
		if res2.Data.Task.Status != domain.TaskStatusInProgress {
			t.Errorf("expected status in_progress, got %q", res2.Data.Task.Status)
		}
		if res2.Data.Task.Priority != domain.TaskPriorityHigh {
			t.Errorf("expected priority high, got %q", res2.Data.Task.Priority)
		}
		if res2.Data.Task.AssigneeID == nil || *res2.Data.Task.AssigneeID != memberID {
			t.Errorf("expected assignee %s, got %v", memberID, res2.Data.Task.AssigneeID)
		}
		if res2.Data.Task.Assignee == nil || res2.Data.Task.Assignee.Email != memberEmail {
			t.Errorf("expected populated assignee email %s, got %v", memberEmail, res2.Data.Task.Assignee)
		}
	})

	// ==========================================
	// 2. Task Assignment Validation
	// ==========================================
	t.Run("CreateTask_RejectsNonProjectMemberAssignee", func(t *testing.T) {
		// Attempt to assign to adminID (who is in workspace, but NOT in project)
		tInput, _ := json.Marshal(domain.CreateTaskInput{
			Title:      "Unauthorized assignment task",
			AssigneeID: &adminID,
		})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(tInput))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for non-project member assignee, got %d: %s", w.Code, w.Body.String())
		}

		// Also attempt to assign to outsideID (who is completely outside the workspace)
		tInputOutside, _ := json.Marshal(domain.CreateTaskInput{
			Title:      "Outside user assignment task",
			AssigneeID: &outsideID,
		})
		reqOutside := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(tInputOutside))
		reqOutside.Header.Set("Content-Type", "application/json")
		reqOutside.Header.Set("Authorization", "Bearer "+ownerToken)
		wOutside := httptest.NewRecorder()
		router.ServeHTTP(wOutside, reqOutside)

		if wOutside.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for outside user assignee, got %d: %s", wOutside.Code, wOutside.Body.String())
		}
	})

	// ==========================================
	// 3. Task Listing, Filtering, and Pagination
	// ==========================================
	t.Run("ListTasks_FilteringAndSearching", func(t *testing.T) {
		// All tasks in project
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), nil)
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}
		var listRes struct {
			Data struct {
				Tasks []domain.Task `json:"tasks"`
				Total int64         `json:"total"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &listRes)
		if listRes.Data.Total != 2 || len(listRes.Data.Tasks) != 2 {
			t.Errorf("expected total 2 tasks, got total=%d, len=%d", listRes.Data.Total, len(listRes.Data.Tasks))
		}

		// Filter by status=todo
		reqStatus := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks?status=todo", projectID), nil)
		reqStatus.Header.Set("Authorization", "Bearer "+ownerToken)
		wStatus := httptest.NewRecorder()
		router.ServeHTTP(wStatus, reqStatus)
		_ = json.Unmarshal(wStatus.Body.Bytes(), &listRes)
		if listRes.Data.Total != 1 || listRes.Data.Tasks[0].Identifier != "CORE-001" {
			t.Errorf("expected 1 task with status todo (CORE-001), got total=%d", listRes.Data.Total)
		}

		// Filter by priority=high
		reqPri := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks?priority=high", projectID), nil)
		reqPri.Header.Set("Authorization", "Bearer "+ownerToken)
		wPri := httptest.NewRecorder()
		router.ServeHTTP(wPri, reqPri)
		_ = json.Unmarshal(wPri.Body.Bytes(), &listRes)
		if listRes.Data.Total != 1 || listRes.Data.Tasks[0].Identifier != "CORE-002" {
			t.Errorf("expected 1 task with priority high (CORE-002), got total=%d", listRes.Data.Total)
		}

		// Filter by search=CI
		reqSearch := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks?search=CI", projectID), nil)
		reqSearch.Header.Set("Authorization", "Bearer "+ownerToken)
		wSearch := httptest.NewRecorder()
		router.ServeHTTP(wSearch, reqSearch)
		_ = json.Unmarshal(wSearch.Body.Bytes(), &listRes)
		if listRes.Data.Total != 1 || listRes.Data.Tasks[0].Identifier != "CORE-002" {
			t.Errorf("expected 1 task matching search 'CI', got total=%d", listRes.Data.Total)
		}

		// Filter by assignee_id=memberID
		reqAssignee := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks?assignee_id=%s", projectID, memberID.String()), nil)
		reqAssignee.Header.Set("Authorization", "Bearer "+ownerToken)
		wAssignee := httptest.NewRecorder()
		router.ServeHTTP(wAssignee, reqAssignee)
		_ = json.Unmarshal(wAssignee.Body.Bytes(), &listRes)
		if listRes.Data.Total != 1 || listRes.Data.Tasks[0].Identifier != "CORE-002" {
			t.Errorf("expected 1 task assigned to memberID, got total=%d", listRes.Data.Total)
		}

		// Pagination limit=1
		reqPage := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks?page=1&limit=1", projectID), nil)
		reqPage.Header.Set("Authorization", "Bearer "+ownerToken)
		wPage := httptest.NewRecorder()
		router.ServeHTTP(wPage, reqPage)
		_ = json.Unmarshal(wPage.Body.Bytes(), &listRes)
		if len(listRes.Data.Tasks) != 1 || listRes.Data.Total != 2 {
			t.Errorf("expected page size 1 with total 2, got len=%d total=%d", len(listRes.Data.Tasks), listRes.Data.Total)
		}
	})

	// ==========================================
	// 4. Task Detail & Updates
	// ==========================================
	t.Run("GetAndUpdateTask", func(t *testing.T) {
		// GET task detail
		reqGet := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s", task1ID), nil)
		reqGet.Header.Set("Authorization", "Bearer "+memberToken)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)

		if wGet.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for get task, got %d: %s", wGet.Code, wGet.Body.String())
		}
		var getRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wGet.Body.Bytes(), &getRes)
		if getRes.Data.Task.ID.String() != task1ID {
			t.Errorf("expected task ID %s, got %s", task1ID, getRes.Data.Task.ID.String())
		}
		if getRes.Data.Task.Creator == nil || getRes.Data.Task.Creator.Email != ownerEmail {
			t.Errorf("expected populated creator email %s", ownerEmail)
		}

		// PATCH: Update status, priority, and assign to memberID
		newStatus := domain.TaskStatusReview
		newPriority := domain.TaskPriorityUrgent
		updateInput := map[string]interface{}{
			"status":      newStatus,
			"priority":    newPriority,
			"assignee_id": memberID.String(),
		}
		bodyBytes, _ := json.Marshal(updateInput)
		reqPatch := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/tasks/%s", task1ID), bytes.NewReader(bodyBytes))
		reqPatch.Header.Set("Content-Type", "application/json")
		reqPatch.Header.Set("Authorization", "Bearer "+memberToken)
		wPatch := httptest.NewRecorder()
		router.ServeHTTP(wPatch, reqPatch)

		if wPatch.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for update task, got %d: %s", wPatch.Code, wPatch.Body.String())
		}
		var patchRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wPatch.Body.Bytes(), &patchRes)
		if patchRes.Data.Task.Status != domain.TaskStatusReview {
			t.Errorf("expected status review, got %s", patchRes.Data.Task.Status)
		}
		if patchRes.Data.Task.Priority != domain.TaskPriorityUrgent {
			t.Errorf("expected priority urgent, got %s", patchRes.Data.Task.Priority)
		}
		if patchRes.Data.Task.AssigneeID == nil || *patchRes.Data.Task.AssigneeID != memberID {
			t.Errorf("expected assignee %s, got %v", memberID, patchRes.Data.Task.AssigneeID)
		}

		// PATCH: Unassign task (set assignee_id to null)
		unassignInput := map[string]interface{}{
			"assignee_id": nil,
		}
		unassignBytes, _ := json.Marshal(unassignInput)
		reqUnassign := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/tasks/%s", task1ID), bytes.NewReader(unassignBytes))
		reqUnassign.Header.Set("Content-Type", "application/json")
		reqUnassign.Header.Set("Authorization", "Bearer "+ownerToken)
		wUnassign := httptest.NewRecorder()
		router.ServeHTTP(wUnassign, reqUnassign)

		if wUnassign.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for unassigning task, got %d: %s", wUnassign.Code, wUnassign.Body.String())
		}
		var unassignRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wUnassign.Body.Bytes(), &unassignRes)
		if unassignRes.Data.Task.AssigneeID != nil {
			t.Errorf("expected nil assignee_id after unassignment, got %v", unassignRes.Data.Task.AssigneeID)
		}
	})

	// ==========================================
	// 5. Authorization & Project Boundary Isolation
	// ==========================================
	t.Run("Authorization_ProjectBoundaryIsolation", func(t *testing.T) {
		// Non-member (outsideToken): Cannot list, get, create, update, or delete
		reqList := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), nil)
		reqList.Header.Set("Authorization", "Bearer "+outsideToken)
		wList := httptest.NewRecorder()
		router.ServeHTTP(wList, reqList)
		if wList.Code != http.StatusNotFound {
			t.Errorf("expected 404 for non-member task listing, got %d", wList.Code)
		}

		reqGet := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s", task1ID), nil)
		reqGet.Header.Set("Authorization", "Bearer "+outsideToken)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)
		if wGet.Code != http.StatusNotFound {
			t.Errorf("expected 404 for non-member task detail, got %d", wGet.Code)
		}

		// Workspace Admin who is NOT a project member (adminToken):
		// Decision 5: Workspace Admin does NOT bypass project boundary!
		reqAdminList := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), nil)
		reqAdminList.Header.Set("Authorization", "Bearer "+adminToken)
		wAdminList := httptest.NewRecorder()
		router.ServeHTTP(wAdminList, reqAdminList)
		if wAdminList.Code != http.StatusNotFound {
			t.Errorf("Decision 5 VIOLATION: Workspace Admin should receive 404 when not a project member, got %d", wAdminList.Code)
		}

		reqAdminGet := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s", task1ID), nil)
		reqAdminGet.Header.Set("Authorization", "Bearer "+adminToken)
		wAdminGet := httptest.NewRecorder()
		router.ServeHTTP(wAdminGet, reqAdminGet)
		if wAdminGet.Code != http.StatusNotFound {
			t.Errorf("Decision 5 VIOLATION: Workspace Admin should receive 404 for task detail when not a project member, got %d", wAdminGet.Code)
		}

		// Unauthenticated
		reqNoAuth := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s", task1ID), nil)
		wNoAuth := httptest.NewRecorder()
		router.ServeHTTP(wNoAuth, reqNoAuth)
		if wNoAuth.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for unauthenticated request, got %d", wNoAuth.Code)
		}
	})

	// ==========================================
	// 6. Soft Deletion & Audit Trail Retention
	// ==========================================
	t.Run("SoftDeleteTask_PreservesRecords", func(t *testing.T) {
		reqDel := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/tasks/%s", task1ID), nil)
		reqDel.Header.Set("Authorization", "Bearer "+ownerToken)
		wDel := httptest.NewRecorder()
		router.ServeHTTP(wDel, reqDel)

		if wDel.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for soft-deleting task, got %d: %s", wDel.Code, wDel.Body.String())
		}

		// Subsequent GET returns 404
		reqGet := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s", task1ID), nil)
		reqGet.Header.Set("Authorization", "Bearer "+ownerToken)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)
		if wGet.Code != http.StatusNotFound {
			t.Errorf("expected 404 for deleted task, got %d", wGet.Code)
		}

		// Excluded from project task list
		reqList := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), nil)
		reqList.Header.Set("Authorization", "Bearer "+ownerToken)
		wList := httptest.NewRecorder()
		router.ServeHTTP(wList, reqList)
		var listRes struct {
			Data struct {
				Tasks []domain.Task `json:"tasks"`
				Total int64         `json:"total"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wList.Body.Bytes(), &listRes)
		if listRes.Data.Total != 1 || listRes.Data.Tasks[0].ID.String() != task2ID {
			t.Errorf("expected only task2 in active task list, got total=%d", listRes.Data.Total)
		}

		// Direct DB verification: deleted_at is set, row is preserved
		var isDeleted bool
		err := pool.QueryRow(ctx, "SELECT deleted_at IS NOT NULL FROM tasks WHERE id = $1", task1ID).Scan(&isDeleted)
		if err != nil || !isDeleted {
			t.Errorf("expected task to be soft-deleted in DB: %v", err)
		}

		// Direct DB verification: activity logs for task1 remain intact
		var logCount int
		err = pool.QueryRow(ctx, "SELECT count(*) FROM activity_logs WHERE task_id = $1", task1ID).Scan(&logCount)
		if err != nil || logCount == 0 {
			t.Errorf("expected activity logs to be retained for soft-deleted task: %v, count=%d", err, logCount)
		}
	})

	// ==========================================
	// 7. Concurrent Task Creation & Atomic Identifiers
	// ==========================================
	t.Run("ConcurrentTaskCreation_AtomicIdentifierUniqueness", func(t *testing.T) {
		// Create a fresh dedicated project for concurrency testing
		var cProjID string
		err := pool.QueryRow(ctx, `
			INSERT INTO projects (workspace_id, key, name, created_by)
			VALUES ($1, 'SYNC', 'Atomic Identifier Project', $2)
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
			t.Fatalf("failed to add owner to project: %v", err)
		}

		const numWorkers = 15
		var wg sync.WaitGroup
		identifiers := make([]string, numWorkers)
		codes := make([]int, numWorkers)

		for i := 0; i < numWorkers; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()

				tInput, _ := json.Marshal(domain.CreateTaskInput{
					Title: fmt.Sprintf("Concurrent Task %02d", idx),
				})
				req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", cProjID), bytes.NewReader(tInput))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+ownerToken)
				w := httptest.NewRecorder()
				router.ServeHTTP(w, req)

				codes[idx] = w.Code
				if w.Code == http.StatusCreated {
					var res struct {
						Data struct {
							Task domain.Task `json:"task"`
						} `json:"data"`
					}
					_ = json.Unmarshal(w.Body.Bytes(), &res)
					identifiers[idx] = res.Data.Task.Identifier
				}
			}(i)
		}

		wg.Wait()

		// 1. Every single concurrent creation MUST succeed
		for i, code := range codes {
			if code != http.StatusCreated {
				t.Fatalf("worker %d failed with HTTP code %d", i, code)
			}
		}

		// 2. All 15 generated identifiers MUST be unique
		seen := make(map[string]bool)
		for _, idf := range identifiers {
			if seen[idf] {
				t.Fatalf("DUPLICATE IDENTIFIER GENERATED UNDER CONCURRENCY: %s", idf)
			}
			seen[idf] = true
		}

		// 3. Directly verify PostgreSQL state
		var taskCounter int
		err = pool.QueryRow(ctx, "SELECT task_counter FROM projects WHERE id = $1", cProjID).Scan(&taskCounter)
		if err != nil {
			t.Fatalf("failed to query task_counter: %v", err)
		}
		if taskCounter != numWorkers {
			t.Fatalf("expected project task_counter to be exactly %d, found %d", numWorkers, taskCounter)
		}

		var rowCount int
		err = pool.QueryRow(ctx, "SELECT count(*) FROM tasks WHERE project_id = $1", cProjID).Scan(&rowCount)
		if err != nil {
			t.Fatalf("failed to count tasks in DB: %v", err)
		}
		if rowCount != numWorkers {
			t.Fatalf("expected exactly %d tasks in DB, found %d", numWorkers, rowCount)
		}
	})
}

func TestTask_ConcurrencyAndLockOrdering(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

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

	setupProjectWithMember := func(t *testing.T, prefix string) (ownerToken, memberToken string, ownerID, memberID uuid.UUID, wsID, projID string) {
		ts := time.Now().UnixNano()
		ownerEmail := fmt.Sprintf("%s_owner_%d@devflow.local", prefix, ts)
		memberEmail := fmt.Sprintf("%s_member_%d@devflow.local", prefix, ts)

		oID, oToken := createAuthenticatedUser(t, router, ownerEmail, "Password123!", "Owner")
		mID, mToken := createAuthenticatedUser(t, router, memberEmail, "Password123!", "Member")

		// Create workspace
		createWsBody, _ := json.Marshal(domain.CreateWorkspaceInput{
			Name: fmt.Sprintf("%s WS %d", prefix, ts),
		})
		reqWs := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(createWsBody))
		reqWs.Header.Set("Content-Type", "application/json")
		reqWs.Header.Set("Authorization", "Bearer "+oToken)
		wWs := httptest.NewRecorder()
		router.ServeHTTP(wWs, reqWs)
		if wWs.Code != http.StatusCreated {
			t.Fatalf("failed to create workspace: %s", wWs.Body.String())
		}
		var wsRes struct {
			Data struct {
				Workspace domain.WorkspaceResponse `json:"workspace"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wWs.Body.Bytes(), &wsRes)
		workspaceID := wsRes.Data.Workspace.ID.String()

		// Add member to workspace
		addMemberBody, _ := json.Marshal(domain.AddMemberInput{Email: memberEmail, Role: domain.RoleMember})
		reqAddMember := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/members", workspaceID), bytes.NewReader(addMemberBody))
		reqAddMember.Header.Set("Content-Type", "application/json")
		reqAddMember.Header.Set("Authorization", "Bearer "+oToken)
		wAddMember := httptest.NewRecorder()
		router.ServeHTTP(wAddMember, reqAddMember)
		if wAddMember.Code != http.StatusCreated {
			t.Fatalf("failed to add member to workspace: %s", wAddMember.Body.String())
		}

		// Create project
		projKey := fmt.Sprintf("K%d", (ts%9000)+1000)
		createProjBody, _ := json.Marshal(domain.CreateProjectInput{
			Name: fmt.Sprintf("%s Project %d", prefix, ts),
			Key:  &projKey,
		})
		reqProj := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/projects", workspaceID), bytes.NewReader(createProjBody))
		reqProj.Header.Set("Content-Type", "application/json")
		reqProj.Header.Set("Authorization", "Bearer "+oToken)
		wProj := httptest.NewRecorder()
		router.ServeHTTP(wProj, reqProj)
		if wProj.Code != http.StatusCreated {
			t.Fatalf("failed to create project: %s", wProj.Body.String())
		}
		var projRes struct {
			Data struct {
				Project domain.ProjectResponse `json:"project"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wProj.Body.Bytes(), &projRes)
		projectID := projRes.Data.Project.ID.String()

		// Add member to project
		addPMBody, _ := json.Marshal(domain.AddProjectMemberInput{UserID: mID, Role: domain.ProjectRoleMember})
		reqPM := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/members", projectID), bytes.NewReader(addPMBody))
		reqPM.Header.Set("Content-Type", "application/json")
		reqPM.Header.Set("Authorization", "Bearer "+oToken)
		wPM := httptest.NewRecorder()
		router.ServeHTTP(wPM, reqPM)
		if wPM.Code != http.StatusCreated {
			t.Fatalf("failed to add member to project: %s", wPM.Body.String())
		}

		return oToken, mToken, oID, mID, workspaceID, projectID
	}

	// =========================================================================
	// 1. Concurrent UpdateTask assigning to U and RemoveProjectMember removing U
	// =========================================================================
	t.Run("Concurrent_UpdateTaskAssignToU_And_RemoveProjectMemberU", func(t *testing.T) {
		ownerToken, _, _, memberID, _, projectID := setupProjectWithMember(t, "c1")

		// Create an unassigned task
		createTaskBody, _ := json.Marshal(domain.CreateTaskInput{
			Title: "Task for Concurrency Test 1",
		})
		reqTask := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(createTaskBody))
		reqTask.Header.Set("Content-Type", "application/json")
		reqTask.Header.Set("Authorization", "Bearer "+ownerToken)
		wTask := httptest.NewRecorder()
		router.ServeHTTP(wTask, reqTask)
		if wTask.Code != http.StatusCreated {
			t.Fatalf("failed to create initial task: %s", wTask.Body.String())
		}
		var taskRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wTask.Body.Bytes(), &taskRes)
		taskID := taskRes.Data.Task.ID.String()

		// Synchronization barrier for overlapping execution
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)

		var wUpdate *httptest.ResponseRecorder
		var wRemove *httptest.ResponseRecorder

		// Goroutine 1: UpdateTask assigning task to memberID
		go func() {
			defer wg.Done()
			<-start
			updateBody, _ := json.Marshal(map[string]interface{}{
				"assignee_id": memberID.String(),
			})
			req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/tasks/%s", taskID), bytes.NewReader(updateBody))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+ownerToken)
			wUpdate = httptest.NewRecorder()
			router.ServeHTTP(wUpdate, req)
		}()

		// Goroutine 2: RemoveProjectMember removing memberID
		go func() {
			defer wg.Done()
			<-start
			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", projectID, memberID.String()), nil)
			req.Header.Set("Authorization", "Bearer "+ownerToken)
			wRemove = httptest.NewRecorder()
			router.ServeHTTP(wRemove, req)
		}()

		// Fire simultaneously
		close(start)
		wg.Wait()

		// 1. Explicitly check for PostgreSQL 40P01 deadlock
		if strings.Contains(wUpdate.Body.String(), "40P01") || strings.Contains(strings.ToLower(wUpdate.Body.String()), "deadlock") {
			t.Fatalf("DEADLOCK DETECTED (SQLSTATE 40P01) in UpdateTask: %s", wUpdate.Body.String())
		}
		if strings.Contains(wRemove.Body.String(), "40P01") || strings.Contains(strings.ToLower(wRemove.Body.String()), "deadlock") {
			t.Fatalf("DEADLOCK DETECTED (SQLSTATE 40P01) in RemoveProjectMember: %s", wRemove.Body.String())
		}

		// 2. Member removal MUST succeed (200 OK)
		if wRemove.Code != http.StatusOK {
			t.Fatalf("expected member removal 200 OK, got %d: %s", wRemove.Code, wRemove.Body.String())
		}

		// 3. UpdateTask must either succeed (200 OK, serialized before removal) or be rejected (400 Bad Request, serialized after removal)
		if wUpdate.Code != http.StatusOK && wUpdate.Code != http.StatusBadRequest {
			t.Fatalf("expected UpdateTask to return 200 or 400, got %d: %s", wUpdate.Code, wUpdate.Body.String())
		}

		// 4. Assert PostgreSQL Invariants
		// Invariant A: User U is NOT a member of Project P
		var memberCount int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM project_members WHERE project_id = $1 AND user_id = $2", projectID, memberID).Scan(&memberCount)
		if err != nil || memberCount != 0 {
			t.Fatalf("invariant violation: user still present in project_members: err=%v, count=%d", err, memberCount)
		}

		// Invariant B: Task is NOT assigned to U (must be unassigned / NULL)
		var assigneeID *string
		err = pool.QueryRow(ctx, "SELECT assignee_id::text FROM tasks WHERE id = $1", taskID).Scan(&assigneeID)
		if err != nil {
			t.Fatalf("failed to query task assignee: %v", err)
		}
		if assigneeID != nil && *assigneeID == memberID.String() {
			t.Fatalf("invariant violation: task remains assigned to removed user %s", memberID.String())
		}
	})

	// =========================================================================
	// 2. Concurrent UpdateTask modifying assigned task & RemoveProjectMember
	// =========================================================================
	t.Run("Concurrent_UpdateTaskModifyAssignedToU_And_RemoveProjectMemberU", func(t *testing.T) {
		ownerToken, _, _, memberID, _, projectID := setupProjectWithMember(t, "c2")

		// Create a task already assigned to U
		mStr := memberID.String()
		createTaskBody, _ := json.Marshal(domain.CreateTaskInput{
			Title:      "Assigned Task for Concurrency Test 2",
			AssigneeID: &memberID,
		})
		reqTask := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(createTaskBody))
		reqTask.Header.Set("Content-Type", "application/json")
		reqTask.Header.Set("Authorization", "Bearer "+ownerToken)
		wTask := httptest.NewRecorder()
		router.ServeHTTP(wTask, reqTask)
		if wTask.Code != http.StatusCreated {
			t.Fatalf("failed to create assigned task: %s", wTask.Body.String())
		}
		var taskRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wTask.Body.Bytes(), &taskRes)
		taskID := taskRes.Data.Task.ID.String()

		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)

		var wUpdate *httptest.ResponseRecorder
		var wRemove *httptest.ResponseRecorder

		// Goroutine 1: UpdateTask modifying status and title
		go func() {
			defer wg.Done()
			<-start
			updateBody, _ := json.Marshal(map[string]interface{}{
				"title":  "Concurrently Renamed Task",
				"status": "in_progress",
			})
			req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/tasks/%s", taskID), bytes.NewReader(updateBody))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+ownerToken)
			wUpdate = httptest.NewRecorder()
			router.ServeHTTP(wUpdate, req)
		}()

		// Goroutine 2: RemoveProjectMember
		go func() {
			defer wg.Done()
			<-start
			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", projectID, mStr), nil)
			req.Header.Set("Authorization", "Bearer "+ownerToken)
			wRemove = httptest.NewRecorder()
			router.ServeHTTP(wRemove, req)
		}()

		close(start)
		wg.Wait()

		// Deadlock detection
		if strings.Contains(wUpdate.Body.String(), "40P01") || strings.Contains(strings.ToLower(wUpdate.Body.String()), "deadlock") {
			t.Fatalf("DEADLOCK DETECTED (SQLSTATE 40P01) in UpdateTask: %s", wUpdate.Body.String())
		}
		if strings.Contains(wRemove.Body.String(), "40P01") || strings.Contains(strings.ToLower(wRemove.Body.String()), "deadlock") {
			t.Fatalf("DEADLOCK DETECTED (SQLSTATE 40P01) in RemoveProjectMember: %s", wRemove.Body.String())
		}

		if wRemove.Code != http.StatusOK {
			t.Fatalf("expected member removal 200 OK, got %d: %s", wRemove.Code, wRemove.Body.String())
		}
		if wUpdate.Code != http.StatusOK {
			t.Fatalf("expected UpdateTask 200 OK, got %d: %s", wUpdate.Code, wUpdate.Body.String())
		}

		// DB Invariants
		var memberCount int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM project_members WHERE project_id = $1 AND user_id = $2", projectID, memberID).Scan(&memberCount)
		if err != nil || memberCount != 0 {
			t.Fatalf("user still present in project_members: err=%v, count=%d", err, memberCount)
		}

		// Task must be unassigned by removal
		var assigneeID *string
		var status string
		err = pool.QueryRow(ctx, "SELECT assignee_id::text, status FROM tasks WHERE id = $1", taskID).Scan(&assigneeID, &status)
		if err != nil {
			t.Fatalf("failed to query task: %v", err)
		}
		if assigneeID != nil {
			t.Fatalf("expected assignee_id to be NULL after member removal, got %v", *assigneeID)
		}
		if status != "in_progress" {
			t.Fatalf("expected status to be in_progress from update, got %s", status)
		}
	})

	// =========================================================================
	// 3. Concurrent CreateTask with Assignee U & RemoveProjectMember U
	// =========================================================================
	t.Run("Concurrent_CreateTaskWithAssigneeU_And_RemoveProjectMemberU", func(t *testing.T) {
		ownerToken, _, _, memberID, _, projectID := setupProjectWithMember(t, "c3")
		mStr := memberID.String()

		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)

		var wCreate *httptest.ResponseRecorder
		var wRemove *httptest.ResponseRecorder

		// Goroutine 1: CreateTask assigned to U
		go func() {
			defer wg.Done()
			<-start
			createBody, _ := json.Marshal(domain.CreateTaskInput{
				Title:      "Concurrent Creation Task",
				AssigneeID: &memberID,
			})
			req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(createBody))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+ownerToken)
			wCreate = httptest.NewRecorder()
			router.ServeHTTP(wCreate, req)
		}()

		// Goroutine 2: RemoveProjectMember U
		go func() {
			defer wg.Done()
			<-start
			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", projectID, mStr), nil)
			req.Header.Set("Authorization", "Bearer "+ownerToken)
			wRemove = httptest.NewRecorder()
			router.ServeHTTP(wRemove, req)
		}()

		close(start)
		wg.Wait()

		// Deadlock detection
		if strings.Contains(wCreate.Body.String(), "40P01") || strings.Contains(strings.ToLower(wCreate.Body.String()), "deadlock") {
			t.Fatalf("DEADLOCK DETECTED (SQLSTATE 40P01) in CreateTask: %s", wCreate.Body.String())
		}
		if strings.Contains(wRemove.Body.String(), "40P01") || strings.Contains(strings.ToLower(wRemove.Body.String()), "deadlock") {
			t.Fatalf("DEADLOCK DETECTED (SQLSTATE 40P01) in RemoveProjectMember: %s", wRemove.Body.String())
		}

		if wRemove.Code != http.StatusOK {
			t.Fatalf("expected member removal 200 OK, got %d: %s", wRemove.Code, wRemove.Body.String())
		}
		if wCreate.Code != http.StatusCreated && wCreate.Code != http.StatusBadRequest {
			t.Fatalf("expected CreateTask 201 or 400, got %d: %s", wCreate.Code, wCreate.Body.String())
		}

		// DB Invariants
		var memberCount int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM project_members WHERE project_id = $1 AND user_id = $2", projectID, memberID).Scan(&memberCount)
		if err != nil || memberCount != 0 {
			t.Fatalf("user still present in project_members: err=%v, count=%d", err, memberCount)
		}

		// No task must be assigned to U
		var assignedCount int
		err = pool.QueryRow(ctx, "SELECT count(*) FROM tasks WHERE project_id = $1 AND assignee_id = $2", projectID, memberID).Scan(&assignedCount)
		if err != nil || assignedCount != 0 {
			t.Fatalf("invariant violation: task assigned to removed user: %d", assignedCount)
		}

		// Counter matches task rows
		var taskCounter, rowCount int
		_ = pool.QueryRow(ctx, "SELECT task_counter FROM projects WHERE id = $1", projectID).Scan(&taskCounter)
		_ = pool.QueryRow(ctx, "SELECT count(*) FROM tasks WHERE project_id = $1", projectID).Scan(&rowCount)
		if taskCounter != rowCount {
			t.Fatalf("task_counter (%d) does not match row count (%d)", taskCounter, rowCount)
		}
	})

	// =========================================================================
	// 4. Concurrent Updates to the Same Task
	// =========================================================================
	t.Run("Concurrent_UpdatesToSameTask", func(t *testing.T) {
		ownerToken, _, _, _, _, projectID := setupProjectWithMember(t, "c4")

		createTaskBody, _ := json.Marshal(domain.CreateTaskInput{
			Title: "Task for Concurrent Status Updates",
		})
		reqTask := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(createTaskBody))
		reqTask.Header.Set("Content-Type", "application/json")
		reqTask.Header.Set("Authorization", "Bearer "+ownerToken)
		wTask := httptest.NewRecorder()
		router.ServeHTTP(wTask, reqTask)
		var taskRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wTask.Body.Bytes(), &taskRes)
		taskID := taskRes.Data.Task.ID.String()

		const numWorkers = 8
		statuses := []string{"todo", "in_progress", "review", "done"}
		start := make(chan struct{})
		var wg sync.WaitGroup
		codes := make([]int, numWorkers)
		bodies := make([]string, numWorkers)

		for i := 0; i < numWorkers; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				<-start

				status := statuses[idx%len(statuses)]
				updateBody, _ := json.Marshal(map[string]interface{}{
					"title":  fmt.Sprintf("Concurrent Update Title %d", idx),
					"status": status,
				})
				req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/tasks/%s", taskID), bytes.NewReader(updateBody))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", "Bearer "+ownerToken)
				w := httptest.NewRecorder()
				router.ServeHTTP(w, req)

				codes[idx] = w.Code
				bodies[idx] = w.Body.String()
			}(i)
		}

		close(start)
		wg.Wait()

		for i := 0; i < numWorkers; i++ {
			if strings.Contains(bodies[i], "40P01") || strings.Contains(strings.ToLower(bodies[i]), "deadlock") {
				t.Fatalf("worker %d encountered DEADLOCK: %s", i, bodies[i])
			}
			if codes[i] != http.StatusOK {
				t.Fatalf("worker %d failed with code %d: %s", i, codes[i], bodies[i])
			}
		}

		// DB Invariant: Task exists, not deleted, and has a valid status
		var finalStatus, finalTitle string
		err := pool.QueryRow(ctx, "SELECT status, title FROM tasks WHERE id = $1 AND deleted_at IS NULL", taskID).Scan(&finalStatus, &finalTitle)
		if err != nil {
			t.Fatalf("failed to query final task: %v", err)
		}
		if !domain.IsValidTaskStatus(finalStatus) {
			t.Fatalf("invalid final task status: %s", finalStatus)
		}
	})

	// =========================================================================
	// 5. Transaction Rollback after Task Counter Increment
	// =========================================================================
	t.Run("TransactionRollback_AfterTaskCounterIncrement", func(t *testing.T) {
		ownerToken, _, _, _, _, projectID := setupProjectWithMember(t, "c5")
		_ = ownerToken

		// Query initial task_counter from DB
		var initialCounter int
		err := pool.QueryRow(ctx, "SELECT task_counter FROM projects WHERE id = $1", projectID).Scan(&initialCounter)
		if err != nil {
			t.Fatalf("failed to query initial task_counter: %v", err)
		}

		// Begin real transaction
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatalf("failed to begin transaction: %v", err)
		}

		// Increment task counter within transaction
		var incrementedCounter int
		err = tx.QueryRow(ctx, `
			UPDATE projects
			SET task_counter = task_counter + 1, updated_at = now()
			WHERE id = $1
			RETURNING task_counter;
		`, projectID).Scan(&incrementedCounter)
		if err != nil {
			tx.Rollback(ctx)
			t.Fatalf("failed to increment task counter in tx: %v", err)
		}

		if incrementedCounter != initialCounter+1 {
			tx.Rollback(ctx)
			t.Fatalf("expected incremented counter %d, got %d", initialCounter+1, incrementedCounter)
		}

		// Simulate partial failure and rollback
		err = tx.Rollback(ctx)
		if err != nil {
			t.Fatalf("failed to rollback transaction: %v", err)
		}

		// Verify task_counter strictly restored to initial value
		var postRollbackCounter int
		err = pool.QueryRow(ctx, "SELECT task_counter FROM projects WHERE id = $1", projectID).Scan(&postRollbackCounter)
		if err != nil {
			t.Fatalf("failed to query task_counter post-rollback: %v", err)
		}

		if postRollbackCounter != initialCounter {
			t.Fatalf("counter drift detected! Expected %d post-rollback, found %d", initialCounter, postRollbackCounter)
		}
	})
}
