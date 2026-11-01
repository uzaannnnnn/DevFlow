package domain

import (
	"strings"
	"testing"
)

func TestCreateCommentInput_Validate(t *testing.T) {
	t.Run("valid comment", func(t *testing.T) {
		input := &CreateCommentInput{Body: "This is a valid comment"}
		if err := input.Validate(); err != nil {
			t.Fatalf("expected nil error, got: %v", err)
		}
		if input.Body != "This is a valid comment" {
			t.Errorf("expected trimmed body, got: %s", input.Body)
		}
	})

	t.Run("whitespace trimmed", func(t *testing.T) {
		input := &CreateCommentInput{Body: "   comment with surrounding spaces   "}
		if err := input.Validate(); err != nil {
			t.Fatalf("expected nil error, got: %v", err)
		}
		if input.Body != "comment with surrounding spaces" {
			t.Errorf("expected trimmed body, got: %s", input.Body)
		}
	})

	t.Run("empty comment rejected", func(t *testing.T) {
		input := &CreateCommentInput{Body: ""}
		err := input.Validate()
		if err == nil {
			t.Fatal("expected error for empty body, got nil")
		}
		appErr, ok := err.(*AppError)
		if !ok {
			t.Fatalf("expected *AppError, got: %T", err)
		}
		if appErr.Code != ErrCodeValidation {
			t.Errorf("expected code %s, got: %s", ErrCodeValidation, appErr.Code)
		}
	})

	t.Run("whitespace-only comment rejected", func(t *testing.T) {
		input := &CreateCommentInput{Body: "   \t\n   "}
		err := input.Validate()
		if err == nil {
			t.Fatal("expected error for whitespace-only body, got nil")
		}
		appErr, ok := err.(*AppError)
		if !ok {
			t.Fatalf("expected *AppError, got: %T", err)
		}
		if appErr.Code != ErrCodeValidation {
			t.Errorf("expected code %s, got: %s", ErrCodeValidation, appErr.Code)
		}
	})

	t.Run("exact maximum length (5000 chars) allowed", func(t *testing.T) {
		exact5000 := strings.Repeat("a", 5000)
		input := &CreateCommentInput{Body: exact5000}
		if err := input.Validate(); err != nil {
			t.Fatalf("expected 5000 chars to be valid, got: %v", err)
		}
	})

	t.Run("excessive length (5001 chars) rejected", func(t *testing.T) {
		tooLong := strings.Repeat("a", 5001)
		input := &CreateCommentInput{Body: tooLong}
		err := input.Validate()
		if err == nil {
			t.Fatal("expected error for body > 5000 chars, got nil")
		}
		appErr, ok := err.(*AppError)
		if !ok {
			t.Fatalf("expected *AppError, got: %T", err)
		}
		if appErr.Code != ErrCodeValidation {
			t.Errorf("expected code %s, got: %s", ErrCodeValidation, appErr.Code)
		}
	})
}

func TestUpdateCommentInput_Validate(t *testing.T) {
	t.Run("valid update", func(t *testing.T) {
		input := &UpdateCommentInput{Body: "Updated comment text"}
		if err := input.Validate(); err != nil {
			t.Fatalf("expected nil error, got: %v", err)
		}
		if input.Body != "Updated comment text" {
			t.Errorf("expected trimmed body, got: %s", input.Body)
		}
	})

	t.Run("empty update rejected", func(t *testing.T) {
		input := &UpdateCommentInput{Body: "   "}
		if err := input.Validate(); err == nil {
			t.Fatal("expected error for empty body, got nil")
		}
	})

	t.Run("excessive update rejected", func(t *testing.T) {
		input := &UpdateCommentInput{Body: strings.Repeat("x", 5001)}
		if err := input.Validate(); err == nil {
			t.Fatal("expected error for >5000 chars, got nil")
		}
	})
}

func TestCommentListFilter_Normalize(t *testing.T) {
	t.Run("defaults applied", func(t *testing.T) {
		filter := &CommentListFilter{}
		filter.Normalize()
		if filter.Page != 1 {
			t.Errorf("expected default page 1, got %d", filter.Page)
		}
		if filter.PageSize != 20 {
			t.Errorf("expected default pageSize 20, got %d", filter.PageSize)
		}
		if filter.Offset() != 0 {
			t.Errorf("expected offset 0, got %d", filter.Offset())
		}
		if filter.Limit() != 20 {
			t.Errorf("expected limit 20, got %d", filter.Limit())
		}
	})

	t.Run("negative and excessive page bounds clamped", func(t *testing.T) {
		filter := &CommentListFilter{Page: -5, PageSize: 500}
		filter.Normalize()
		if filter.Page != 1 {
			t.Errorf("expected clamped page 1, got %d", filter.Page)
		}
		if filter.PageSize != 20 {
			t.Errorf("expected clamped pageSize 20, got %d", filter.PageSize)
		}
	})

	t.Run("valid custom pagination preserved", func(t *testing.T) {
		filter := &CommentListFilter{Page: 3, PageSize: 50}
		filter.Normalize()
		if filter.Page != 3 || filter.PageSize != 50 {
			t.Errorf("expected page 3, pageSize 50, got page %d, pageSize %d", filter.Page, filter.PageSize)
		}
		if filter.Offset() != 100 {
			t.Errorf("expected offset 100, got %d", filter.Offset())
		}
		if filter.Limit() != 50 {
			t.Errorf("expected limit 50, got %d", filter.Limit())
		}
	})
}
