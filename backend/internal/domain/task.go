package domain

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Task Statuses
const (
	TaskStatusTodo       = "todo"
	TaskStatusInProgress = "in_progress"
	TaskStatusReview     = "review"
	TaskStatusDone       = "done"
)

// Task Priorities
const (
	TaskPriorityLow    = "low"
	TaskPriorityMedium = "medium"
	TaskPriorityHigh   = "high"
	TaskPriorityUrgent = "urgent"
)

// Valid Task Statuses and Priorities
var validTaskStatuses = map[string]bool{
	TaskStatusTodo:       true,
	TaskStatusInProgress: true,
	TaskStatusReview:     true,
	TaskStatusDone:       true,
}

var validTaskPriorities = map[string]bool{
	TaskPriorityLow:    true,
	TaskPriorityMedium: true,
	TaskPriorityHigh:   true,
	TaskPriorityUrgent: true,
}

// IsValidTaskStatus checks whether status string is valid.
func IsValidTaskStatus(status string) bool {
	return validTaskStatuses[strings.ToLower(strings.TrimSpace(status))]
}

// IsValidTaskPriority checks whether priority string is valid.
func IsValidTaskPriority(priority string) bool {
	return validTaskPriorities[strings.ToLower(strings.TrimSpace(priority))]
}

// FormatTaskIdentifier formats a project-scoped sequential task identifier per Decision 6.
// Pattern: {key}-{LPAD(counter, GREATEST(3, LENGTH(counter)), '0')}, e.g. DEV-001, DEV-999, DEV-1000.
func FormatTaskIdentifier(key string, counter int32) string {
	digits := len(strconv.FormatInt(int64(counter), 10))
	width := 3
	if digits > width {
		width = digits
	}
	return fmt.Sprintf("%s-%0*d", strings.ToUpper(strings.TrimSpace(key)), width, counter)
}

// UserSummary represents minimal user profile information attached to task objects.
type UserSummary struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Name      *string   `json:"name,omitempty"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
}

// Task represents a work item in a project.
type Task struct {
	ID          uuid.UUID    `json:"id"`
	ProjectID   uuid.UUID    `json:"project_id"`
	Identifier  string       `json:"identifier"`
	Title       string       `json:"title"`
	Description *string      `json:"description,omitempty"`
	Status      string       `json:"status"`
	Priority    string       `json:"priority"`
	AssigneeID  *uuid.UUID   `json:"assignee_id,omitempty"`
	Assignee    *UserSummary `json:"assignee,omitempty"`
	DueDate     *time.Time   `json:"due_date,omitempty"`
	CreatedBy   uuid.UUID    `json:"created_by"`
	Creator     *UserSummary `json:"creator,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	DeletedAt   *time.Time   `json:"deleted_at,omitempty"`
}

// CreateTaskInput represents request payload for creating a task.
type CreateTaskInput struct {
	Title       string     `json:"title"`
	Description *string    `json:"description,omitempty"`
	Status      *string    `json:"status,omitempty"`
	Priority    *string    `json:"priority,omitempty"`
	AssigneeID  *uuid.UUID `json:"assignee_id,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// Validate validates CreateTaskInput.
func (in *CreateTaskInput) Validate() error {
	trimmedTitle := strings.TrimSpace(in.Title)
	if trimmedTitle == "" {
		return NewValidationError("Task title is required", map[string]string{
			"title": "Title cannot be empty",
		})
	}
	if len(trimmedTitle) > 255 {
		return NewValidationError("Task title cannot exceed 255 characters", map[string]string{
			"title": "Title exceeds maximum length of 255 characters",
		})
	}

	if in.Status != nil && *in.Status != "" {
		if !IsValidTaskStatus(*in.Status) {
			return NewValidationError("Invalid task status", map[string]string{
				"status": "Must be one of: todo, in_progress, review, done",
			})
		}
	}

	if in.Priority != nil && *in.Priority != "" {
		if !IsValidTaskPriority(*in.Priority) {
			return NewValidationError("Invalid task priority", map[string]string{
				"priority": "Must be one of: low, medium, high, urgent",
			})
		}
	}

	return nil
}

// UpdateTaskInput represents request payload for updating a task.
type UpdateTaskInput struct {
	Title       *string    `json:"title,omitempty"`
	Description *string    `json:"description,omitempty"`
	Status      *string    `json:"status,omitempty"`
	Priority    *string    `json:"priority,omitempty"`
	AssigneeID  *uuid.UUID `json:"assignee_id,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	// Flags to distinguish between omitempty (no change) vs setting to NULL
	SetAssignee bool `json:"-"`
	SetDueDate  bool `json:"-"`
}

// Validate validates UpdateTaskInput.
func (in *UpdateTaskInput) Validate() error {
	if in.Title != nil {
		trimmedTitle := strings.TrimSpace(*in.Title)
		if trimmedTitle == "" {
			return NewValidationError("Task title cannot be empty", map[string]string{
				"title": "Title cannot be empty",
			})
		}
		if len(trimmedTitle) > 255 {
			return NewValidationError("Task title cannot exceed 255 characters", map[string]string{
				"title": "Title exceeds maximum length of 255 characters",
			})
		}
	}

	if in.Status != nil && *in.Status != "" {
		if !IsValidTaskStatus(*in.Status) {
			return NewValidationError("Invalid task status", map[string]string{
				"status": "Must be one of: todo, in_progress, review, done",
			})
		}
	}

	if in.Priority != nil && *in.Priority != "" {
		if !IsValidTaskPriority(*in.Priority) {
			return NewValidationError("Invalid task priority", map[string]string{
				"priority": "Must be one of: low, medium, high, urgent",
			})
		}
	}

	return nil
}

// TaskListFilter represents query filter parameters for listing tasks.
type TaskListFilter struct {
	Status     *string    `json:"status,omitempty"`
	Priority   *string    `json:"priority,omitempty"`
	AssigneeID *uuid.UUID `json:"assignee_id,omitempty"`
	Search     *string    `json:"search,omitempty"`
	Page       int        `json:"page,omitempty"`
	PageSize   int        `json:"page_size,omitempty"`
}

// Normalize validates and applies defaults to TaskListFilter.
func (f *TaskListFilter) Normalize() {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 50
	}
	if f.Status != nil {
		s := strings.TrimSpace(*f.Status)
		if s == "" || !IsValidTaskStatus(s) {
			f.Status = nil
		} else {
			f.Status = &s
		}
	}
	if f.Priority != nil {
		p := strings.TrimSpace(*f.Priority)
		if p == "" || !IsValidTaskPriority(p) {
			f.Priority = nil
		} else {
			f.Priority = &p
		}
	}
	if f.Search != nil {
		s := strings.TrimSpace(*f.Search)
		if s == "" {
			f.Search = nil
		} else {
			f.Search = &s
		}
	}
}

// Offset returns the SQL pagination offset.
func (f *TaskListFilter) Offset() int32 {
	return int32((f.Page - 1) * f.PageSize)
}

// Limit returns the SQL pagination limit.
func (f *TaskListFilter) Limit() int32 {
	return int32(f.PageSize)
}
