package handlers

import (
	"net/http"

	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
)

// RespondSuccess writes a successful response conforming to the DevFlow envelope format.
func RespondSuccess(c *gin.Context, status int, data any, meta any) {
	if data == nil {
		data = map[string]any{}
	}
	c.JSON(status, domain.SuccessResponse{
		Success: true,
		Data:    data,
		Meta:    meta,
	})
}

// RespondError writes an error response conforming to the DevFlow envelope format.
func RespondError(c *gin.Context, status int, code, message string, details any) {
	if details == nil {
		details = []any{}
	}
	c.JSON(status, domain.ErrorResponse{
		Success: false,
		Error: domain.APIError{
			Code:    code,
			Message: message,
			Details: details,
		},
	})
}

// RespondAppError writes an AppError using its internal status code and details.
func RespondAppError(c *gin.Context, err *domain.AppError) {
	if err == nil {
		RespondError(c, http.StatusInternalServerError, domain.ErrCodeInternal, "An unexpected error occurred", nil)
		return
	}
	RespondError(c, err.HTTPStatus, err.Code, err.Message, err.Details)
}

// NotFoundHandler writes a standard 404 JSON response for unknown routes.
func NotFoundHandler(c *gin.Context) {
	RespondError(c, http.StatusNotFound, domain.ErrCodeNotFound, "The requested resource was not found", nil)
}

// MethodNotAllowedHandler writes a standard 405 JSON response for unsupported methods.
func MethodNotAllowedHandler(c *gin.Context) {
	RespondError(c, http.StatusMethodNotAllowed, domain.ErrCodeForbidden, "HTTP method not allowed for this route", nil)
}
