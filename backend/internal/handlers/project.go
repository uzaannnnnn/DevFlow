package handlers

import (
	"errors"
	"net/http"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/middleware"
	"devflow/backend/internal/usecases"

	"github.com/gin-gonic/gin"
)

// ProjectHandler handles HTTP requests for the Project module.
type ProjectHandler struct {
	usecase usecases.ProjectUsecase
}

// NewProjectHandler creates a new ProjectHandler instance.
func NewProjectHandler(usecase usecases.ProjectUsecase) *ProjectHandler {
	return &ProjectHandler{
		usecase: usecase,
	}
}

// Create handles POST /api/v1/workspaces/:id/projects
func (h *ProjectHandler) Create(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	workspaceID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.CreateProjectInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Project name is required (1-255 characters)", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	proj, err := h.usecase.CreateProject(c.Request.Context(), userID, workspaceID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to create project", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"project": proj,
	}, nil)
}

// List handles GET /api/v1/workspaces/:id/projects
func (h *ProjectHandler) List(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	workspaceID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var searchPtr *string
	searchQuery := c.Query("search")
	if searchQuery != "" {
		searchPtr = &searchQuery
	}

	projects, err := h.usecase.ListWorkspaceProjects(c.Request.Context(), userID, workspaceID, searchPtr)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list projects", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"projects": projects,
	}, nil)
}

// Get handles GET /api/v1/projects/:id
func (h *ProjectHandler) Get(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	proj, err := h.usecase.GetProject(c.Request.Context(), userID, projectID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to get project", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"project": proj,
	}, nil)
}

// Update handles PATCH /api/v1/projects/:id
func (h *ProjectHandler) Update(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.UpdateProjectInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid request payload", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	proj, err := h.usecase.UpdateProject(c.Request.Context(), userID, projectID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to update project", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"project": proj,
	}, nil)
}

// Archive handles DELETE /api/v1/projects/:id
func (h *ProjectHandler) Archive(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	err = h.usecase.ArchiveProject(c.Request.Context(), userID, projectID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to archive project", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Project archived successfully",
	}, nil)
}

// ListMembers handles GET /api/v1/projects/:id/members
func (h *ProjectHandler) ListMembers(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	members, err := h.usecase.ListProjectMembers(c.Request.Context(), userID, projectID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list project members", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"members": members,
	}, nil)
}

// AddMember handles POST /api/v1/projects/:id/members
func (h *ProjectHandler) AddMember(c *gin.Context) {
	actorID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.AddProjectMemberInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "user_id is required", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	member, err := h.usecase.AddProjectMember(c.Request.Context(), actorID, projectID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to add project member", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"member": member,
	}, nil)
}

// UpdateMemberRole handles PATCH /api/v1/projects/:id/members/:userId
func (h *ProjectHandler) UpdateMemberRole(c *gin.Context) {
	actorID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	targetUserID, ok := parseUUID(c, "userId")
	if !ok {
		return
	}

	var input domain.UpdateProjectMemberRoleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "role is required", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	member, err := h.usecase.UpdateProjectMemberRole(c.Request.Context(), actorID, projectID, targetUserID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to update project member role", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"member": member,
	}, nil)
}

// RemoveMember handles DELETE /api/v1/projects/:id/members/:userId
func (h *ProjectHandler) RemoveMember(c *gin.Context) {
	actorID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	targetUserID, ok := parseUUID(c, "userId")
	if !ok {
		return
	}

	err = h.usecase.RemoveProjectMember(c.Request.Context(), actorID, projectID, targetUserID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to remove project member", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Member removed from project successfully",
	}, nil)
}
