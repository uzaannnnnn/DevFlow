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

func createAuthenticatedUser(t *testing.T, router http.Handler, email, password, name string) (uuid.UUID, string) {
	t.Helper()

	regBody, _ := json.Marshal(domain.RegisterInput{
		Email:    email,
		Password: password,
		Name:     name,
	})
	reqReg := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(regBody))
	reqReg.Header.Set("Content-Type", "application/json")
	wReg := httptest.NewRecorder()
	router.ServeHTTP(wReg, reqReg)
	if wReg.Code != http.StatusCreated {
		t.Fatalf("failed to register user %s: code=%d, body=%s", email, wReg.Code, wReg.Body.String())
	}

	loginBody, _ := json.Marshal(domain.LoginInput{
		Email:    email,
		Password: password,
	})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	reqLogin.Header.Set("Content-Type", "application/json")
	wLogin := httptest.NewRecorder()
	router.ServeHTTP(wLogin, reqLogin)
	if wLogin.Code != http.StatusOK {
		t.Fatalf("failed to login user %s: code=%d, body=%s", email, wLogin.Code, wLogin.Body.String())
	}

	var res struct {
		Data domain.AuthTokens `json:"data"`
	}
	if err := json.Unmarshal(wLogin.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal login response: %v", err)
	}

	return res.Data.User.ID, res.Data.AccessToken
}

