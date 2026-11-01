package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"devflow/backend/internal/config"
	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func setupCommentTestEnv(t *testing.T) (*config.Config, http.Handler, string, string, string, string, uuid.UUID, string, uuid.UUID, string, uuid.UUID, string, uuid.UUID, string) {
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
	ownerEmail := fmt.Sprintf("cmt_owner_%d@devflow.local", ts)
	member1Email := fmt.Sprintf("cmt_m1_%d@devflow.local", ts)
	member2Email := fmt.Sprintf("cmt_m2_%d@devflow.local", ts)
	adminEmail := fmt.Sprintf("cmt_wsadmin_%d@devflow.local", ts)
	outsideEmail := fmt.Sprintf("cmt_outside_%d@devflow.local", ts)

	ownerID, ownerToken := createAuthenticatedUser(t, router, ownerEmail, "Password123!", "Comment Owner")
	m1ID, m1Token := createAuthenticatedUser(t, router, member1Email, "Password123!", "Project Member 1")
	m2ID, m2Token := createAuthenticatedUser(t, router, member2Email, "Password123!", "Project Member 2")
	_, adminToken := createAuthenticatedUser(t, router, adminEmail, "Password123!", "Workspace Admin")
	outsideID, outsideToken := createAuthenticatedUser(t, router, outsideEmail, "Password123!", "Outside User")

	// Create workspace
	createWsBody, _ := json.Marshal(domain.CreateWorkspaceInput{
		Name: fmt.Sprintf("Comment WS %d", ts),
	})
	reqWs := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(createWsBody))
	reqWs.Header.Set("Content-Type", "application/json")
	reqWs.Header.Set("Authorization", "Bearer "+ownerToken)
	wWs := httptest.NewRecorder()
	router.ServeHTTP(wWs, reqWs)
	if wWs.Code != http.StatusCreated {
		t.Fatalf("failed to create workspace: %d, %s", wWs.Code, wWs.Body.String())
	}
	var wsRes struct {
		Data struct {
			Workspace domain.WorkspaceResponse `json:"workspace"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wWs.Body.Bytes(), &wsRes)
	workspaceID := wsRes.Data.Workspace.ID.String()

	// Add Members to Workspace
	for _, m := range []struct {
		email string
		role  string
	}{
		{member1Email, domain.RoleMember},
		{member2Email, domain.RoleMember},
		{adminEmail, domain.RoleAdmin},
	} {
		body, _ := json.Marshal(domain.AddMemberInput{Email: m.email, Role: m.role})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/members", workspaceID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}

	// Create Project (Owner automatically added as project owner)
	projKey := fmt.Sprintf("C%d", ts%10000)
	if len(projKey) > 10 {
		projKey = projKey[:10]
	}
	createProjBody, _ := json.Marshal(domain.CreateProjectInput{
		Name: "Comment Project",
		Key:  &projKey,
	})
	reqProj := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/workspaces/%s/projects", workspaceID), bytes.NewReader(createProjBody))
	reqProj.Header.Set("Content-Type", "application/json")
	reqProj.Header.Set("Authorization", "Bearer "+ownerToken)
	wProj := httptest.NewRecorder()
	router.ServeHTTP(wProj, reqProj)
	if wProj.Code != http.StatusCreated {
		t.Fatalf("failed to create project: %d, %s", wProj.Code, wProj.Body.String())
	}
	var projRes struct {
		Data struct {
			Project domain.ProjectResponse `json:"project"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wProj.Body.Bytes(), &projRes)
	projectID := projRes.Data.Project.ID.String()

	// Add Member 1 and Member 2 to Project (Workspace Admin is NOT added to test boundary isolation)
	for _, uid := range []uuid.UUID{m1ID, m2ID} {
		body, _ := json.Marshal(domain.AddProjectMemberInput{UserID: uid, Role: domain.ProjectRoleMember})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/members", projectID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("failed to add project member: %d, %s", w.Code, w.Body.String())
		}
	}

	// Create a Task in Project
	createTaskBody, _ := json.Marshal(domain.CreateTaskInput{
		Title: "Task for Comment Testing",
	})
	reqTask := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(createTaskBody))
	reqTask.Header.Set("Content-Type", "application/json")
	reqTask.Header.Set("Authorization", "Bearer "+m1Token)
	wTask := httptest.NewRecorder()
	router.ServeHTTP(wTask, reqTask)
	if wTask.Code != http.StatusCreated {
		t.Fatalf("failed to create task: %d, %s", wTask.Code, wTask.Body.String())
	}
	var taskRes struct {
		Data struct {
			Task domain.Task `json:"task"`
		} `json:"data"`
	}
	_ = json.Unmarshal(wTask.Body.Bytes(), &taskRes)
	taskID := taskRes.Data.Task.ID.String()

	return cfg, router, workspaceID, projectID, taskID, ownerToken, ownerID, m1Token, m1ID, m2Token, m2ID, adminToken, outsideID, outsideToken
}

