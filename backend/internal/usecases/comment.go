package usecases

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CommentUsecase interface {
	CreateComment(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, input domain.CreateCommentInput) (*domain.Comment, error)
	ListComments(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, filter domain.CommentListFilter) ([]*domain.Comment, int64, error)
	UpdateComment(ctx context.Context, actorID uuid.UUID, commentID uuid.UUID, input domain.UpdateCommentInput) (*domain.Comment, error)
	DeleteComment(ctx context.Context, actorID uuid.UUID, commentID uuid.UUID) error
}

type commentUsecase struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

func NewCommentUsecase(pool *pgxpool.Pool, queries *repository.Queries) CommentUsecase {
	return &commentUsecase{
		pool:    pool,
		queries: queries,
	}
}

// CreateComment atomically creates a comment on a task and writes a comment_added activity log.
func (u *commentUsecase) CreateComment(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, input domain.CreateCommentInput) (*domain.Comment, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	pgTaskID := uuidToPgtype(taskID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Preliminary task check (must exist and not be soft-deleted)
	task, err := u.queries.GetTaskByID(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to fetch task", err)
	}
	if task.DeletedAt.Valid {
		return nil, domain.NewNotFoundError("Task not found")
	}

	// 2. Preliminary project membership check (Decision 5 / Project Boundary Isolation)
	_, err = u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: task.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	if u.pool == nil {
		return nil, domain.NewInternalError("Database pool unavailable", nil)
	}

	// 3. Begin Transaction with Lock Hierarchy (§8.8):
	// project_members (FOR KEY SHARE) -> tasks (FOR KEY SHARE) -> comments (INSERT)
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Lock 1: Lock actor's project_members row with FOR KEY SHARE
	_, err = qtx.LockProjectMemberForKeyShare(ctx, repository.LockProjectMemberForKeyShareParams{
		ProjectID: task.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to lock project member", err)
	}

	// Lock 2: Lock task row with FOR KEY SHARE
	lockedTask, err := qtx.LockTaskForKeyShare(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to lock task", err)
	}
	if lockedTask.DeletedAt.Valid || lockedTask.ProjectID != task.ProjectID {
		return nil, domain.NewNotFoundError("Task not found")
	}

	// Step 4: Insert comment
	createdComment, err := qtx.CreateComment(ctx, repository.CreateCommentParams{
		TaskID:   pgTaskID,
		AuthorID: pgActorID,
		Body:     input.Body,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to create comment", err)
	}

	// Step 5: Atomically create activity log (comment_added)
	metaBytes, err := json.Marshal(map[string]interface{}{
		"comment_id":      pgtypeToUUID(createdComment.ID).String(),
		"task_identifier": lockedTask.Identifier,
		"task_title":      lockedTask.Title,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to serialize activity metadata", err)
	}

	_, err = qtx.CreateTaskActivityLog(ctx, repository.CreateTaskActivityLogParams{
		ProjectID: lockedTask.ProjectID,
		TaskID:    pgTaskID,
		ActorID:   pgActorID,
		Action:    domain.ActionCommentAdded,
		Metadata:  metaBytes,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to create activity log", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit transaction", err)
	}

	// Step 6: Fetch author profile for response
	authorUser, err := u.queries.GetUserByID(ctx, pgActorID)
	var authorSummary *domain.UserSummary
	if err == nil {
		var namePtr *string
		if authorUser.Name.Valid {
			n := authorUser.Name.String
			namePtr = &n
		}
		var avatarPtr *string
		if authorUser.AvatarUrl.Valid {
			a := authorUser.AvatarUrl.String
			avatarPtr = &a
		}
		authorSummary = &domain.UserSummary{
			ID:        actorID,
			Email:     authorUser.Email,
			Name:      namePtr,
			AvatarURL: avatarPtr,
		}
	}

	var deletedAtPtr *time.Time
	if createdComment.DeletedAt.Valid {
		t := createdComment.DeletedAt.Time
		deletedAtPtr = &t
	}

	return &domain.Comment{
		ID:        pgtypeToUUID(createdComment.ID),
		TaskID:    taskID,
		AuthorID:  actorID,
		Author:    authorSummary,
		Body:      createdComment.Body,
		CreatedAt: createdComment.CreatedAt.Time,
		UpdatedAt: createdComment.UpdatedAt.Time,
		DeletedAt: deletedAtPtr,
	}, nil
}

// ListComments lists comments for a task ordered chronologically (oldest first).
func (u *commentUsecase) ListComments(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, filter domain.CommentListFilter) ([]*domain.Comment, int64, error) {
	filter.Normalize()

	pgTaskID := uuidToPgtype(taskID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Task check
	task, err := u.queries.GetTaskByID(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, domain.NewNotFoundError("Task not found")
		}
		return nil, 0, domain.NewInternalError("Failed to fetch task", err)
	}
	if task.DeletedAt.Valid {
		return nil, 0, domain.NewNotFoundError("Task not found")
	}

	// 2. Project membership check
	_, err = u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: task.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, domain.NewNotFoundError("Task not found")
		}
		return nil, 0, domain.NewInternalError("Failed to check project membership", err)
	}

	rows, err := u.queries.ListCommentsByTask(ctx, repository.ListCommentsByTaskParams{
		TaskID: pgTaskID,
		Limit:  filter.Limit(),
		Offset: filter.Offset(),
	})
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to list comments", err)
	}

	total, err := u.queries.CountCommentsByTask(ctx, pgTaskID)
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to count comments", err)
	}

	comments := make([]*domain.Comment, len(rows))
	for i, r := range rows {
		var namePtr *string
		if r.AuthorName.Valid {
			n := r.AuthorName.String
			namePtr = &n
		}
		var avatarPtr *string
		if r.AuthorAvatarUrl.Valid {
			a := r.AuthorAvatarUrl.String
			avatarPtr = &a
		}
		var deletedAtPtr *time.Time
		if r.DeletedAt.Valid {
			t := r.DeletedAt.Time
			deletedAtPtr = &t
		}

		comments[i] = &domain.Comment{
			ID:       pgtypeToUUID(r.ID),
			TaskID:   pgtypeToUUID(r.TaskID),
			AuthorID: pgtypeToUUID(r.AuthorID),
			Author: &domain.UserSummary{
				ID:        pgtypeToUUID(r.AuthorID),
				Email:     r.AuthorEmail,
				Name:      namePtr,
				AvatarURL: avatarPtr,
			},
			Body:      r.Body,
			CreatedAt: r.CreatedAt.Time,
			UpdatedAt: r.UpdatedAt.Time,
			DeletedAt: deletedAtPtr,
		}
	}

	return comments, total, nil
}

