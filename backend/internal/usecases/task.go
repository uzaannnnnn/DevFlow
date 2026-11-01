package usecases

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TaskUsecase interface {
	CreateTask(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, input domain.CreateTaskInput) (*domain.Task, error)
	GetTask(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID) (*domain.Task, error)
	ListTasks(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, filter domain.TaskListFilter) ([]domain.Task, int64, error)
	UpdateTask(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, input domain.UpdateTaskInput) (*domain.Task, error)
	DeleteTask(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID) error
}

type taskUsecase struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

// NewTaskUsecase initializes a new TaskUsecase.
func NewTaskUsecase(pool *pgxpool.Pool, queries *repository.Queries) TaskUsecase {
	return &taskUsecase{
		pool:    pool,
		queries: queries,
	}
}

// CreateTask atomically creates a new task within a project and generates a project-specific identifier.
func (u *taskUsecase) CreateTask(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, input domain.CreateTaskInput) (*domain.Task, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	pgPID := uuidToPgtype(projectID)
	pgActorID := uuidToPgtype(actorID)

	// 1. Verify caller is a project member (Decision 5 / Project Boundary Isolation)
	_, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	if u.pool == nil {
		return nil, domain.NewInternalError("Database pool unavailable", nil)
	}

	// 2. Atomic Transaction (§8.7): Increment counter, format identifier, lock assignee, insert task & activity log
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Step 1: Increment project task_counter with exclusive row lock on project
	incRow, err := qtx.IncrementProjectTaskCounter(ctx, pgPID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to increment project task counter", err)
	}

	// Step 2: Format task identifier (Decision 6)
	identifier := domain.FormatTaskIdentifier(incRow.Key, incRow.TaskCounter)

	// Step 3: If assignee is provided, validate and lock project_members tuple using FOR KEY SHARE
	var pgAssigneeID pgtype.UUID
	if input.AssigneeID != nil {
		pgAssigneeID = uuidToPgtype(*input.AssigneeID)
		_, err := qtx.LockProjectMemberForKeyShare(ctx, repository.LockProjectMemberForKeyShareParams{
			ProjectID: pgPID,
			UserID:    pgAssigneeID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, domain.NewValidationError("Assignee must be a member of this project", map[string]string{
					"assignee_id": "Target user is not a member of this project",
				})
			}
			return nil, domain.NewInternalError("Failed to validate task assignee membership", err)
		}
	}

	// Defaults for status and priority
	status := domain.TaskStatusTodo
	if input.Status != nil && strings.TrimSpace(*input.Status) != "" {
		status = strings.ToLower(strings.TrimSpace(*input.Status))
	}
	priority := domain.TaskPriorityMedium
	if input.Priority != nil && strings.TrimSpace(*input.Priority) != "" {
		priority = strings.ToLower(strings.TrimSpace(*input.Priority))
	}

	var descPg pgtype.Text
	if input.Description != nil && strings.TrimSpace(*input.Description) != "" {
		descPg = pgtype.Text{String: strings.TrimSpace(*input.Description), Valid: true}
	}

	var dueDatePg pgtype.Timestamptz
	if input.DueDate != nil {
		dueDatePg = pgtype.Timestamptz{Time: *input.DueDate, Valid: true}
	}

	taskID := uuid.New()
	pgTaskID := uuidToPgtype(taskID)

	// Step 4: Insert task
	_, err = qtx.CreateTask(ctx, repository.CreateTaskParams{
		ID:          pgTaskID,
		ProjectID:   pgPID,
		Identifier:  identifier,
		Title:       strings.TrimSpace(input.Title),
		Description: descPg,
		Status:      status,
		Priority:    priority,
		AssigneeID:  pgAssigneeID,
		DueDate:     dueDatePg,
		CreatedBy:   pgActorID,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to create task", err)
	}

	// Step 5: Activity Log
	metaBytes, _ := json.Marshal(map[string]interface{}{
		"title":      strings.TrimSpace(input.Title),
		"identifier": identifier,
	})
	_, err = qtx.CreateTaskActivityLog(ctx, repository.CreateTaskActivityLogParams{
		ProjectID: pgPID,
		TaskID:    pgTaskID,
		ActorID:   pgActorID,
		Action:    "task_created",
		Metadata:  metaBytes,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to record task creation activity", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit task creation transaction", err)
	}

	// Fetch detail with user join
	return u.GetTask(ctx, actorID, taskID)
}

// GetTask returns a task by ID ensuring the caller is a member of the task's project.
func (u *taskUsecase) GetTask(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID) (*domain.Task, error) {
	pgTaskID := uuidToPgtype(taskID)
	pgActorID := uuidToPgtype(actorID)

	row, err := u.queries.GetTaskByID(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to fetch task", err)
	}

	// Authorization check: Actor must be a project member of the task's project (Decision 5 / AC-Z1)
	_, err = u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: row.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Access withholding: return 404
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	return mapGetTaskRowToDomain(row), nil
}

// ListTasks lists tasks for a project filtered and paginated.
func (u *taskUsecase) ListTasks(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, filter domain.TaskListFilter) ([]domain.Task, int64, error) {
	filter.Normalize()

	pgPID := uuidToPgtype(projectID)
	pgActorID := uuidToPgtype(actorID)

	// Verify project membership
	_, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, domain.NewNotFoundError("Project not found")
		}
		return nil, 0, domain.NewInternalError("Failed to check project membership", err)
	}

	var statusPg pgtype.Text
	if filter.Status != nil {
		statusPg = pgtype.Text{String: *filter.Status, Valid: true}
	}

	var priorityPg pgtype.Text
	if filter.Priority != nil {
		priorityPg = pgtype.Text{String: *filter.Priority, Valid: true}
	}

	var assigneePg pgtype.UUID
	if filter.AssigneeID != nil {
		assigneePg = uuidToPgtype(*filter.AssigneeID)
	}

	var searchPg pgtype.Text
	if filter.Search != nil {
		searchPg = pgtype.Text{String: *filter.Search, Valid: true}
	}

	rows, err := u.queries.ListTasksByProject(ctx, repository.ListTasksByProjectParams{
		ProjectID:  pgPID,
		Limit:      filter.Limit(),
		Offset:     filter.Offset(),
		Status:     statusPg,
		Priority:   priorityPg,
		AssigneeID: assigneePg,
		Search:     searchPg,
	})
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to list project tasks", err)
	}

	total, err := u.queries.CountTasksByProject(ctx, repository.CountTasksByProjectParams{
		ProjectID:  pgPID,
		Status:     statusPg,
		Priority:   priorityPg,
		AssigneeID: assigneePg,
		Search:     searchPg,
	})
	if err != nil {
		return nil, 0, domain.NewInternalError("Failed to count project tasks", err)
	}

	tasks := make([]domain.Task, 0, len(rows))
	for _, r := range rows {
		tasks = append(tasks, *mapListTaskRowToDomain(r))
	}

	return tasks, total, nil
}