func TestComment_ComprehensiveIntegration(t *testing.T) {
	_, router, _, projectID, taskID, _, _, m1Token, m1ID, m2Token, m2ID, adminToken, _, outsideToken := setupCommentTestEnv(t)

	var commentID string

	// 1. Project member creates comment (C2)
	t.Run("CreateComment_Success", func(t *testing.T) {
		body, _ := json.Marshal(domain.CreateCommentInput{Body: "First test comment by Member 1"})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+m1Token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Data struct {
				Comment domain.Comment `json:"comment"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}

		comment := res.Data.Comment
		if comment.Body != "First test comment by Member 1" {
			t.Errorf("expected body %q, got %q", "First test comment by Member 1", comment.Body)
		}
		if comment.AuthorID != m1ID {
			t.Errorf("expected authorID %s, got %s", m1ID, comment.AuthorID)
		}
		if comment.Author == nil || comment.Author.Email == "" {
			t.Errorf("expected author summary populated, got nil or empty")
		}

		commentID = comment.ID.String()
	})

	// 2. Second comment by Member 2
	t.Run("CreateSecondComment_Success", func(t *testing.T) {
		body, _ := json.Marshal(domain.CreateCommentInput{Body: "Second comment by Member 2"})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+m2Token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 3. List comments on task (C1)
	t.Run("ListComments_OrderedAndPaginated", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/comments?page=1&page_size=10", taskID), nil)
		req.Header.Set("Authorization", "Bearer "+m1Token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Data struct {
				Comments []domain.Comment `json:"comments"`
				Total    int64            `json:"total"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}

		if len(res.Data.Comments) != 2 {
			t.Fatalf("expected 2 comments, got %d", len(res.Data.Comments))
		}
		if res.Data.Total != 2 {
			t.Errorf("expected total 2, got %d", res.Data.Total)
		}
		// Ordered chronologically (oldest first)
		if res.Data.Comments[0].Body != "First test comment by Member 1" {
			t.Errorf("expected first comment first, got: %s", res.Data.Comments[0].Body)
		}
		if res.Data.Comments[1].Body != "Second comment by Member 2" {
			t.Errorf("expected second comment second, got: %s", res.Data.Comments[1].Body)
		}
	})

	// 4. Author edits own comment (C3)
	t.Run("AuthorEditsOwnComment_Success", func(t *testing.T) {
		body, _ := json.Marshal(domain.UpdateCommentInput{Body: "Edited first comment"})
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/comments/%s", commentID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+m1Token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var res struct {
			Data struct {
				Comment domain.Comment `json:"comment"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res.Data.Comment.Body != "Edited first comment" {
			t.Errorf("expected edited body, got: %s", res.Data.Comment.Body)
		}
	})

	// 5. Non-author cannot edit comment (403 Forbidden)
	t.Run("NonAuthorCannotEditComment_403", func(t *testing.T) {
		body, _ := json.Marshal(domain.UpdateCommentInput{Body: "Malicious edit attempt"})
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/comments/%s", commentID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+m2Token) // m2 is not author
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for non-author edit, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 6. Non-author cannot delete comment (403 Forbidden)
	t.Run("NonAuthorCannotDeleteComment_403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/comments/%s", commentID), nil)
		req.Header.Set("Authorization", "Bearer "+m2Token) // m2 is not author
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for non-author delete, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 7. Authorization: Workspace Admin who is NOT project member cannot access (404)
	t.Run("WorkspaceAdmin_NonProjectMember_404", func(t *testing.T) {
		// List comments
		reqList := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), nil)
		reqList.Header.Set("Authorization", "Bearer "+adminToken)
		wList := httptest.NewRecorder()
		router.ServeHTTP(wList, reqList)
		if wList.Code != http.StatusNotFound {
			t.Errorf("expected 404 for Workspace Admin listing comments on unauthorized project, got %d", wList.Code)
		}

		// Create comment
		body, _ := json.Marshal(domain.CreateCommentInput{Body: "Admin bypass attempt"})
		reqCreate := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), bytes.NewReader(body))
		reqCreate.Header.Set("Content-Type", "application/json")
		reqCreate.Header.Set("Authorization", "Bearer "+adminToken)
		wCreate := httptest.NewRecorder()
		router.ServeHTTP(wCreate, reqCreate)
		if wCreate.Code != http.StatusNotFound {
			t.Errorf("expected 404 for Workspace Admin creating comment on unauthorized project, got %d", wCreate.Code)
		}
	})

	// 8. Authorization: Outside user receives 404
	t.Run("OutsideUser_404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), nil)
		req.Header.Set("Authorization", "Bearer "+outsideToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Errorf("expected 404 for outside user, got %d", w.Code)
		}
	})

	// 9. Author deletes own comment (C4)
	t.Run("AuthorDeletesOwnComment_Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/comments/%s", commentID), nil)
		req.Header.Set("Authorization", "Bearer "+m1Token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 10. Soft-deleted comment is excluded from list and cannot be re-edited/deleted
	t.Run("SoftDeletedComment_ExcludedAndImmutable", func(t *testing.T) {
		reqList := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), nil)
		reqList.Header.Set("Authorization", "Bearer "+m1Token)
		wList := httptest.NewRecorder()
		router.ServeHTTP(wList, reqList)

		var res struct {
			Data struct {
				Comments []domain.Comment `json:"comments"`
				Total    int64            `json:"total"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wList.Body.Bytes(), &res)
		if res.Data.Total != 1 {
			t.Errorf("expected 1 remaining comment, got %d", res.Data.Total)
		}
		if len(res.Data.Comments) != 1 || res.Data.Comments[0].AuthorID != m2ID {
			t.Errorf("expected only Member 2's comment to remain")
		}

		// Re-editing deleted comment returns 404
		body, _ := json.Marshal(domain.UpdateCommentInput{Body: "Trying to edit deleted comment"})
		reqEdit := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/comments/%s", commentID), bytes.NewReader(body))
		reqEdit.Header.Set("Content-Type", "application/json")
		reqEdit.Header.Set("Authorization", "Bearer "+m1Token)
		wEdit := httptest.NewRecorder()
		router.ServeHTTP(wEdit, reqEdit)
		if wEdit.Code != http.StatusNotFound {
			t.Errorf("expected 404 for editing soft-deleted comment, got %d", wEdit.Code)
		}
	})

	// 11. Soft-deleted task rejects comment creation
	t.Run("SoftDeletedTask_RejectsCommentCreation", func(t *testing.T) {
		// Soft delete task
		reqDel := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/tasks/%s", taskID), nil)
		reqDel.Header.Set("Authorization", "Bearer "+m1Token)
		wDel := httptest.NewRecorder()
		router.ServeHTTP(wDel, reqDel)
		if wDel.Code != http.StatusOK {
			t.Fatalf("failed to soft-delete task: %d", wDel.Code)
		}

		// Attempt to add comment to soft-deleted task
		body, _ := json.Marshal(domain.CreateCommentInput{Body: "Comment on deleted task"})
		reqCreate := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", taskID), bytes.NewReader(body))
		reqCreate.Header.Set("Content-Type", "application/json")
		reqCreate.Header.Set("Authorization", "Bearer "+m2Token)
		wCreate := httptest.NewRecorder()
		router.ServeHTTP(wCreate, reqCreate)
		if wCreate.Code != http.StatusNotFound {
			t.Errorf("expected 404 when commenting on soft-deleted task, got %d: %s", wCreate.Code, wCreate.Body.String())
		}
	})

	// 12. Verify Activity Log atomic insertion (comment_added)
	t.Run("CommentActivityLog_AtomicCreation", func(t *testing.T) {
		pool := getTestDatabasePool(t)
		queries := repository.New(pool)

		// Create a fresh task
		tBody, _ := json.Marshal(domain.CreateTaskInput{Title: "Task with comment log"})
		tReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(tBody))
		tReq.Header.Set("Content-Type", "application/json")
		tReq.Header.Set("Authorization", "Bearer "+m1Token)
		tW := httptest.NewRecorder()
		router.ServeHTTP(tW, tReq)
		var tRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(tW.Body.Bytes(), &tRes)
		freshTaskID := tRes.Data.Task.ID

		// Add comment
		cBody, _ := json.Marshal(domain.CreateCommentInput{Body: "Verifying activity log"})
		cReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", freshTaskID), bytes.NewReader(cBody))
		cReq.Header.Set("Content-Type", "application/json")
		cReq.Header.Set("Authorization", "Bearer "+m1Token)
		cW := httptest.NewRecorder()
		router.ServeHTTP(cW, cReq)
		if cW.Code != http.StatusCreated {
			t.Fatalf("failed to create comment: %d", cW.Code)
		}

		// Check activity logs
		acts, err := queries.ListActivitiesByTask(context.Background(), repository.ListActivitiesByTaskParams{
			TaskID: pgtype.UUID{Bytes: freshTaskID, Valid: true},
			Limit:  10,
			Offset: 0,
		})
		if err != nil {
			t.Fatalf("failed to query activity logs: %v", err)
		}

		foundCommentAdded := false
		for _, a := range acts {
			if a.Action == domain.ActionCommentAdded {
				foundCommentAdded = true
				meta, _ := domain.ParseMetadata(a.Metadata)
				if meta["task_title"] != "Task with comment log" {
					t.Errorf("expected metadata task_title, got %v", meta["task_title"])
				}
				break
			}
		}
		if !foundCommentAdded {
			t.Errorf("expected comment_added activity log to be atomically recorded")
		}
	})
}

