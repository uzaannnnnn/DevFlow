package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Supported Activity Actions
const (
	ActionTaskCreated         = "task_created"
	ActionTaskStatusChanged   = "task_status_changed"
	ActionTaskPriorityChanged = "task_priority_changed"
	ActionTaskAssigned        = "task_assigned"
	ActionTaskUnassigned      = "task_unassigned"
	ActionTaskDueDateChanged  = "task_due_date_changed"
	ActionTaskDeleted         = "task_deleted"
	ActionCommentAdded        = "comment_added"
)

var validActivityActions = map[string]bool{
	ActionTaskCreated:         true,
	ActionTaskStatusChanged:   true,
	ActionTaskPriorityChanged: true,
	ActionTaskAssigned:        true,
	ActionTaskUnassigned:      true,
	ActionTaskDueDateChanged:  true,
	ActionTaskDeleted:         true,
	ActionCommentAdded:        true,
}

// IsValidActivityAction returns true if the action is an approved event type.
func IsValidActivityAction(action string) bool {
	return validActivityActions[action]
}

// Activity represents an audit trail log entry for project and task events.
type Activity struct {
	ID             uuid.UUID              `json:"id"`
	ProjectID      uuid.UUID              `json:"project_id"`
	TaskID         *uuid.UUID             `json:"task_id,omitempty"`
	ActorID        uuid.UUID              `json:"actor_id"`
	Actor          *UserSummary           `json:"actor,omitempty"`
	Action         string                 `json:"action"`
	Metadata       map[string]interface{} `json:"metadata"`
	CreatedAt      time.Time              `json:"created_at"`
	TaskIdentifier *string                `json:"task_identifier,omitempty"`
	TaskTitle      *string                `json:"task_title,omitempty"`
}

// ParseMetadata parses a raw JSON byte slice into an activity metadata map.
func ParseMetadata(raw []byte) (map[string]interface{}, error) {
	if len(raw) == 0 {
		return make(map[string]interface{}), nil
	}
	var res map[string]interface{}
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, err
	}
	return res, nil
}

// ActivityFilter represents pagination parameters for activity listing.
type ActivityFilter struct {
	Page     int `json:"page,omitempty"`
	PageSize int `json:"page_size,omitempty"`
}

// Normalize validates and applies defaults to ActivityFilter.
func (f *ActivityFilter) Normalize() {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}
}

// Offset returns the SQL pagination offset.
func (f *ActivityFilter) Offset() int32 {
	return int32((f.Page - 1) * f.PageSize)
}

// Limit returns the SQL pagination limit.
func (f *ActivityFilter) Limit() int32 {
	return int32(f.PageSize)
}

