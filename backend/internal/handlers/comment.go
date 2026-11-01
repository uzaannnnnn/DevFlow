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

// CommentHandler handles HTTP endpoints for task comments.
type CommentHandler struct {
	usecase usecases.CommentUsecase
}

func NewCommentHandler(usecase usecases.CommentUsecase) *CommentHandler {
	return &CommentHandler{
		usecase: usecase,
	}
}

// Create handles POST /api/v1/tasks/:id/comments
func (h *CommentHandler) Create(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	taskID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.CreateCommentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid request body", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	comment, err := h.usecase.CreateComment(c.Request.Context(), userID, taskID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to create comment", nil)
		return
	}

	RespondSuccess(c, http.StatusCreated, gin.H{
		"comment": comment,
	}, nil)
}

// List handles GET /api/v1/tasks/:id/comments
func (h *CommentHandler) List(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	taskID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var filter domain.CommentListFilter
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

	comments, total, err := h.usecase.ListComments(c.Request.Context(), userID, taskID, filter)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to list comments", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"comments":  comments,
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	}, gin.H{
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	})
}

// Update handles PATCH /api/v1/comments/:id
func (h *CommentHandler) Update(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	commentID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	var input domain.UpdateCommentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		RespondError(c, http.StatusBadRequest, domain.ErrCodeValidation, "Invalid request body", []domain.APIErrorDetail{
			{Message: err.Error()},
		})
		return
	}

	comment, err := h.usecase.UpdateComment(c.Request.Context(), userID, commentID, input)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to update comment", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, gin.H{
		"comment": comment,
	}, nil)
}

// Delete handles DELETE /api/v1/comments/:id
func (h *CommentHandler) Delete(c *gin.Context) {
	userID, err := middleware.GetAuthenticatedUserID(c)
	if err != nil {
		RespondError(c, http.StatusUnauthorized, domain.ErrCodeUnauthorized, "Authentication required", nil)
		return
	}

	commentID, ok := parseUUID(c, "id")
	if !ok {
		return
	}

	if err := h.usecase.DeleteComment(c.Request.Context(), userID, commentID); err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) {
			RespondAppError(c, appErr)
			return
		}
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "Failed to delete comment", nil)
		return
	}

	RespondSuccess(c, http.StatusOK, nil, nil)
}