// UpdateTask updates task properties (title, description, status, priority, assignee, due_date).
// It adheres strictly to DATABASE_SPECIFICATION.md §8.8: project_members -> tasks lock hierarchy.
func (u *taskUsecase) UpdateTask(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID, input domain.UpdateTaskInput) (*domain.Task, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	pgTaskID := uuidToPgtype(taskID)
	pgActorID := uuidToPgtype(actorID)

	// Step 1: Preliminary non-locking task read to identify project context
	prelimTask, err := u.queries.GetTaskByID(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to fetch task", err)
	}
	projectID := prelimTask.ProjectID

	// Step 2: Preliminary authorization check (actor must be project member per Decision 5)
	_, err = u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: projectID,
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

	// Determine all project memberships to lock with FOR KEY SHARE before locking the task row:
	// 1. The Actor's membership (to prevent concurrent removal of the acting user)
	// 2. The New Assignee's membership (if task is being assigned to a user)
	// 3. The Current Assignee's membership (if task currently has an assignee and assignee is not changing)
	userIDsToLock := []uuid.UUID{actorID}
	var targetAssigneeID *uuid.UUID
	if input.SetAssignee && input.AssigneeID != nil {
		aid := *input.AssigneeID
		targetAssigneeID = &aid
		if aid != actorID {
			userIDsToLock = append(userIDsToLock, aid)
		}
	} else if !input.SetAssignee && prelimTask.AssigneeID.Valid {
		currAID := pgtypeToUUID(prelimTask.AssigneeID)
		if currAID != actorID {
			userIDsToLock = append(userIDsToLock, currAID)
		}
	}

	// Deterministic lock ordering: sort by UUID string to eliminate intra-statement deadlocks
	sort.Slice(userIDsToLock, func(i, j int) bool {
		return userIDsToLock[i].String() < userIDsToLock[j].String()
	})

	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Step 3 (§8.8): Acquire FOR KEY SHARE on project_members FIRST.
	// This establishes the project_members -> tasks lock hierarchy, eliminating AB-BA deadlocks with RemoveProjectMember.
	for _, uid := range userIDsToLock {
		_, err := qtx.LockProjectMemberForKeyShare(ctx, repository.LockProjectMemberForKeyShareParams{
			ProjectID: projectID,
			UserID:    uuidToPgtype(uid),
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				if targetAssigneeID != nil && uid == *targetAssigneeID {
					return nil, domain.NewValidationError("Assignee must be a member of this project", map[string]string{
						"assignee_id": "Target user is not a member of this project",
					})
				}
				if uid == actorID {
					// Actor was removed from project
					return nil, domain.NewNotFoundError("Task not found")
				}
				// Current assignee was concurrently removed and unassigned; continue under task lock
				continue
			}
			return nil, domain.NewInternalError("Failed to lock project member for task update", err)
		}
	}

	// Step 4 (§8.8): Now acquire the task row lock with FOR UPDATE
	currentTask, err := qtx.GetTaskByIDForUpdate(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Task not found")
		}
		return nil, domain.NewInternalError("Failed to fetch task for update", err)
	}

	// Step 5: Revalidate task existence, active status, and project association under row lock
	if currentTask.DeletedAt.Valid {
		return nil, domain.NewNotFoundError("Task not found")
	}
	if currentTask.ProjectID != projectID {
		return nil, domain.NewNotFoundError("Task not found")
	}

	// Step 6: Prepare update parameters and execute UpdateTask
	var pgAssigneeID pgtype.UUID
	if input.SetAssignee && input.AssigneeID != nil {
		pgAssigneeID = uuidToPgtype(*input.AssigneeID)
	}

	var titlePg pgtype.Text
	if input.Title != nil {
		titlePg = pgtype.Text{String: strings.TrimSpace(*input.Title), Valid: true}
	}

	var descPg pgtype.Text
	if input.Description != nil {
		descPg = pgtype.Text{String: strings.TrimSpace(*input.Description), Valid: true}
	}

	var statusPg pgtype.Text
	if input.Status != nil && strings.TrimSpace(*input.Status) != "" {
		statusPg = pgtype.Text{String: strings.ToLower(strings.TrimSpace(*input.Status)), Valid: true}
	}

	var priorityPg pgtype.Text
	if input.Priority != nil && strings.TrimSpace(*input.Priority) != "" {
		priorityPg = pgtype.Text{String: strings.ToLower(strings.TrimSpace(*input.Priority)), Valid: true}
	}

	var dueDatePg pgtype.Timestamptz
	if input.SetDueDate && input.DueDate != nil {
		dueDatePg = pgtype.Timestamptz{Time: *input.DueDate, Valid: true}
	}

	_, err = qtx.UpdateTask(ctx, repository.UpdateTaskParams{
		ID:             pgTaskID,
		Title:          titlePg,
		Description:    descPg,
		Status:         statusPg,
		Priority:       priorityPg,
		AssigneeID:     pgAssigneeID,
		DueDate:        dueDatePg,
		SetDescription: input.Description != nil,
		SetAssignee:    input.SetAssignee,
		SetDueDate:     input.SetDueDate,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to update task", err)
	}

	// Step 7: Activity log for status change
	if input.Status != nil && *input.Status != currentTask.Status {
		meta, _ := json.Marshal(map[string]interface{}{
			"old_status": currentTask.Status,
			"new_status": *input.Status,
		})
		_, _ = qtx.CreateTaskActivityLog(ctx, repository.CreateTaskActivityLogParams{
			ProjectID: currentTask.ProjectID,
			TaskID:    pgTaskID,
			ActorID:   pgActorID,
			Action:    "task_status_changed",
			Metadata:  meta,
		})
	}

	// Step 8: Activity log for assignee change
	if input.SetAssignee {
		var oldAssigneeStr *string
		if currentTask.AssigneeID.Valid {
			s := pgtypeToUUID(currentTask.AssigneeID).String()
			oldAssigneeStr = &s
		}
		var newAssigneeStr *string
		if input.AssigneeID != nil {
			s := input.AssigneeID.String()
			newAssigneeStr = &s
		}
		if (oldAssigneeStr == nil && newAssigneeStr != nil) || (oldAssigneeStr != nil && newAssigneeStr == nil) || (oldAssigneeStr != nil && newAssigneeStr != nil && *oldAssigneeStr != *newAssigneeStr) {
			meta, _ := json.Marshal(map[string]interface{}{
				"old_assignee_id": oldAssigneeStr,
				"new_assignee_id": newAssigneeStr,
			})
			action := "task_assigned"
			if newAssigneeStr == nil {
				action = "task_unassigned"
			}
			_, _ = qtx.CreateTaskActivityLog(ctx, repository.CreateTaskActivityLogParams{
				ProjectID: currentTask.ProjectID,
				TaskID:    pgTaskID,
				ActorID:   pgActorID,
				Action:    action,
				Metadata:  meta,
			})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit task update transaction", err)
	}

	return u.GetTask(ctx, actorID, taskID)
}

// DeleteTask soft-deletes a task from the project and records activity history.
func (u *taskUsecase) DeleteTask(ctx context.Context, actorID uuid.UUID, taskID uuid.UUID) error {
	pgTaskID := uuidToPgtype(taskID)
	pgActorID := uuidToPgtype(actorID)

	if u.pool == nil {
		return domain.NewInternalError("Database pool unavailable", nil)
	}

	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Step 0: Lock task row
	currentTask, err := qtx.GetTaskByIDForUpdate(ctx, pgTaskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Task not found")
		}
		return domain.NewInternalError("Failed to fetch task for deletion", err)
	}

	// Step 1: Verify actor membership in project
	_, err = qtx.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: currentTask.ProjectID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Task not found")
		}
		return domain.NewInternalError("Failed to check project membership", err)
	}

	// Step 2: Soft delete task
	_, err = qtx.SoftDeleteTask(ctx, pgTaskID)
	if err != nil {
		return domain.NewInternalError("Failed to soft-delete task", err)
	}

	// Step 3: Activity log
	meta, _ := json.Marshal(map[string]interface{}{
		"identifier": currentTask.Identifier,
		"title":      currentTask.Title,
	})
	_, _ = qtx.CreateTaskActivityLog(ctx, repository.CreateTaskActivityLogParams{
		ProjectID: currentTask.ProjectID,
		TaskID:    pgTaskID,
		ActorID:   pgActorID,
		Action:    "task_deleted",
		Metadata:  meta,
	})

	if err := tx.Commit(ctx); err != nil {
		return domain.NewInternalError("Failed to commit task deletion", err)
	}

	return nil
}

