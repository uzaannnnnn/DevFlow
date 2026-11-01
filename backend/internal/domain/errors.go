package domain

import (
	"fmt"
	"net/http"
)

// Standard Error Codes per API_SPECIFICATION.md §2
const (
	ErrCodeValidation      = "VALIDATION_ERROR"
	ErrCodeUnauthorized    = "UNAUTHORIZED"
	ErrCodeForbidden       = "FORBIDDEN"
	ErrCodeNotFound        = "NOT_FOUND"
	ErrCodeConflict        = "CONFLICT"
	ErrCodeUnprocessable   = "UNPROCESSABLE"
	ErrCodeTooManyRequests = "TOO_MANY_REQUESTS"
	ErrCodeInternal        = "INTERNAL_ERROR"
)

// APIErrorDetail represents an individual validation or field-level detail.
type APIErrorDetail struct {
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
}

// APIError represents the error object inside the DevFlow response envelope.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details"`
}

// ErrorResponse represents the top-level error response envelope per API_SPECIFICATION.md §1.
type ErrorResponse struct {
	Success bool     `json:"success"`
	Error   APIError `json:"error"`
}

// SuccessResponse represents the top-level success response envelope per API_SPECIFICATION.md §1.
type SuccessResponse struct {
	Success bool `json:"success"`
	Data    any  `json:"data"`
	Meta    any  `json:"meta"`
}

// AppError is an application-level domain error that maps cleanly to HTTP status codes.
type AppError struct {
	HTTPStatus int
	Code       string
	Message    string
	Details    any
	Err        error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// Helper constructors for domain errors

func NewValidationError(message string, details any) *AppError {
	if message == "" {
		message = "Request validation failed"
	}
	if details == nil {
		details = []any{}
	}
	return &AppError{
		HTTPStatus: http.StatusBadRequest,
		Code:       ErrCodeValidation,
		Message:    message,
		Details:    details,
	}
}

func NewUnauthorizedError(message string) *AppError {
	if message == "" {
		message = "Authentication required"
	}
	return &AppError{
		HTTPStatus: http.StatusUnauthorized,
		Code:       ErrCodeUnauthorized,
		Message:    message,
		Details:    []any{},
	}
}

func NewForbiddenError(message string) *AppError {
	if message == "" {
		message = "Access forbidden"
	}
	return &AppError{
		HTTPStatus: http.StatusForbidden,
		Code:       ErrCodeForbidden,
		Message:    message,
		Details:    []any{},
	}
}

func NewNotFoundError(message string) *AppError {
	if message == "" {
		message = "Resource not found"
	}
	return &AppError{
		HTTPStatus: http.StatusNotFound,
		Code:       ErrCodeNotFound,
		Message:    message,
		Details:    []any{},
	}
}

func NewConflictError(message string) *AppError {
	if message == "" {
		message = "Resource conflict"
	}
	return &AppError{
		HTTPStatus: http.StatusConflict,
		Code:       ErrCodeConflict,
		Message:    message,
		Details:    []any{},
	}
}

func NewUnprocessableError(message string) *AppError {
	if message == "" {
		message = "Business rule violation"
	}
	return &AppError{
		HTTPStatus: http.StatusUnprocessableEntity,
		Code:       ErrCodeUnprocessable,
		Message:    message,
		Details:    []any{},
	}
}

func NewRateLimitError(message string) *AppError {
	if message == "" {
		message = "Rate limit exceeded"
	}
	return &AppError{
		HTTPStatus: http.StatusTooManyRequests,
		Code:       ErrCodeTooManyRequests,
		Message:    message,
		Details:    []any{},
	}
}

func NewInternalError(message string, underlyingErr ...error) *AppError {
	if message == "" {
		message = "An unexpected error occurred"
	}
	var err error
	if len(underlyingErr) > 0 {
		err = underlyingErr[0]
	}
	return &AppError{
		HTTPStatus: http.StatusInternalServerError,
		Code:       ErrCodeInternal,
		Message:    message,
		Details:    []any{},
		Err:        err,
	}
}
