package handlers

import (
	"errors"
	"net/http"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/middleware"
	"devflow/backend/internal/usecases"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// WorkspaceHandler manages workspace and workspace membership HTTP endpoints.
type WorkspaceHandler struct {
	usecase usecases.WorkspaceUsecase
}

// NewWorkspaceHandler creates a new WorkspaceHandler instance.
func NewWorkspaceHandler(usecase usecases.WorkspaceUsecase) *WorkspaceHandler {
	return &WorkspaceHandler{
		usecase: usecase,
	}
}

// parseUUID parses a UUID parameter from a path string, responding with 400 if invalid.
func parseUUID(c *gin.Context, paramName string) (uuid.UUID, bool) {
	str := c.Param(paramName)
	parsed, err := uuid.Parse(str)
	if err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid ID format: must be a valid UUID", nil)
		return uuid.Nil, false
	}
	return parsed, true
}

// Create handles POST /api/v1/workspaces
func (h *WorkspaceHandler) Create(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	var input domain.CreateWorkspaceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Workspace name is required (1-255 characters)", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	ws, err := h.usecase.CreateWorkspace(c.Request.Context(), userID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to create workspace", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"workspace": ws,
	}, nil)
}

// List handles GET /api/v1/workspaces
func (h *WorkspaceHandler) List(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	workspaces, err := h.usecase.ListUserWorkspaces(c.Request.Context(), userID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list workspaces", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"workspaces": workspaces,
	}, nil)
}

// Get handles GET /api/v1/workspaces/:id
func (h *WorkspaceHandler) Get(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	ws, err := h.usecase.GetWorkspace(c.Request.Context(), userID, wsID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to retrieve workspace", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"workspace": ws,
	}, nil)
}

// Update handles PATCH /api/v1/workspaces/:id
func (h *WorkspaceHandler) Update(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.UpdateWorkspaceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid request payload", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	ws, err := h.usecase.UpdateWorkspace(c.Request.Context(), userID, wsID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to update workspace", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"workspace": ws,
	}, nil)
}

// Delete handles DELETE /api/v1/workspaces/:id
func (h *WorkspaceHandler) Delete(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	if err := h.usecase.DeleteWorkspace(c.Request.Context(), userID, wsID); err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to delete workspace", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Workspace deleted successfully",
	}, nil)
}

// ListMembers handles GET /api/v1/workspaces/:id/members
func (h *WorkspaceHandler) ListMembers(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	members, err := h.usecase.ListMembers(c.Request.Context(), userID, wsID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list workspace members", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"members": members,
	}, nil)
}

// AddMember handles POST /api/v1/workspaces/:id/members
func (h *WorkspaceHandler) AddMember(c *gin.Context) {
	actorID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.AddMemberInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Email and role are required", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	member, err := h.usecase.AddMember(c.Request.Context(), actorID, wsID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to add member", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"member": member,
	}, nil)
}

// UpdateMemberRole handles PATCH /api/v1/workspaces/:id/members/:userId
func (h *WorkspaceHandler) UpdateMemberRole(c *gin.Context) {
	actorID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	targetUserID, ok := parseUUID(c, "userId")
	if !ok {
		return
	}

	var input domain.UpdateMemberRoleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Role is required", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	member, err := h.usecase.UpdateMemberRole(c.Request.Context(), actorID, wsID, targetUserID, input.Role)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to update member role", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"member": member,
	}, nil)
}

// RemoveMember handles DELETE /api/v1/workspaces/:id/members/:userId
func (h *WorkspaceHandler) RemoveMember(c *gin.Context) {
	actorID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	wsID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	targetUserID, ok := parseUUID(c, "userId")
	if !ok {
		return
	}

	if err := h.usecase.RemoveMember(c.Request.Context(), actorID, wsID, targetUserID); err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to remove member", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Member removed successfully",
	}, nil)
}