// Mapping helpers
func mapGetTaskRowToDomain(r repository.GetTaskByIDRow) *domain.Task {
	var descPtr *string
	if r.Description.Valid {
		d := r.Description.String
		descPtr = &d
	}

	var assigneeIDPtr *uuid.UUID
	var assigneeSummary *domain.UserSummary
	if r.AssigneeID.Valid {
		u := pgtypeToUUID(r.AssigneeID)
		assigneeIDPtr = &u
		var namePtr *string
		if r.AssigneeName.Valid {
			n := r.AssigneeName.String
			namePtr = &n
		}
		var avatarPtr *string
		if r.AssigneeAvatarUrl.Valid {
			a := r.AssigneeAvatarUrl.String
			avatarPtr = &a
		}
		assigneeSummary = &domain.UserSummary{
			ID:        u,
			Email:     r.AssigneeEmail.String,
			Name:      namePtr,
			AvatarURL: avatarPtr,
		}
	}

	var dueDatePtr *time.Time
	if r.DueDate.Valid {
		t := r.DueDate.Time
		dueDatePtr = &t
	}

	var deletedAtPtr *time.Time
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		deletedAtPtr = &t
	}

	var creatorNamePtr *string
	if r.CreatorName.Valid {
		n := r.CreatorName.String
		creatorNamePtr = &n
	}
	var creatorAvatarPtr *string
	if r.CreatorAvatarUrl.Valid {
		a := r.CreatorAvatarUrl.String
		creatorAvatarPtr = &a
	}
	creatorSummary := &domain.UserSummary{
		ID:        pgtypeToUUID(r.CreatedBy),
		Email:     r.CreatorEmail,
		Name:      creatorNamePtr,
		AvatarURL: creatorAvatarPtr,
	}

	return &domain.Task{
		ID:          pgtypeToUUID(r.ID),
		ProjectID:   pgtypeToUUID(r.ProjectID),
		Identifier:  r.Identifier,
		Title:       r.Title,
		Description: descPtr,
		Status:      r.Status,
		Priority:    r.Priority,
		AssigneeID:  assigneeIDPtr,
		Assignee:    assigneeSummary,
		DueDate:     dueDatePtr,
		CreatedBy:   pgtypeToUUID(r.CreatedBy),
		Creator:     creatorSummary,
		CreatedAt:   r.CreatedAt.Time,
		UpdatedAt:   r.UpdatedAt.Time,
		DeletedAt:   deletedAtPtr,
	}
}