// UpdateComment edits an existing comment. Only the author may edit their own comment.
func (u *commentUsecase) UpdateComment(ctx context.Context, actorID uuid.UUID, commentID uuid.UUID, input domain.UpdateCommentInput) (*domain.Comment, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	pgCommentID := uuidToPgtype(commentID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Preliminary comment read
	commentRow, err := u.queries.GetCommentByID(ctx, pgCommentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Comment not found")
		}
		return nil, domain.NewInternalError("Failed to fetch comment", err)
	}
	if commentRow.DeletedAt.Valid {
		return nil, domain.NewNotFoundError("Comment not found")
	}

	// 2. Project membership check
	_, err = u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: commentRow.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Comment not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	// 3. Authorship check: Only author can edit own comment (PRD line 78)
	if pgtypeToUUID(commentRow.AuthorID) != actorID {
		return nil, domain.NewForbiddenError("You are not authorized to edit this comment")
	}

	if u.pool == nil {
		return nil, domain.NewInternalError("Database pool unavailable", nil)
	}

	// 4. Begin transaction with Lock Hierarchy (§8.8):
	// project_members (FOR KEY SHARE) -> tasks (FOR KEY SHARE) -> comments (FOR UPDATE)
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Lock 1: Lock actor's project_members row
	_, err = qtx.LockProjectMemberForKeyShare(ctx, repository.LockProjectMemberForKeyShareParams{
		ProjectID: commentRow.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Comment not found")
		}
		return nil, domain.NewInternalError("Failed to lock project member", err)
	}

	// Lock 2: Lock task row
	lockedTask, err := qtx.LockTaskForKeyShare(ctx, commentRow.TaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Comment not found")
		}
		return nil, domain.NewInternalError("Failed to lock task", err)
	}
	if lockedTask.DeletedAt.Valid || lockedTask.ProjectID != commentRow.ProjectID {
		return nil, domain.NewNotFoundError("Comment not found")
	}

	// Lock 3: Lock comment row for update
	lockedComment, err := qtx.GetCommentByIDForUpdate(ctx, pgCommentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Comment not found")
		}
		return nil, domain.NewInternalError("Failed to lock comment", err)
	}
	if lockedComment.DeletedAt.Valid {
		return nil, domain.NewNotFoundError("Comment not found")
	}
	if pgtypeToUUID(lockedComment.AuthorID) != actorID {
		return nil, domain.NewForbiddenError("You are not authorized to edit this comment")
	}

	// Execute Update
	updatedRow, err := qtx.UpdateComment(ctx, repository.UpdateCommentParams{
		ID:   pgCommentID,
		Body: input.Body,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to update comment", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit transaction", err)
	}

	var namePtr *string
	if commentRow.AuthorName.Valid {
		n := commentRow.AuthorName.String
		namePtr = &n
	}
	var avatarPtr *string
	if commentRow.AuthorAvatarUrl.Valid {
		a := commentRow.AuthorAvatarUrl.String
		avatarPtr = &a
	}
	var deletedAtPtr *time.Time
	if updatedRow.DeletedAt.Valid {
		t := updatedRow.DeletedAt.Time
		deletedAtPtr = &t
	}

	return &domain.Comment{
		ID:       pgtypeToUUID(updatedRow.ID),
		TaskID:   pgtypeToUUID(updatedRow.TaskID),
		AuthorID: pgtypeToUUID(updatedRow.AuthorID),
		Author: &domain.UserSummary{
			ID:        pgtypeToUUID(commentRow.AuthorID),
			Email:     commentRow.AuthorEmail,
			Name:      namePtr,
			AvatarURL: avatarPtr,
		},
		Body:      updatedRow.Body,
		CreatedAt: updatedRow.CreatedAt.Time,
		UpdatedAt: updatedRow.UpdatedAt.Time,
		DeletedAt: deletedAtPtr,
	}, nil
}