func TestWorkspace_ComprehensiveRBACIntegration(t *testing.T) {
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
	viewerEmail := fmt.Sprintf("viewer_%d@devflow.local", ts)
	outsideUserEmail := fmt.Sprintf("outside_%d@devflow.local", ts)

	ownerID, ownerToken := createAuthenticatedUser(t, router, ownerEmail, "Password123!", "Workspace Owner")
	adminID, adminToken := createAuthenticatedUser(t, router, adminEmail, "Password123!", "Workspace Admin")
	memberID, memberToken := createAuthenticatedUser(t, router, memberEmail, "Password123!", "Workspace Member")
	_, viewerToken := createAuthenticatedUser(t, router, viewerEmail, "Password123!", "Workspace Viewer")
	_, outsideToken := createAuthenticatedUser(t, router, outsideUserEmail, "Password123!", "Outside User")

	var workspaceID string

	// ==========================================
	// 1. CREATE WORKSPACE (Automatic Owner Invariant)
	// ==========================================
	expectedWsName := fmt.Sprintf("Acme Corporation %d", ts)
	t.Run("CreateWorkspace_SuccessAndAutomaticOwner", func(t *testing.T) {
		body, _ := json.Marshal(domain.CreateWorkspaceInput{
			Name: expectedWsName,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d. Body: %s", w.Code, w.Body.String())
		}

		var res struct {
			Success bool `json:"success"`
			Data    struct {
				Workspace domain.WorkspaceResponse `json:"workspace"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if res.Data.Workspace.Name != expectedWsName {
			t.Fatalf("expected name '%s', got %s", expectedWsName, res.Data.Workspace.Name)
		}
		if res.Data.Workspace.Role != domain.RoleOwner {
			t.Fatalf("expected creator to automatically have role 'owner', got %s", res.Data.Workspace.Role)
		}
		if res.Data.Workspace.Slug == "" {
			t.Fatalf("expected auto-generated slug to be populated")
		}

		workspaceID = res.Data.Workspace.ID.String()
	})

	// ==========================================
	// 2. LIST WORKSPACES (User Isolation)
	// ==========================================
	t.Run("ListWorkspaces_Isolation", func(t *testing.T) {
		// Owner sees the workspace
		reqOwner := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces", nil)
		reqOwner.Header.Set("Authorization", "Bearer "+ownerToken)
		wOwner := httptest.NewRecorder()
		router.ServeHTTP(wOwner, reqOwner)

		if wOwner.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for owner, got %d", wOwner.Code)
		}

		var resOwner struct {
			Data struct {
				Workspaces []domain.WorkspaceResponse `json:"workspaces"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wOwner.Body.Bytes(), &resOwner)
		if len(resOwner.Data.Workspaces) == 0 {
			t.Fatalf("expected owner to see at least 1 workspace")
		}

		// Outside user sees 0 workspaces (Strict Tenant Isolation)
		reqOutside := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces", nil)
		reqOutside.Header.Set("Authorization", "Bearer "+outsideToken)
		wOutside := httptest.NewRecorder()
		router.ServeHTTP(wOutside, reqOutside)

		var resOutside struct {
			Data struct {
				Workspaces []domain.WorkspaceResponse `json:"workspaces"`
			} `json:"data"`
		}
		_ = json.Unmarshal(wOutside.Body.Bytes(), &resOutside)
		if len(resOutside.Data.Workspaces) != 0 {
			t.Fatalf("SECURITY VIOLATION: outside user sees workspaces they do not belong to! Count: %d", len(resOutside.Data.Workspaces))
		}
	})

	// ==========================================
	// 3. IDOR PREVENTION (Accessing other's workspace)
	// ==========================================
	t.Run("GetWorkspace_IDORPrevention", func(t *testing.T) {
		// Outside user tries to GET Acme workspace details
		req := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+workspaceID, nil)
		req.Header.Set("Authorization", "Bearer "+outsideToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Must withhold resource with 404
		if w.Code != http.StatusNotFound && w.Code != http.StatusForbidden {
			t.Fatalf("IDOR VIOLATION: outside user received code %d instead of 404/403", w.Code)
		}
	})

	// ==========================================
	// 4. ADD MEMBERS (Admin, Member, Viewer)
	// ==========================================
	t.Run("AddMember_Success", func(t *testing.T) {
		// Add Admin
		addAdminBody, _ := json.Marshal(domain.AddMemberInput{
			Email: adminEmail,
			Role:  domain.RoleAdmin,
		})
		reqAdmin := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(addAdminBody))
		reqAdmin.Header.Set("Content-Type", "application/json")
		reqAdmin.Header.Set("Authorization", "Bearer "+ownerToken)
		wAdmin := httptest.NewRecorder()
		router.ServeHTTP(wAdmin, reqAdmin)
		if wAdmin.Code != http.StatusCreated {
			t.Fatalf("failed to add admin: code=%d, body=%s", wAdmin.Code, wAdmin.Body.String())
		}

		// Add Member
		addMemberBody, _ := json.Marshal(domain.AddMemberInput{
			Email: memberEmail,
			Role:  domain.RoleMember,
		})
		reqMember := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(addMemberBody))
		reqMember.Header.Set("Content-Type", "application/json")
		reqMember.Header.Set("Authorization", "Bearer "+ownerToken)
		wMember := httptest.NewRecorder()
		router.ServeHTTP(wMember, reqMember)
		if wMember.Code != http.StatusCreated {
			t.Fatalf("failed to add member: code=%d, body=%s", wMember.Code, wMember.Body.String())
		}

		// Add Viewer
		addViewerBody, _ := json.Marshal(domain.AddMemberInput{
			Email: viewerEmail,
			Role:  domain.RoleViewer,
		})
		reqViewer := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(addViewerBody))
		reqViewer.Header.Set("Content-Type", "application/json")
		reqViewer.Header.Set("Authorization", "Bearer "+ownerToken)
		wViewer := httptest.NewRecorder()
		router.ServeHTTP(wViewer, reqViewer)
		if wViewer.Code != http.StatusCreated {
			t.Fatalf("failed to add viewer: code=%d, body=%s", wViewer.Code, wViewer.Body.String())
		}
	})

	// ==========================================
	// 5. PREVENT DUPLICATE MEMBERSHIP
	// ==========================================
	t.Run("AddMember_DuplicateConflict", func(t *testing.T) {
		body, _ := json.Marshal(domain.AddMemberInput{
			Email: adminEmail,
			Role:  domain.RoleMember,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+ownerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409 Conflict on duplicate membership, got %d", w.Code)
		}
	})

	// ==========================================
	// 6. RBAC: PRIVILEGE ESCALATION PREVENTION
	// ==========================================
	t.Run("RBAC_AdminCannotGrantOwner", func(t *testing.T) {
		// Admin attempts to promote Member to Owner
		body, _ := json.Marshal(domain.UpdateMemberRoleInput{
			Role: domain.RoleOwner,
		})
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, memberID.String()), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("SECURITY VIOLATION: Admin was able to assign Owner role! Code: %d, Body: %s", w.Code, w.Body.String())
		}
	})

	strPtr := func(s string) *string { return &s }

	t.Run("RBAC_AdminCannotDemoteOrRemoveOwner", func(t *testing.T) {
		// Admin attempts to demote Owner to Member
		body, _ := json.Marshal(domain.UpdateMemberRoleInput{
			Role: domain.RoleMember,
		})
		reqDemote := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, ownerID.String()), bytes.NewReader(body))
		reqDemote.Header.Set("Content-Type", "application/json")
		reqDemote.Header.Set("Authorization", "Bearer "+adminToken)
		wDemote := httptest.NewRecorder()
		router.ServeHTTP(wDemote, reqDemote)

		if wDemote.Code != http.StatusForbidden {
			t.Fatalf("SECURITY VIOLATION: Admin was able to demote Owner! Code: %d, Body: %s", wDemote.Code, wDemote.Body.String())
		}

		// Admin attempts to delete Owner
		reqDelete := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, ownerID.String()), nil)
		reqDelete.Header.Set("Authorization", "Bearer "+adminToken)
		wDelete := httptest.NewRecorder()
		router.ServeHTTP(wDelete, reqDelete)

		if wDelete.Code != http.StatusForbidden {
			t.Fatalf("SECURITY VIOLATION: Admin was able to remove Owner! Code: %d, Body: %s", wDelete.Code, wDelete.Body.String())
		}
	})

	// ==========================================
	// 7. RBAC: MEMBER & VIEWER RESTRICTIONS
	// ==========================================
	t.Run("RBAC_MemberCannotManageMembersOrUpdateWorkspace", func(t *testing.T) {
		// Member attempts to update workspace
		bodyUpdate, _ := json.Marshal(domain.UpdateWorkspaceInput{
			Name: strPtr("Hacked by Member"),
		})
		reqUpdate := httptest.NewRequest(http.MethodPatch, "/api/v1/workspaces/"+workspaceID, bytes.NewReader(bodyUpdate))
		reqUpdate.Header.Set("Content-Type", "application/json")
		reqUpdate.Header.Set("Authorization", "Bearer "+memberToken)
		wUpdate := httptest.NewRecorder()
		router.ServeHTTP(wUpdate, reqUpdate)

		if wUpdate.Code != http.StatusForbidden {
			t.Fatalf("RBAC VIOLATION: Member was able to update workspace! Code: %d", wUpdate.Code)
		}

		// Member attempts to add new member
		bodyAdd, _ := json.Marshal(domain.AddMemberInput{
			Email: outsideUserEmail,
			Role:  domain.RoleMember,
		})
		reqAdd := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/"+workspaceID+"/members", bytes.NewReader(bodyAdd))
		reqAdd.Header.Set("Content-Type", "application/json")
		reqAdd.Header.Set("Authorization", "Bearer "+memberToken)
		wAdd := httptest.NewRecorder()
		router.ServeHTTP(wAdd, reqAdd)

		if wAdd.Code != http.StatusForbidden {
			t.Fatalf("RBAC VIOLATION: Member was able to add members! Code: %d", wAdd.Code)
		}
	})

	t.Run("RBAC_ViewerCannotUpdateWorkspaceOrDelete", func(t *testing.T) {
		// Viewer attempts to update workspace
		bodyUpdate, _ := json.Marshal(domain.UpdateWorkspaceInput{
			Name: strPtr("Hacked by Viewer"),
		})
		reqUpdate := httptest.NewRequest(http.MethodPatch, "/api/v1/workspaces/"+workspaceID, bytes.NewReader(bodyUpdate))
		reqUpdate.Header.Set("Content-Type", "application/json")
		reqUpdate.Header.Set("Authorization", "Bearer "+viewerToken)
		wUpdate := httptest.NewRecorder()
		router.ServeHTTP(wUpdate, reqUpdate)

		if wUpdate.Code != http.StatusForbidden {
			t.Fatalf("RBAC VIOLATION: Viewer was able to update workspace! Code: %d", wUpdate.Code)
		}
	})

	t.Run("RBAC_AdminCannotDeleteWorkspace", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/workspaces/"+workspaceID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("RBAC VIOLATION: Admin was able to delete workspace! Code: %d", w.Code)
		}
	})

	// ==========================================
	// 8. OWNER PROTECTION & STANDALONE OWNERSHIP TRANSFER
	// ==========================================
	t.Run("OwnerProtection_LastOwnerCannotLeaveOrDemoteSelf", func(t *testing.T) {
		// Owner attempts to demote self to Member without transferring ownership
		ownerUser, _ := pool.Query(context.Background(), "SELECT owner_id FROM workspaces WHERE id = $1", workspaceID)
		defer ownerUser.Close()
		var ownerUID uuid.UUID
		for ownerUser.Next() {
			_ = ownerUser.Scan(&ownerUID)
		}

		demoteBody, _ := json.Marshal(domain.UpdateMemberRoleInput{
			Role: domain.RoleMember,
		})
		reqDemote := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, ownerUID.String()), bytes.NewReader(demoteBody))
		reqDemote.Header.Set("Content-Type", "application/json")
		reqDemote.Header.Set("Authorization", "Bearer "+ownerToken)
		wDemote := httptest.NewRecorder()
		router.ServeHTTP(wDemote, reqDemote)

		if wDemote.Code != http.StatusBadRequest {
			t.Fatalf("INVARIANT VIOLATION: Owner was able to demote themselves without transferring ownership! Code: %d", wDemote.Code)
		}

		// Owner attempts to delete their own membership (leaving workspace)
		reqLeave := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, ownerUID.String()), nil)
		reqLeave.Header.Set("Authorization", "Bearer "+ownerToken)
		wLeave := httptest.NewRecorder()
		router.ServeHTTP(wLeave, reqLeave)

		if wLeave.Code != http.StatusBadRequest {
			t.Fatalf("INVARIANT VIOLATION: Owner was able to leave workspace without transferring ownership! Code: %d", wLeave.Code)
		}
	})

	t.Run("OwnershipTransfer_ToAdminSuccess", func(t *testing.T) {
		// Owner transfers ownership to existing Admin
		transferBody, _ := json.Marshal(domain.UpdateMemberRoleInput{
			Role: domain.RoleOwner,
		})
		reqTransfer := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, adminID.String()), bytes.NewReader(transferBody))
		reqTransfer.Header.Set("Content-Type", "application/json")
		reqTransfer.Header.Set("Authorization", "Bearer "+ownerToken)
		wTransfer := httptest.NewRecorder()
		router.ServeHTTP(wTransfer, reqTransfer)

		if wTransfer.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on ownership transfer, got %d. Body: %s", wTransfer.Code, wTransfer.Body.String())
		}

		// Verify that admin is now Owner
		var newOwnerUID uuid.UUID
		err := pool.QueryRow(context.Background(), "SELECT owner_id FROM workspaces WHERE id = $1", workspaceID).Scan(&newOwnerUID)
		if err != nil {
			t.Fatalf("failed to query workspace owner_id: %v", err)
		}
		if newOwnerUID != adminID {
			t.Fatalf("expected workspaces.owner_id to be %s, got %s", adminID.String(), newOwnerUID.String())
		}
	})

	// ==========================================
	// 9. REMOVE MEMBER & WORKSPACE DELETION
	// ==========================================
	t.Run("RemoveMember_SuccessByNewOwner", func(t *testing.T) {
		// New Owner (formerly admin) removes Member
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/workspaces/%s/members/%s", workspaceID, memberID.String()), nil)
		req.Header.Set("Authorization", "Bearer "+adminToken) // adminToken is now the Owner!
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on member removal, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	t.Run("DeleteWorkspace_SuccessByOwner", func(t *testing.T) {
		// New Owner deletes (archives) the workspace
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/workspaces/"+workspaceID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on workspace deletion, got %d. Body: %s", w.Code, w.Body.String())
		}

		// Subsequent GET should return 404
		reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+workspaceID, nil)
		reqGet.Header.Set("Authorization", "Bearer "+adminToken)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)

		if wGet.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found for archived workspace, got %d", wGet.Code)
		}
	})
}