func TestComment_ConcurrencyAndLockOrdering(t *testing.T) {
	_, router, _, projectID, _, _, _, m1Token, _, m2Token, _, _, _, _ := setupCommentTestEnv(t)

	// Subtest 1: Concurrent Comment Creation vs Task Soft Deletion
	t.Run("Concurrent_CreateComment_And_SoftDeleteTask", func(t *testing.T) {
		// Create a separate task for this subtest
		tBody, _ := json.Marshal(domain.CreateTaskInput{Title: "Concurrency Task 1"})
		tReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/tasks", projectID), bytes.NewReader(tBody))
		tReq.Header.Set("Content-Type", "application/json")
		tReq.Header.Set("Authorization", "Bearer "+m1Token)
		tW := httptest.NewRecorder()
		router.ServeHTTP(tW, tReq)
		var tRes struct {
			Data struct {
				Task domain.Task `json:"task"`
			} `json:"data"`
		}
		_ = json.Unmarshal(tW.Body.Bytes(), &tRes)
		subTaskID := tRes.Data.Task.ID.String()

		var startBarrier, doneBarrier sync.WaitGroup
		startBarrier.Add(1)
		doneBarrier.Add(2)

		var commentStatusCode, deleteStatusCode int

		// Worker 1: Create Comment
		go func() {
			defer doneBarrier.Done()
			startBarrier.Wait()

			body, _ := json.Marshal(domain.CreateCommentInput{Body: "Concurrent comment attempt"})
			req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", subTaskID), bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+m2Token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			commentStatusCode = w.Code
		}()

		// Worker 2: Delete Task
		go func() {
			defer doneBarrier.Done()
			startBarrier.Wait()

			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/tasks/%s", subTaskID), nil)
			req.Header.Set("Authorization", "Bearer "+m1Token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			deleteStatusCode = w.Code
		}()

		// Launch both workers simultaneously
		startBarrier.Done()
		doneBarrier.Wait()

		// Verify zero deadlocks occurred
		if deleteStatusCode != http.StatusOK {
			t.Errorf("expected delete to return 200 OK, got %d", deleteStatusCode)
		}
		// Comment creation either succeeded before delete (201) or detected delete (404)
		if commentStatusCode != http.StatusCreated && commentStatusCode != http.StatusNotFound {
			t.Errorf("expected comment status to be 201 or 404, got %d", commentStatusCode)
		}
	})

	// Subtest 2: Concurrent Comment Creation vs Project Member Removal
	t.Run("Concurrent_CreateComment_And_RemoveProjectMember", func(t *testing.T) {
		_, subRouter, _, subProjectID, subTaskID, subOwnerToken, _, _, _, subM2Token, subM2ID, _, _, _ := setupCommentTestEnv(t)

		var startBarrier, doneBarrier sync.WaitGroup
		startBarrier.Add(1)
		doneBarrier.Add(2)

		var commentStatusCode, removeMemberStatusCode int
		var removeMemberBody string

		// Worker 1: Member 2 attempts to create comment
		go func() {
			defer doneBarrier.Done()
			startBarrier.Wait()

			body, _ := json.Marshal(domain.CreateCommentInput{Body: "Concurrent comment during member removal"})
			req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", subTaskID), bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+subM2Token)
			w := httptest.NewRecorder()
			subRouter.ServeHTTP(w, req)
			commentStatusCode = w.Code
		}()

		// Worker 2: Owner removes Member 2 from project
		go func() {
			defer doneBarrier.Done()
			startBarrier.Wait()

			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", subProjectID, subM2ID), nil)
			req.Header.Set("Authorization", "Bearer "+subOwnerToken)
			w := httptest.NewRecorder()
			subRouter.ServeHTTP(w, req)
			removeMemberStatusCode = w.Code
			removeMemberBody = w.Body.String()
		}()

		startBarrier.Done()
		doneBarrier.Wait()

		// Verify zero deadlocks occurred
		if removeMemberStatusCode != http.StatusOK {
			t.Errorf("expected remove member to return 200 OK, got %d, body: %s", removeMemberStatusCode, removeMemberBody)
		}
		// Comment creation either succeeded before removal (201) or blocked and saw member removed (404)
		if commentStatusCode != http.StatusCreated && commentStatusCode != http.StatusNotFound {
			t.Errorf("expected comment status to be 201 or 404, got %d", commentStatusCode)
		}
	})

	// Subtest 3: Concurrent Comment Edit vs Project Member Removal
	t.Run("Concurrent_CommentEdit_And_RemoveProjectMember", func(t *testing.T) {
		// Create a separate project and member to isolate this concurrency test
		_, subRouter, _, subProjectID, subTaskID, subOwnerToken, _, _, _, subM2Token, subM2ID, _, _, _ := setupCommentTestEnv(t)

		// Create comment by member 2
		cBody, _ := json.Marshal(domain.CreateCommentInput{Body: "Original comment for concurrent edit"})
		cReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/tasks/%s/comments", subTaskID), bytes.NewReader(cBody))
		cReq.Header.Set("Content-Type", "application/json")
		cReq.Header.Set("Authorization", "Bearer "+subM2Token)
		cW := httptest.NewRecorder()
		subRouter.ServeHTTP(cW, cReq)
		if cW.Code != http.StatusCreated {
			t.Fatalf("failed to create comment: %d", cW.Code)
		}
		var cRes struct {
			Data struct {
				Comment domain.Comment `json:"comment"`
			} `json:"data"`
		}
		_ = json.Unmarshal(cW.Body.Bytes(), &cRes)
		editCommentID := cRes.Data.Comment.ID.String()

		var startBarrier, doneBarrier sync.WaitGroup
		startBarrier.Add(1)
		doneBarrier.Add(2)

		var editStatusCode, removeMemberStatusCode int

		// Worker 1: Member 2 edits comment
		go func() {
			defer doneBarrier.Done()
			startBarrier.Wait()

			body, _ := json.Marshal(domain.UpdateCommentInput{Body: "Concurrently updated text"})
			req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/comments/%s", editCommentID), bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+subM2Token)
			w := httptest.NewRecorder()
			subRouter.ServeHTTP(w, req)
			editStatusCode = w.Code
		}()

		// Worker 2: Owner removes Member 2 from project
		go func() {
			defer doneBarrier.Done()
			startBarrier.Wait()

			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/projects/%s/members/%s", subProjectID, subM2ID), nil)
			req.Header.Set("Authorization", "Bearer "+subOwnerToken)
			w := httptest.NewRecorder()
			subRouter.ServeHTTP(w, req)
			removeMemberStatusCode = w.Code
		}()

		startBarrier.Done()
		doneBarrier.Wait()

		// Verify zero deadlocks occurred
		if removeMemberStatusCode != http.StatusOK {
			t.Errorf("expected remove member to return 200 OK, got %d", removeMemberStatusCode)
		}
		// Edit either succeeded before removal (200) or was blocked and returned 404
		if editStatusCode != http.StatusOK && editStatusCode != http.StatusNotFound {
			t.Errorf("expected edit status to be 200 or 404, got %d", editStatusCode)
		}
	})
}
