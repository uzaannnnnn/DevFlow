package domain

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	MaxCommentBodyLength = 5000
)

// Comment represents a message on a task.
type Comment struct {
	ID        uuid.UUID    `json:"id"`
	TaskID    uuid.UUID    `json:"task_id"`
	AuthorID  uuid.UUID    `json:"author_id"`
	Author    *UserSummary `json:"author,omitempty"`
	Body      string       `json:"body"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
	DeletedAt *time.Time   `json:"deleted_at,omitempty"`
}

// CreateCommentInput represents the request payload to create a new comment.
type CreateCommentInput struct {
	Body string `json:"body"`
}

// Validate validates CreateCommentInput.
func (in *CreateCommentInput) Validate() error {
	trimmed := strings.TrimSpace(in.Body)
	if trimmed == "" {
		return NewValidationError("Comment body is required", map[string]string{
			"body": "Body cannot be empty",
		})
	}
	if len(trimmed) > MaxCommentBodyLength {
		return NewValidationError("Comment body exceeds maximum length", map[string]string{
			"body": "Body cannot exceed 5000 characters",
		})
	}
	in.Body = trimmed
	return nil
}

// UpdateCommentInput represents the request payload to edit a comment.
type UpdateCommentInput struct {
	Body string `json:"body"`
}

// Validate validates UpdateCommentInput.
func (in *UpdateCommentInput) Validate() error {
	trimmed := strings.TrimSpace(in.Body)
	if trimmed == "" {
		return NewValidationError("Comment body cannot be empty", map[string]string{
			"body": "Body cannot be empty",
		})
	}
	if len(trimmed) > MaxCommentBodyLength {
		return NewValidationError("Comment body exceeds maximum length", map[string]string{
			"body": "Body cannot exceed 5000 characters",
		})
	}
	in.Body = trimmed
	return nil
}

// CommentListFilter represents query filter parameters for listing comments.
type CommentListFilter struct {
	Page     int `json:"page,omitempty"`
	PageSize int `json:"page_size,omitempty"`
}

// Normalize validates and applies defaults to CommentListFilter.
func (f *CommentListFilter) Normalize() {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}
}

// Offset returns the SQL pagination offset.
func (f *CommentListFilter) Offset() int32 {
	return int32((f.Page - 1) * f.PageSize)
}

// Limit returns the SQL pagination limit.
func (f *CommentListFilter) Limit() int32 {
	return int32(f.PageSize)
}

