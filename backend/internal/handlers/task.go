package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/middleware"
	"devflow/backend/internal/usecases"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TaskHandler handles HTTP requests for Task Management.
type TaskHandler struct {
	usecase usecases.TaskUsecase
}

// NewTaskHandler creates a new TaskHandler instance.
func NewTaskHandler(usecase usecases.TaskUsecase) *TaskHandler {
	return &TaskHandler{
		usecase: usecase,
	}
}

// Create handles POST /api/v1/projects/:id/tasks
func (h *TaskHandler) Create(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.CreateTaskInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid task request body", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	task, err := h.usecase.CreateTask(c.Request.Context(), userID, projectID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to create task", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"task": task,
	}, nil)
}

// List handles GET /api/v1/projects/:id/tasks
func (h *TaskHandler) List(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	filter := domain.TaskListFilter{}

	if s := c.Query("status"); s != "" {
		filter.Status = &s
	}
	if p := c.Query("priority"); p != "" {
		filter.Priority = &p
	}
	if q := c.Query("search"); q != "" {
		filter.Search = &q
	}
	if a := c.Query("assignee_id"); a != "" {
		if parsed, err := uuid.Parse(a); err == nil {
			filter.AssigneeID = &parsed
		}
	}
	if pageStr := c.Query("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil {
			filter.Page = page
		}
	}
	if pageSizeStr := c.Query("page_size"); pageSizeStr != "" {
		if pageSize, err := strconv.Atoi(pageSizeStr); err == nil {
			filter.PageSize = pageSize
		}
	} else if limitStr := c.Query("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter.PageSize = limit
		}
	}

	tasks, total, err := h.usecase.ListTasks(c.Request.Context(), userID, projectID, filter)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list tasks", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"tasks":     tasks,
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	}, nil)
}

// Get handles GET /api/v1/tasks/:id
func (h *TaskHandler) Get(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	taskID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	task, err := h.usecase.GetTask(c.Request.Context(), userID, taskID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to get task", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"task": task,
	}, nil)
}

// Update handles PATCH /api/v1/tasks/:id
func (h *TaskHandler) Update(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	taskID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var raw map[string]json.RawMessage
	if err := c.ShouldBindJSON(&raw); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid request body", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	var payload struct {
		Title       *string    `json:"title"`
		Description *string    `json:"description"`
		Status      *string    `json:"status"`
		Priority    *string    `json:"priority"`
		AssigneeID  *uuid.UUID `json:"assignee_id"`
		DueDate     *time.Time `json:"due_date"`
	}

	rawBytes, _ := json.Marshal(raw)
	if err := json.Unmarshal(rawBytes, &payload); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Malformed task update fields", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	_, hasAssignee := raw["assignee_id"]
	_, hasDueDate := raw["due_date"]

	input := domain.UpdateTaskInput{
		Title:       payload.Title,
		Description: payload.Description,
		Status:      payload.Status,
		Priority:    payload.Priority,
		AssigneeID:  payload.AssigneeID,
		DueDate:     payload.DueDate,
		SetAssignee: hasAssignee,
		SetDueDate:  hasDueDate,
	}

	task, err := h.usecase.UpdateTask(c.Request.Context(), userID, taskID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to update task", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"task": task,
	}, nil)
}

// Delete handles DELETE /api/v1/tasks/:id
func (h *TaskHandler) Delete(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	taskID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	err = h.usecase.DeleteTask(c.Request.Context(), userID, taskID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to delete task", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"message": "Task soft-deleted successfully",
	}, nil)
}