// DeleteComment soft-deletes a comment. Only the author may delete their own comment.
func (u *commentUsecase) DeleteComment(ctx context.Context, actorID uuid.UUID, commentID uuid.UUID) error {
	pgCommentID := uuidToPgtype(commentID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Preliminary comment read
	commentRow, err := u.queries.GetCommentByID(ctx, pgCommentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Comment not found")
		}
		return domain.NewInternalError("Failed to fetch comment", err)
	}
	if commentRow.DeletedAt.Valid {
		return domain.NewNotFoundError("Comment not found")
	}

	// 2. Project membership check
	_, err = u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: commentRow.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Comment not found")
		}
		return domain.NewInternalError("Failed to check project membership", err)
	}

	// 3. Authorship check: Only author can delete own comment (PRD line 78)
	if pgtypeToUUID(commentRow.AuthorID) != actorID {
		return domain.NewForbiddenError("You are not authorized to delete this comment")
	}

	if u.pool == nil {
		return domain.NewInternalError("Database pool unavailable", nil)
	}

	// 4. Begin transaction with Lock Hierarchy (§8.8):
	// project_members (FOR KEY SHARE) -> tasks (FOR KEY SHARE) -> comments (FOR UPDATE)
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Lock 1: Lock actor's project_members row
	_, err = qtx.LockProjectMemberForKeyShare(ctx, repository.LockProjectMemberForKeyShareParams{
		ProjectID: commentRow.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Comment not found")
		}
		return domain.NewInternalError("Failed to lock project member", err)
	}

	// Lock 2: Lock task row
	lockedTask, err := qtx.LockTaskForKeyShare(ctx, commentRow.TaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Comment not found")
		}
		return domain.NewInternalError("Failed to lock task", err)
	}
	if lockedTask.DeletedAt.Valid || lockedTask.ProjectID != commentRow.ProjectID {
		return domain.NewNotFoundError("Comment not found")
	}

	// Lock 3: Lock comment row for update
	lockedComment, err := qtx.GetCommentByIDForUpdate(ctx, pgCommentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Comment not found")
		}
		return domain.NewInternalError("Failed to lock comment", err)
	}
	if lockedComment.DeletedAt.Valid {
		return domain.NewNotFoundError("Comment not found")
	}
	if pgtypeToUUID(lockedComment.AuthorID) != actorID {
		return domain.NewForbiddenError("You are not authorized to delete this comment")
	}

	// Execute Soft Delete
	_, err = qtx.SoftDeleteComment(ctx, pgCommentID)
	if err != nil {
		return domain.NewInternalError("Failed to soft-delete comment", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.NewInternalError("Failed to commit transaction", err)
	}

	return nil
}
