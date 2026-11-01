package handlers

import (
	"bytes"
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

func setupActivityTestEnv(t *testing.T) (*config.Config, http.Handler, string, string, string, string, uuid.UUID, string, uuid.UUID, string, string, uuid.UUID, string) {
	pool := getTestDatabasePool(t)

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
	ownerEmail := fmt.Sprintf("act_owner_%d@devflow.local", ts)
	memberEmail := fmt.Sprintf("act_member_%d@devflow.local", ts)
	adminEmail := fmt.Sprintf("act_wsadmin_%d@devflow.local", ts)
	outsideEmail := fmt.Sprintf("act_outside_%d@devflow.local", ts)

	ownerID, ownerToken := createAuthenticatedUser(t, router, ownerEmail, "Password123!", "Activity Owner")
	memberID, memberToken := createAuthenticatedUser(t, router, memberEmail, "Password123!", "Activity Member")
	_, adminToken := createAuthenticatedUser(t, router, adminEmail, "Password123!", "Activity Workspace Admin")
	outsideID, outsideToken := createAuthenticatedUser(t, router, outsideEmail, "Password123!", "Activity Outside User")

	// Create workspace
	createWsBody, _ := json.Marshal(domain.CreateWorkspaceInput{
		Name: fmt.Sprintf("Activity WS %d", ts),
	})
	reqWs := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(createWsBody))
	reqWs.Header.Set("Content-Type", "application/json")
	reqWs.Header.Set("Authorization", "Bearer "+ownerToken)
	wWs := httptest.NewRecorder()
	router.ServeHTTP(wWs, reqWs)
	var wsRes struct {
		Data struct {
			Workspace domain.WorkspaceResponse `json:"workspace"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wWs.Body.Bytes(), &wsRes)
	workspaceID := wsRes.Data.Workspace.ID.String()

	// Add Member and Admin to Workspace
	for _, m := range []struct {
		email string
		role  string
	}{
		{memberEmail, domain.RoleMember},
		{adminEmail, domain.RoleAdmin},
	} {
		body, _ := json.Marshal(domain.AddMemberInput{Email: m.email, Role: m.role})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/members", workspaceID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}

	// Create Project (Owner is added as project owner)
	projKey := fmt.Sprintf("A%d", ts%10000)
	if len(projKey) > 10 {
		projKey = projKey[:10]
	}
	createProjBody, _ := json.Marshal(domain.CreateProjectInput{
		Name: "Activity Project",
		Key:  &projKey,
	})
	reqProj := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/projects", workspaceID), bytes.NewReader(createProjBody))
	reqProj.Header.Set("Content-Type", "application/json")
	reqProj.Header.Set("Authorization", "Bearer "+ownerToken)
	wProj := httptest.NewRecorder()
	router.ServeHTTP(wProj, reqProj)
	var projRes struct {
		Data struct {
			Project domain.ProjectResponse `json:"project"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wProj.Body.Bytes(), &projRes)
	projectID := projRes.Data.Project.ID.String()

	// Add Member to Project (Admin is not added)
	body, _ := json.Marshal(domain.AddProjectMemberInput{UserID: memberID, Role: domain.ProjectRoleMember})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/members", projectID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ownerToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Create Task 1
	t1Body, _ := json.Marshal(domain.CreateTaskInput{Title: "Task 1 for Activity Testing"})
	t1Req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(t1Body))
	t1Req.Header.Set("Content-Type", "application/json")
	t1Req.Header.Set("Authorization", "Bearer "+memberToken)
	t1W := httptest.NewRecorder()
	router.ServeHTTP(t1W, t1Req)
	var t1Res struct {
		Data struct {
			Task domain.Task `json:"task"`
		} `json:"data"`
	}
	_ = json.Unmarshal(t1W.Body.Bytes(), &t1Res)
	task1ID := t1Res.Data.Task.ID.String()

	// Create Task 2
	t2Body, _ := json.Marshal(domain.CreateTaskInput{Title: "Task 2 for Activity Testing"})
	t2Req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(t2Body))
	t2Req.Header.Set("Content-Type", "application/json")
	t2Req.Header.Set("Authorization", "Bearer "+memberToken)
	t2W := httptest.NewRecorder()
	router.ServeHTTP(t2W, t2Req)
	var t2Res struct {
		Data struct {
			Task domain.Task `json:"task"`
		} `json:"data"`
	}
	_ = json.Unmarshal(t2W.Body.Bytes(), &t2Res)
	task2ID := t2Res.Data.Task.ID.String()

	return cfg, router, workspaceID, projectID, task1ID, task2ID, ownerID, ownerToken, memberID, memberToken, adminToken, outsideID, outsideToken
}

