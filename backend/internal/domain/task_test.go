package domain

import (
	"strings"
	"testing"
)

func TestFormatTaskIdentifier(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		counter  int32
		expected string
	}{
		{
			name:     "counter 1 zero pads to 3 digits",
			key:      "DEV",
			counter:  1,
			expected: "DEV-001",
		},
		{
			name:     "counter 42 zero pads to 3 digits",
			key:      "DEV",
			counter:  42,
			expected: "DEV-042",
		},
		{
			name:     "counter 999 maintains 3 digits",
			key:      "DEV",
			counter:  999,
			expected: "DEV-999",
		},
		{
			name:     "counter 1000 expands without truncation",
			key:      "DEV",
			counter:  1000,
			expected: "DEV-1000",
		},
		{
			name:     "counter 10000 expands without truncation",
			key:      "CORE",
			counter:  10000,
			expected: "CORE-10000",
		},
		{
			name:     "counter at max int32 expands to 10 digits without truncation",
			key:      "PROJ",
			counter:  2147483647,
			expected: "PROJ-2147483647",
		},
		{
			name:     "lowercase key is converted to uppercase",
			key:      "app",
			counter:  7,
			expected: "APP-007",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := FormatTaskIdentifier(tc.key, tc.counter)
			if got != tc.expected {
				t.Errorf("FormatTaskIdentifier(%q, %d) = %q; want %q", tc.key, tc.counter, got, tc.expected)
			}
		})
	}
}

func TestTaskStatusAndPriorityValidation(t *testing.T) {
	validStatuses := []string{"todo", "in_progress", "review", "done", "TODO", "In_Progress"}
	for _, s := range validStatuses {
		if !IsValidTaskStatus(s) {
			t.Errorf("expected IsValidTaskStatus(%q) to be true", s)
		}
	}

	invalidStatuses := []string{"", "pending", "completed", "cancelled", "blocked"}
	for _, s := range invalidStatuses {
		if IsValidTaskStatus(s) {
			t.Errorf("expected IsValidTaskStatus(%q) to be false", s)
		}
	}

	validPriorities := []string{"low", "medium", "high", "urgent", "LOW", "High"}
	for _, p := range validPriorities {
		if !IsValidTaskPriority(p) {
			t.Errorf("expected IsValidTaskPriority(%q) to be true", p)
		}
	}

	invalidPriorities := []string{"", "critical", "none", "standard"}
	for _, p := range invalidPriorities {
		if IsValidTaskPriority(p) {
			t.Errorf("expected IsValidTaskPriority(%q) to be false", p)
		}
	}
}

func TestCreateTaskInputValidation(t *testing.T) {
	t.Run("empty title returns validation error", func(t *testing.T) {
		in := CreateTaskInput{Title: "   "}
		if err := in.Validate(); err == nil {
			t.Errorf("expected error for empty title, got nil")
		}
	})

	t.Run("title exceeding 255 chars returns validation error", func(t *testing.T) {
		in := CreateTaskInput{Title: strings.Repeat("A", 256)}
		if err := in.Validate(); err == nil {
			t.Errorf("expected error for long title, got nil")
		}
	})

	t.Run("invalid status returns validation error", func(t *testing.T) {
		badStatus := "archived"
		in := CreateTaskInput{Title: "Valid Title", Status: &badStatus}
		if err := in.Validate(); err == nil {
			t.Errorf("expected error for bad status, got nil")
		}
	})

	t.Run("invalid priority returns validation error", func(t *testing.T) {
		badPriority := "extreme"
		in := CreateTaskInput{Title: "Valid Title", Priority: &badPriority}
		if err := in.Validate(); err == nil {
			t.Errorf("expected error for bad priority, got nil")
		}
	})

	t.Run("valid input passes", func(t *testing.T) {
		status := TaskStatusInProgress
		priority := TaskPriorityHigh
		in := CreateTaskInput{
			Title:    "Valid Task",
			Status:   &status,
			Priority: &priority,
		}
		if err := in.Validate(); err != nil {
			t.Errorf("expected valid input to pass, got: %v", err)
		}
	})
}

func TestTaskListFilterNormalization(t *testing.T) {
	filter := TaskListFilter{
		Page:     -5,
		PageSize: 500,
	}
	filter.Normalize()

	if filter.Page != 1 {
		t.Errorf("expected Page to normalize to 1, got %d", filter.Page)
	}
	if filter.PageSize != 50 {
		t.Errorf("expected PageSize to normalize to 50, got %d", filter.PageSize)
	}
	if filter.Offset() != 0 {
		t.Errorf("expected Offset to be 0, got %d", filter.Offset())
	}
	if filter.Limit() != 50 {
		t.Errorf("expected Limit to be 50, got %d", filter.Limit())
	}
}
