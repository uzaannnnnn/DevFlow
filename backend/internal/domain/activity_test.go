package domain

import (
	"encoding/json"
	"testing"
)

func TestActivity_Actions(t *testing.T) {
	validActions := []string{
		ActionTaskCreated,
		ActionTaskStatusChanged,
		ActionTaskPriorityChanged,
		ActionTaskAssigned,
		ActionTaskUnassigned,
		ActionTaskDueDateChanged,
		ActionTaskDeleted,
		ActionCommentAdded,
	}

	for _, action := range validActions {
		if !IsValidActivityAction(action) {
			t.Errorf("expected %s to be valid action", action)
		}
	}

	invalidActions := []string{"", "invalid_action", "task_updated", "project_destroyed"}
	for _, action := range invalidActions {
		if IsValidActivityAction(action) {
			t.Errorf("expected %s to be invalid action", action)
		}
	}
}

func TestActivity_MetadataParsing(t *testing.T) {
	t.Run("valid json metadata", func(t *testing.T) {
		raw := []byte(`{"task_identifier":"DEV-001","old_status":"todo","new_status":"in_progress"}`)
		m, err := ParseMetadata(raw)
		if err != nil {
			t.Fatalf("expected nil error, got: %v", err)
		}
		if m["task_identifier"] != "DEV-001" {
			t.Errorf("expected DEV-001, got %v", m["task_identifier"])
		}
		if m["old_status"] != "todo" || m["new_status"] != "in_progress" {
			t.Errorf("unexpected status values: %v", m)
		}
	})

	t.Run("empty bytes returns empty map", func(t *testing.T) {
		m, err := ParseMetadata([]byte{})
		if err != nil {
			t.Fatalf("expected nil error, got: %v", err)
		}
		if m == nil || len(m) != 0 {
			t.Errorf("expected empty map, got: %v", m)
		}
	})

	t.Run("invalid json returns error", func(t *testing.T) {
		_, err := ParseMetadata([]byte(`{not-json`))
		if err == nil {
			t.Fatal("expected error on invalid json, got nil")
		}
	})
}

func TestActivityFilter_Normalize(t *testing.T) {
	t.Run("defaults applied", func(t *testing.T) {
		filter := &ActivityFilter{}
		filter.Normalize()
		if filter.Page != 1 || filter.PageSize != 20 {
			t.Errorf("expected page 1, pageSize 20, got page %d, pageSize %d", filter.Page, filter.PageSize)
		}
		if filter.Offset() != 0 || filter.Limit() != 20 {
			t.Errorf("expected offset 0, limit 20, got offset %d, limit %d", filter.Offset(), filter.Limit())
		}
	})

	t.Run("bounds clamped", func(t *testing.T) {
		filter := &ActivityFilter{Page: -1, PageSize: 500}
		filter.Normalize()
		if filter.Page != 1 || filter.PageSize != 20 {
			t.Errorf("expected clamped page 1, pageSize 20, got page %d, pageSize %d", filter.Page, filter.PageSize)
		}
	})

	t.Run("custom values preserved", func(t *testing.T) {
		filter := &ActivityFilter{Page: 2, PageSize: 50}
		filter.Normalize()
		if filter.Page != 2 || filter.PageSize != 50 {
			t.Errorf("expected page 2, pageSize 50, got page %d, pageSize %d", filter.Page, filter.PageSize)
		}
		if filter.Offset() != 50 || filter.Limit() != 50 {
			t.Errorf("expected offset 50, limit 50, got offset %d, limit %d", filter.Offset(), filter.Limit())
		}
	})
}

func TestActivity_Serialization(t *testing.T) {
	activity := Activity{
		Action: ActionTaskStatusChanged,
		Metadata: map[string]interface{}{
			"task_identifier": "PROJ-123",
			"old_status":      "todo",
			"new_status":      "in_progress",
		},
	}

	bytes, err := json.Marshal(activity)
	if err != nil {
		t.Fatalf("failed to marshal activity: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		t.Fatalf("failed to unmarshal activity json: %v", err)
	}

	if parsed["action"] != ActionTaskStatusChanged {
		t.Errorf("expected action %s, got %v", ActionTaskStatusChanged, parsed["action"])
	}
}

