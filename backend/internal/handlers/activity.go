package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/middleware"
	"devflow/backend/internal/usecases"

	"github.com/gin-gonic/gin"
)

// ActivityHandler handles HTTP requests for activity logs and feeds.
type ActivityHandler struct {
	usecase usecases.ActivityUsecase
}

func NewActivityHandler(usecase usecases.ActivityUsecase) *ActivityHandler {
	return &ActivityHandler{
		usecase: usecase,
	}
}

// ListProject handles GET /api/v1/projects/:id/activities
func (h *ActivityHandler) ListProject(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	projectID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var filter domain.ActivityFilter
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

	activities, total, err := h.usecase.ListProjectActivities(c.Request.Context(), userID, projectID, filter)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list project activities", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"activities": activities,
		"total":      total,
		"page":       filter.Page,
		"page_size":  filter.PageSize,
	}, gin.H{
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	})
}

// ListTask handles GET /api/v1/tasks/:id/activity
func (h *ActivityHandler) ListTask(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	taskID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var filter domain.ActivityFilter
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

	activities, total, err := h.usecase.ListTaskActivities(c.Request.Context(), userID, taskID, filter)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list task activities", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"activities": activities,
		"total":      total,
		"page":       filter.Page,
		"page_size":  filter.PageSize,
	}, gin.H{
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	})
}