func TestActivity_ComprehensiveIntegration(t *testing.T) {
	_, router, _, projectID, task1ID, task2ID, _, _, _, memberToken, adminToken, _, outsideToken := setupActivityTestEnv(t)

	// Update Task 1 Status
	statusUpdate, _ := json.Marshal(domain.UpdateTaskInput{Status: func(s string) *string { return &s }("in_progress")})
	reqStatus := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/tasks/%s", task1ID), bytes.NewReader(statusUpdate))
	reqStatus.Header.Set("Content-Type", "application/json")
	reqStatus.Header.Set("Authorization", "Bearer "+memberToken)
	wStatus := httptest.NewRecorder()
	router.ServeHTTP(wStatus, reqStatus)
	if wStatus.Code != http.StatusOK {
		t.Fatalf("failed to update task status: %d", wStatus.Code)
	}

	// Add Comment to Task 1
	commentBody, _ := json.Marshal(domain.CreateCommentInput{Body: "Comment on Task 1"})
	reqCmt := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", task1ID), bytes.NewReader(commentBody))
	reqCmt.Header.Set("Content-Type", "application/json")
	reqCmt.Header.Set("Authorization", "Bearer "+memberToken)
	wCmt := httptest.NewRecorder()
	router.ServeHTTP(wCmt, reqCmt)
	if wCmt.Code != http.StatusCreated {
		t.Fatalf("failed to create comment: %d", wCmt.Code)
	}

	// 1. List Project Activities (AC1)
	t.Run("ListProjectActivities_Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/activities?page=1&page_size=20", projectID), nil)
		req.Header.Set("Authorization", "Bearer "+memberToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Data struct {
				Activities []domain.Activity `json:"activities"`
				Total      int64             `json:"total"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}

		// At least: task_created (Task 1), task_created (Task 2), task_status_changed (Task 1), comment_added (Task 1)
		if res.Data.Total < 4 {
			t.Errorf("expected at least 4 activities, got %d", res.Data.Total)
		}

		// Verify newest first: first event should be comment_added
		if len(res.Data.Activities) > 0 && res.Data.Activities[0].Action != domain.ActionCommentAdded {
			t.Errorf("expected newest activity to be %s, got %s", domain.ActionCommentAdded, res.Data.Activities[0].Action)
		}

		// Verify actor details populated
		if len(res.Data.Activities) > 0 {
			act := res.Data.Activities[0]
			if act.Actor == nil || act.Actor.Email == "" {
				t.Errorf("expected actor summary populated in activity")
			}
			if act.TaskIdentifier == nil || *act.TaskIdentifier == "" {
				t.Errorf("expected task identifier populated in activity")
			}
		}
	})

	// 2. List Task Activities (scoped to Task 1)
	t.Run("ListTaskActivities_ScopedToTask", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/activity", task1ID), nil)
		req.Header.Set("Authorization", "Bearer "+memberToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Data struct {
				Activities []domain.Activity `json:"activities"`
				Total      int64             `json:"total"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &res)

		for _, act := range res.Data.Activities {
			if act.TaskID == nil || act.TaskID.String() != task1ID {
				t.Errorf("expected all activities to belong to task %s, got %v", task1ID, act.TaskID)
			}
		}
	})

	// 3. Soft-deleted task activities remain accessible in project feed
	t.Run("SoftDeletedTask_ActivitiesPreservedInProjectFeed", func(t *testing.T) {
		// Soft delete Task 2
		reqDel := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/tasks/%s", task2ID), nil)
		reqDel.Header.Set("Authorization", "Bearer "+memberToken)
		wDel := httptest.NewRecorder()
		router.ServeHTTP(wDel, reqDel)
		if wDel.Code != http.StatusOK {
			t.Fatalf("failed to soft-delete task 2: %d", wDel.Code)
		}

		// Project feed still lists Task 2 events (including task_deleted)
		reqProj := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/activities", projectID), nil)
		reqProj.Header.Set("Authorization", "Bearer "+memberToken)
		wProj := httptest.NewRecorder()
		router.ServeHTTP(wProj, reqProj)

		var res struct {
			Data struct {
				Activities []domain.Activity `json:"activities"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wProj.Body.Bytes(), &res)

		foundTask2Activity := false
		for _, act := range res.Data.Activities {
			if act.TaskID != nil && act.TaskID.String() == task2ID {
				foundTask2Activity = true
				break
			}
		}
		if !foundTask2Activity {
			t.Errorf("expected project activities to preserve events from soft-deleted task 2")
		}
	})

	// 4. Authorization: Non-project member and Workspace Admin cannot access project or task activities (404)
	t.Run("NonProjectMember_CannotAccessActivities_404", func(t *testing.T) {
		// Project activities - outside user
		reqProj := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/activities", projectID), nil)
		reqProj.Header.Set("Authorization", "Bearer "+outsideToken)
		wProj := httptest.NewRecorder()
		router.ServeHTTP(wProj, reqProj)
		if wProj.Code != http.StatusNotFound {
			t.Errorf("expected 404 for non-member project activity, got %d", wProj.Code)
		}

		// Task activities - outside user
		reqTask := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/activity", task1ID), nil)
		reqTask.Header.Set("Authorization", "Bearer "+outsideToken)
		wTask := httptest.NewRecorder()
		router.ServeHTTP(wTask, reqTask)
		if wTask.Code != http.StatusNotFound {
			t.Errorf("expected 404 for non-member task activity, got %d", wTask.Code)
		}

		// Decision 5: Workspace Admin who is NOT project member cannot access project activities
		reqAdminProj := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/activities", projectID), nil)
		reqAdminProj.Header.Set("Authorization", "Bearer "+adminToken)
		wAdminProj := httptest.NewRecorder()
		router.ServeHTTP(wAdminProj, reqAdminProj)
		if wAdminProj.Code != http.StatusNotFound {
			t.Errorf("expected 404 for Workspace Admin on non-member project activity, got %d", wAdminProj.Code)
		}

		// Decision 5: Workspace Admin who is NOT project member cannot access task activities
		reqAdminTask := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/activity", task1ID), nil)
		reqAdminTask.Header.Set("Authorization", "Bearer "+adminToken)
		wAdminTask := httptest.NewRecorder()
		router.ServeHTTP(wAdminTask, reqAdminTask)
		if wAdminTask.Code != http.StatusNotFound {
			t.Errorf("expected 404 for Workspace Admin on non-member task activity, got %d", wAdminTask.Code)
		}
	})

	// 5. Unauthenticated access returns 401
	t.Run("UnauthenticatedAccess_401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/activities", projectID), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 Unauthorized, got %d", w.Code)
		}
	})
}