func mapListTaskRowToDomain(r repository.ListTasksByProjectRow) *domain.Task {
	var descPtr *string
	if r.Description.Valid {
		d := r.Description.String
		descPtr = &d
	}

	var assigneeIDPtr *uuid.UUID
	var assigneeSummary *domain.UserSummary
	if r.AssigneeID.Valid {
		u := pgtypeToUUID(r.AssigneeID)
		assigneeIDPtr = &u
		var namePtr *string
		if r.AssigneeName.Valid {
			n := r.AssigneeName.String
			namePtr = &n
		}
		var avatarPtr *string
		if r.AssigneeAvatarUrl.Valid {
			a := r.AssigneeAvatarUrl.String
			avatarPtr = &a
		}
		assigneeSummary = &domain.UserSummary{
			ID:        u,
			Email:     r.AssigneeEmail.String,
			Name:      namePtr,
			AvatarURL: avatarPtr,
		}
	}

	var dueDatePtr *time.Time
	if r.DueDate.Valid {
		t := r.DueDate.Time
		dueDatePtr = &t
	}

	var deletedAtPtr *time.Time
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		deletedAtPtr = &t
	}

	var creatorNamePtr *string
	if r.CreatorName.Valid {
		n := r.CreatorName.String
		creatorNamePtr = &n
	}
	var creatorAvatarPtr *string
	if r.CreatorAvatarUrl.Valid {
		a := r.CreatorAvatarUrl.String
		creatorAvatarPtr = &a
	}
	creatorSummary := &domain.UserSummary{
		ID:        pgtypeToUUID(r.CreatedBy),
		Email:     r.CreatorEmail,
		Name:      creatorNamePtr,
		AvatarURL: creatorAvatarPtr,
	}

	return &domain.Task{
		ID:          pgtypeToUUID(r.ID),
		ProjectID:   pgtypeToUUID(r.ProjectID),
		Identifier:  r.Identifier,
		Title:       r.Title,
		Description: descPtr,
		Status:      r.Status,
		Priority:    r.Priority,
		AssigneeID:  assigneeIDPtr,
		Assignee:    assigneeSummary,
		DueDate:     dueDatePtr,
		CreatedBy:   pgtypeToUUID(r.CreatedBy),
		Creator:     creatorSummary,
		CreatedAt:   r.CreatedAt.Time,
		UpdatedAt:   r.UpdatedAt.Time,
		DeletedAt:   deletedAtPtr,
	}
}
