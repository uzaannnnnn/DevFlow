package usecases

import (
	"context"
	"errors"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ActivityUsecase interface {
	ListProjectActivities(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, filter domain.ActivityFilter) ([]*domain.Activity, int64, error)
	ListTaskActivities(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, filter domain.ActivityFilter) ([]*domain.Activity, int64, error)
}

type activityUsecase struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

func NewActivityUsecase(pool *pgxpool.Pool, queries *repository.Queries) ActivityUsecase {
	return &activityUsecase{
		pool:    pool,
		queries: queries,
	}
}

// ListProjectActivities lists activities for an entire project, including historical records for soft-deleted tasks.
func (u *activityUsecase) ListProjectActivities(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, filter domain.ActivityFilter) ([]*domain.Activity, int64, error) {
	filter.Normalize()

	pgProjectID := uuidToPgtype(projectID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Verify project exists and caller is a project member (Decision 5)
	_, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, domain.NewNotFoundError("Project not found")
		}
		return nil, 0, domain.NewInternalError("Failed to check project membership", err)
	}

	rows, err := u.queries.ListActivitiesByProject(ctx, repository.ListActivitiesByProjectParams{
		ProjectID: pgProjectID,
		Limit:     filter.Limit(),
		Offset:    filter.Offset(),
	})
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to list project activities", err)
	}

	total, err := u.queries.CountActivitiesByProject(ctx, pgProjectID)
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to count project activities", err)
	}

	activities := make([]*domain.Activity, len(rows))
	for i, r := range rows {
		meta, _ := domain.ParseMetadata(r.Metadata)

		var taskIDPtr *uuid.UUID
		if r.TaskID.Valid {
			tid := pgtypeToUUID(r.TaskID)
			taskIDPtr = &tid
		}

		var namePtr *string
		if r.ActorName.Valid {
			n := r.ActorName.String
			namePtr = &n
		}
		var avatarPtr *string
		if r.ActorAvatarUrl.Valid {
			a := r.ActorAvatarUrl.String
			avatarPtr = &a
		}

		var taskIdentifierPtr *string
		if r.TaskIdentifier.Valid {
			ti := r.TaskIdentifier.String
			taskIdentifierPtr = &ti
		}
		var taskTitlePtr *string
		if r.TaskTitle.Valid {
			tt := r.TaskTitle.String
			taskTitlePtr = &tt
		}

		activities[i] = &domain.Activity{
			ID:        pgtypeToUUID(r.ID),
			ProjectID: pgtypeToUUID(r.ProjectID),
			TaskID:    taskIDPtr,
			ActorID:   pgtypeToUUID(r.ActorID),
			Actor: &domain.UserSummary{
				ID:        pgtypeToUUID(r.ActorID),
				Email:     r.ActorEmail,
				Name:      namePtr,
				AvatarURL: avatarPtr,
			},
			Action:         r.Action,
			Metadata:       meta,
			CreatedAt:      r.CreatedAt.Time,
			TaskIdentifier: taskIdentifierPtr,
			TaskTitle:      taskTitlePtr,
		}
	}

	return activities, total, nil
}

// ListTaskActivities lists activities specifically associated with a single task.
func (u *activityUsecase) ListTaskActivities(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, filter domain.ActivityFilter) ([]*domain.Activity, int64, error) {
	filter.Normalize()

	pgTaskID := uuidToPgtype(taskID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Verify task exists (must not be soft-deleted for direct task history lookup)
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

	// 2. Verify caller is a project member
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

	rows, err := u.queries.ListActivitiesByTask(ctx, repository.ListActivitiesByTaskParams{
		TaskID: pgTaskID,
		Limit:  filter.Limit(),
		Offset: filter.Offset(),
	})
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to list task activities", err)
	}

	total, err := u.queries.CountActivitiesByTask(ctx, pgTaskID)
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to count task activities", err)
	}

	activities := make([]*domain.Activity, len(rows))
	for i, r := range rows {
		meta, _ := domain.ParseMetadata(r.Metadata)

		taskID := pgtypeToUUID(r.TaskID)
		taskIDPtr := &taskID

		var namePtr *string
		if r.ActorName.Valid {
			n := r.ActorName.String
			namePtr = &n
		}
		var avatarPtr *string
		if r.ActorAvatarUrl.Valid {
			a := r.ActorAvatarUrl.String
			avatarPtr = &a
		}

		taskIdentifier := r.TaskIdentifier
		taskTitle := r.TaskTitle
		taskIdentifierPtr := &taskIdentifier
		taskTitlePtr := &taskTitle

		activities[i] = &domain.Activity{
			ID:        pgtypeToUUID(r.ID),
			ProjectID: pgtypeToUUID(r.ProjectID),
			TaskID:    taskIDPtr,
			ActorID:   pgtypeToUUID(r.ActorID),
			Actor: &domain.UserSummary{
				ID:        pgtypeToUUID(r.ActorID),
				Email:     r.ActorEmail,
				Name:      namePtr,
				AvatarURL: avatarPtr,
			},
			Action:         r.Action,
			Metadata:       meta,
			CreatedAt:      r.CreatedAt.Time,
			TaskIdentifier: taskIdentifierPtr,
			TaskTitle:      taskTitlePtr,
		}
	}

	return activities, total, nil
}
