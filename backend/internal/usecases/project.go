package usecases

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"devflow/backend/internal/domain"
	"devflow/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProjectUsecase defines the interface for project management operations.
type ProjectUsecase interface {
	CreateProject(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID, input domain.CreateProjectInput) (*domain.ProjectResponse, error)
	ListWorkspaceProjects(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID, search *string) ([]domain.ProjectResponse, error)
	GetProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) (*domain.ProjectResponse, error)
	UpdateProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID, input domain.UpdateProjectInput) (*domain.ProjectResponse, error)
	ArchiveProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) error
	ListProjectMembers(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) ([]domain.ProjectMemberResponse, error)
	AddProjectMember(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, input domain.AddProjectMemberInput) (*domain.ProjectMemberResponse, error)
	UpdateProjectMemberRole(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, targetUserID uuid.UUID, input domain.UpdateProjectMemberRoleInput) (*domain.ProjectMemberResponse, error)
	RemoveProjectMember(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, targetUserID uuid.UUID) error
}

type projectUsecase struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

// NewProjectUsecase initializes a new ProjectUsecase.
func NewProjectUsecase(pool *pgxpool.Pool, queries *repository.Queries) ProjectUsecase {
	return &projectUsecase{
		pool:    pool,
		queries: queries,
	}
}

// CreateProject creates a project in the workspace and atomically adds the creator as project owner.
func (u *projectUsecase) CreateProject(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID, input domain.CreateProjectInput) (*domain.ProjectResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgUserID := uuidToPgtype(userID)

	// 1. Verify workspace membership and project creation permission
	wsMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check workspace membership", err)
	}

	// Viewers cannot create projects
	if strings.ToLower(wsMember.Role) == domain.RoleViewer {
		return nil, domain.NewForbiddenError("Viewers do not have permission to create projects in this workspace")
	}

	// 2. Validate Project Name
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, domain.NewValidationError("Project name is required", nil)
	}
	if len(name) > 255 {
		return nil, domain.NewValidationError("Project name cannot exceed 255 characters", nil)
	}

	// 3. Validate or Auto-Generate Project Key (Decision 6)
	var key string
	if input.Key != nil && strings.TrimSpace(*input.Key) != "" {
		key = strings.ToUpper(strings.TrimSpace(*input.Key))
		if !domain.ValidateProjectKey(key) {
			return nil, domain.NewValidationError("Project key must be 2-10 uppercase alphanumeric characters starting with a letter (e.g. DEV, PRJ1)", nil)
		}
	} else {
		key = domain.GenerateProjectKey(name)
	}

	// Verify key uniqueness within workspace
	existingProj, err := u.queries.GetProjectByWorkspaceAndKey(ctx, repository.GetProjectByWorkspaceAndKeyParams{
		WorkspaceID: pgWSID,
		Lower:       key,
	})
	if err == nil && existingProj.ID.Valid {
		return nil, domain.NewConflictError(fmt.Sprintf("A project with key '%s' already exists in this workspace", key))
	}

	var desc pgtype.Text
	if input.Description != nil && strings.TrimSpace(*input.Description) != "" {
		desc = pgtype.Text{String: strings.TrimSpace(*input.Description), Valid: true}
	}

	if u.pool == nil {
		return nil, domain.NewInternalError("Database pool unavailable", nil)
	}

	// 4. Atomic Transaction: Create project + Add creator as project Owner
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	proj, err := qtx.CreateProject(ctx, repository.CreateProjectParams{
		WorkspaceID: pgWSID,
		Key:         key,
		Name:        name,
		Description: desc,
		CreatedBy:   pgUserID,
	})
	if err != nil {
		if strings.Contains(err.Error(), "projects_workspace_id_key_key") {
			return nil, domain.NewConflictError(fmt.Sprintf("A project with key '%s' already exists in this workspace", key))
		}
		return nil, domain.NewInternalError("Failed to create project", err)
	}

	_, err = qtx.AddProjectMember(ctx, repository.AddProjectMemberParams{
		ProjectID:   proj.ID,
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
		Role:        domain.ProjectRoleOwner,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to add project creator as owner", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit project creation transaction", err)
	}

	var descPtr *string
	if proj.Description.Valid {
		d := proj.Description.String
		descPtr = &d
	}

	return &domain.ProjectResponse{
		ID:          pgtypeToUUID(proj.ID),
		WorkspaceID: pgtypeToUUID(proj.WorkspaceID),
		Key:         proj.Key,
		Name:        proj.Name,
		Description: descPtr,
		TaskCounter: proj.TaskCounter,
		CreatedBy:   pgtypeToUUID(proj.CreatedBy),
		Role:        domain.ProjectRoleOwner,
		MemberCount: 1,
		CreatedAt:   proj.CreatedAt.Time,
		UpdatedAt:   proj.UpdatedAt.Time,
	}, nil
}

// ListWorkspaceProjects lists all projects in a workspace where the user is a project member.
func (u *projectUsecase) ListWorkspaceProjects(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID, search *string) ([]domain.ProjectResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgUserID := uuidToPgtype(userID)

	// 1. Verify workspace membership (Tenant Isolation)
	_, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check workspace membership", err)
	}

	var searchPg pgtype.Text
	if search != nil && strings.TrimSpace(*search) != "" {
		searchPg = pgtype.Text{String: strings.TrimSpace(*search), Valid: true}
	}

	rows, err := u.queries.ListProjectsByWorkspaceAndUser(ctx, repository.ListProjectsByWorkspaceAndUserParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
		Search:      searchPg,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to list projects", err)
	}

	result := make([]domain.ProjectResponse, 0, len(rows))
	for _, r := range rows {
		var descPtr *string
		if r.Description.Valid {
			d := r.Description.String
			descPtr = &d
		}
		var delPtr *time.Time
		if r.DeletedAt.Valid {
			delPtr = &r.DeletedAt.Time
		}

		result = append(result, domain.ProjectResponse{
			ID:          pgtypeToUUID(r.ID),
			WorkspaceID: pgtypeToUUID(r.WorkspaceID),
			Key:         r.Key,
			Name:        r.Name,
			Description: descPtr,
			TaskCounter: r.TaskCounter,
			CreatedBy:   pgtypeToUUID(r.CreatedBy),
			Role:        r.MemberRole,
			MemberCount: r.MemberCount,
			CreatedAt:   r.CreatedAt.Time,
			UpdatedAt:   r.UpdatedAt.Time,
			DeletedAt:   delPtr,
		})
	}

	return result, nil
}

// GetProject returns project details if the caller is an authorized project member.
func (u *projectUsecase) GetProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) (*domain.ProjectResponse, error) {
	pgPID := uuidToPgtype(projectID)
	pgUserID := uuidToPgtype(userID)

	// 1. Verify project membership (Decision 5 / AC-Z1: Admin does not automatically bypass project boundary)
	pm, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	proj, err := u.queries.GetProjectByID(ctx, pgPID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to fetch project", err)
	}

	var descPtr *string
	if proj.Description.Valid {
		d := proj.Description.String
		descPtr = &d
	}

	return &domain.ProjectResponse{
		ID:          pgtypeToUUID(proj.ID),
		WorkspaceID: pgtypeToUUID(proj.WorkspaceID),
		Key:         proj.Key,
		Name:        proj.Name,
		Description: descPtr,
		TaskCounter: proj.TaskCounter,
		CreatedBy:   pgtypeToUUID(proj.CreatedBy),
		Role:        pm.Role,
		CreatedAt:   proj.CreatedAt.Time,
		UpdatedAt:   proj.UpdatedAt.Time,
	}, nil
}

// UpdateProject updates permitted project fields (name, description). Project key is strictly immutable.
func (u *projectUsecase) UpdateProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID, input domain.UpdateProjectInput) (*domain.ProjectResponse, error) {
	pgPID := uuidToPgtype(projectID)
	pgUserID := uuidToPgtype(userID)

	// 1. Verify project membership and permission
	pm, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	if !domain.HasProjectPermission(pm.Role, domain.PermProjectUpdate) {
		return nil, domain.NewForbiddenError("You do not have permission to update this project")
	}

	params := repository.UpdateProjectParams{
		ID: pgPID,
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, domain.NewValidationError("Project name cannot be empty", nil)
		}
		if len(name) > 255 {
			return nil, domain.NewValidationError("Project name cannot exceed 255 characters", nil)
		}
		params.Name = pgtype.Text{String: name, Valid: true}
	}

	if input.Description != nil {
		params.Description = pgtype.Text{String: strings.TrimSpace(*input.Description), Valid: true}
	}

	updated, err := u.queries.UpdateProject(ctx, params)
	if err != nil {
		return nil, domain.NewInternalError("Failed to update project", err)
	}

	var descPtr *string
	if updated.Description.Valid {
		d := updated.Description.String
		descPtr = &d
	}

	return &domain.ProjectResponse{
		ID:          pgtypeToUUID(updated.ID),
		WorkspaceID: pgtypeToUUID(updated.WorkspaceID),
		Key:         updated.Key,
		Name:        updated.Name,
		Description: descPtr,
		TaskCounter: updated.TaskCounter,
		CreatedBy:   pgtypeToUUID(updated.CreatedBy),
		Role:        pm.Role,
		CreatedAt:   updated.CreatedAt.Time,
		UpdatedAt:   updated.UpdatedAt.Time,
	}, nil
}

// ArchiveProject soft-deletes a project (Project Owner or Admin per AC-C5).
func (u *projectUsecase) ArchiveProject(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) error {
	pgPID := uuidToPgtype(projectID)
	pgUserID := uuidToPgtype(userID)

	pm, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Project not found")
		}
		return domain.NewInternalError("Failed to check project membership", err)
	}

	if !domain.HasProjectPermission(pm.Role, domain.PermProjectDelete) {
		return domain.NewForbiddenError("Only a project owner or admin can archive this project")
	}

	_, err = u.queries.SoftDeleteProject(ctx, pgPID)
	if err != nil {
		return domain.NewInternalError("Failed to archive project", err)
	}

	return nil
}

// ListProjectMembers lists all members of a project.
func (u *projectUsecase) ListProjectMembers(ctx context.Context, userID uuid.UUID, projectID uuid.UUID) ([]domain.ProjectMemberResponse, error) {
	pgPID := uuidToPgtype(projectID)
	pgUserID := uuidToPgtype(userID)

	// Verify caller belongs to project
	_, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	rows, err := u.queries.ListProjectMembers(ctx, pgPID)
	if err != nil {
		return nil, domain.NewInternalError("Failed to list project members", err)
	}

	result := make([]domain.ProjectMemberResponse, 0, len(rows))
	for _, r := range rows {
		var namePtr *string
		if r.UserName.Valid {
			n := r.UserName.String
			namePtr = &n
		}
		var avatarPtr *string
		if r.AvatarUrl.Valid {
			a := r.AvatarUrl.String
			avatarPtr = &a
		}

		result = append(result, domain.ProjectMemberResponse{
			ID:          pgtypeToUUID(r.ID),
			ProjectID:   pgtypeToUUID(r.ProjectID),
			WorkspaceID: pgtypeToUUID(r.WorkspaceID),
			UserID:      pgtypeToUUID(r.UserID),
			Role:        r.Role,
			Email:       r.Email,
			Name:        namePtr,
			AvatarURL:   avatarPtr,
			CreatedAt:   r.CreatedAt.Time,
		})
	}

	return result, nil
}

// AddProjectMember adds a workspace member into the project.
func (u *projectUsecase) AddProjectMember(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, input domain.AddProjectMemberInput) (*domain.ProjectMemberResponse, error) {
	pgPID := uuidToPgtype(projectID)
	pgActorID := uuidToPgtype(actorID)
	pgTargetID := uuidToPgtype(input.UserID)

	// 1. Verify actor has permission to add project members
	actorMember, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	if !domain.HasProjectPermission(actorMember.Role, domain.PermProjectMemberAdd) {
		return nil, domain.NewForbiddenError("You do not have permission to add members to this project")
	}

	// 2. Fetch project to identify workspace_id
	proj, err := u.queries.GetProjectByID(ctx, pgPID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to fetch project", err)
	}

	// 3. Verify target user exists
	targetUser, err := u.queries.GetUserByID(ctx, pgTargetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("User not found")
		}
		return nil, domain.NewInternalError("Failed to fetch user", err)
	}

	// 4. Invariant: Target user MUST be an existing member of the parent workspace!
	_, err = u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: proj.WorkspaceID,
		UserID:      pgTargetID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewValidationError("User must be a member of the workspace before being added to this project", nil)
		}
		return nil, domain.NewInternalError("Failed to verify workspace membership", err)
	}

	// 5. Invariant: Cannot add duplicate membership
	existingMember, err := u.queries.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgTargetID,
	})
	if err == nil && existingMember.ID.Valid {
		return nil, domain.NewConflictError("User is already a member of this project")
	}

	role := strings.ToLower(strings.TrimSpace(input.Role))
	if role == "" {
		role = domain.ProjectRoleMember
	} else if role != domain.ProjectRoleAdmin && role != domain.ProjectRoleMember {
		return nil, domain.NewValidationError("Role must be 'admin' or 'member'", nil)
	}

	created, err := u.queries.AddProjectMember(ctx, repository.AddProjectMemberParams{
		ProjectID:   pgPID,
		WorkspaceID: proj.WorkspaceID,
		UserID:      pgTargetID,
		Role:        role,
	})
	if err != nil {
		if strings.Contains(err.Error(), "project_members_project_user_key") {
			return nil, domain.NewConflictError("User is already a member of this project")
		}
		return nil, domain.NewInternalError("Failed to add project member", err)
	}

	var namePtr *string
	if targetUser.Name.Valid {
		n := targetUser.Name.String
		namePtr = &n
	}
	var avatarPtr *string
	if targetUser.AvatarUrl.Valid {
		a := targetUser.AvatarUrl.String
		avatarPtr = &a
	}

	return &domain.ProjectMemberResponse{
		ID:          pgtypeToUUID(created.ID),
		ProjectID:   pgtypeToUUID(created.ProjectID),
		WorkspaceID: pgtypeToUUID(created.WorkspaceID),
		UserID:      pgtypeToUUID(created.UserID),
		Role:        created.Role,
		Email:       targetUser.Email,
		Name:        namePtr,
		AvatarURL:   avatarPtr,
		CreatedAt:   created.CreatedAt.Time,
	}, nil
}

// UpdateProjectMemberRole updates a member's role in the project.
// UpdateProjectMemberRole updates a member's role in the project with transactional concurrency protection.
func (u *projectUsecase) UpdateProjectMemberRole(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, targetUserID uuid.UUID, input domain.UpdateProjectMemberRoleInput) (*domain.ProjectMemberResponse, error) {
	pgPID := uuidToPgtype(projectID)
	pgActorID := uuidToPgtype(actorID)
	pgTargetID := uuidToPgtype(targetUserID)

	targetRole := strings.ToLower(strings.TrimSpace(input.Role))
	if !domain.IsValidProjectRole(targetRole) {
		return nil, domain.NewValidationError("Invalid project role", nil)
	}

	if u.pool == nil {
		return nil, domain.NewInternalError("Database pool unavailable", nil)
	}

	// Atomic Transaction: Lock project row to serialize role mutations and sole owner protection
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Step 0: Lock project row
	_, err = qtx.GetProjectByIDForUpdate(ctx, pgPID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to lock project", err)
	}

	// Step 1: Verify actor membership
	actorMember, err := qtx.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Project not found")
		}
		return nil, domain.NewInternalError("Failed to check project membership", err)
	}

	if !domain.HasProjectPermission(actorMember.Role, domain.PermProjectMemberRoleChange) {
		return nil, domain.NewForbiddenError("You do not have permission to change project member roles")
	}

	// Step 2: Lock target member row for update
	targetMember, err := qtx.GetProjectMemberForUpdate(ctx, repository.GetProjectMemberForUpdateParams{
		ProjectID: pgPID,
		UserID:    pgTargetID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Member not found in this project")
		}
		return nil, domain.NewInternalError("Failed to lock project member row", err)
	}

	if !domain.CanManageProjectMember(actorMember.Role, targetMember.Role) {
		return nil, domain.NewForbiddenError("You cannot modify the role of this member")
	}

	// Step 3: Owner protection inside transaction (prevents concurrent demotion of sole owner)
	if targetMember.Role == domain.ProjectRoleOwner && targetRole != domain.ProjectRoleOwner {
		count, err := qtx.CountProjectOwners(ctx, pgPID)
		if err == nil && count <= 1 {
			return nil, domain.NewValidationError("Cannot demote the sole project owner", nil)
		}
	}

	updated, err := qtx.UpdateProjectMemberRole(ctx, repository.UpdateProjectMemberRoleParams{
		ProjectID: pgPID,
		UserID:    pgTargetID,
		Role:      targetRole,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to update project member role", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit project member role update", err)
	}

	targetUser, _ := u.queries.GetUserByID(ctx, pgTargetID)
	var namePtr *string
	if targetUser.Name.Valid {
		n := targetUser.Name.String
		namePtr = &n
	}
	var avatarPtr *string
	if targetUser.AvatarUrl.Valid {
		a := targetUser.AvatarUrl.String
		avatarPtr = &a
	}

	return &domain.ProjectMemberResponse{
		ID:          pgtypeToUUID(updated.ID),
		ProjectID:   pgtypeToUUID(updated.ProjectID),
		WorkspaceID: pgtypeToUUID(updated.WorkspaceID),
		UserID:      pgtypeToUUID(updated.UserID),
		Role:        updated.Role,
		Email:       targetUser.Email,
		Name:        namePtr,
		AvatarURL:   avatarPtr,
		CreatedAt:   updated.CreatedAt.Time,
	}, nil
}

// RemoveProjectMember removes a member from the project after atomically unassigning any tasks in this project per §8.13.
func (u *projectUsecase) RemoveProjectMember(ctx context.Context, actorID uuid.UUID, projectID uuid.UUID, targetUserID uuid.UUID) error {
	pgPID := uuidToPgtype(projectID)
	pgActorID := uuidToPgtype(actorID)
	pgTargetID := uuidToPgtype(targetUserID)

	if u.pool == nil {
		return domain.NewInternalError("Database pool unavailable", nil)
	}

	// 1. Atomic Transaction (§8.13): Lock hierarchy project -> project_members -> tasks
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Step 1: Verify actor membership
	actorMember, err := qtx.GetProjectMember(ctx, repository.GetProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Project not found")
		}
		return domain.NewInternalError("Failed to check project membership", err)
	}

	// Step 2: Lock departing project member row with FOR UPDATE per §8.14
	targetMember, err := qtx.GetProjectMemberForUpdate(ctx, repository.GetProjectMemberForUpdateParams{
		ProjectID: pgPID,
		UserID:    pgTargetID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Member not found in this project")
		}
		return domain.NewInternalError("Failed to lookup project member", err)
	}

	// Step 3: Authorization checks and sole-owner protection inside transaction
	if actorID == targetUserID {
		if targetMember.Role == domain.ProjectRoleOwner {
			count, err := qtx.CountProjectOwners(ctx, pgPID)
			if err == nil && count <= 1 {
				return domain.NewValidationError("The sole project owner cannot leave the project without transferring ownership or deleting the project", nil)
			}
		}
	} else {
		if !domain.HasProjectPermission(actorMember.Role, domain.PermProjectMemberRemove) {
			return domain.NewForbiddenError("You do not have permission to remove members from this project")
		}
		if !domain.CanManageProjectMember(actorMember.Role, targetMember.Role) {
			return domain.NewForbiddenError("You cannot remove this member")
		}
	}

	// Step 4 (§8.13): Deterministic task locking in ID order
	_, err = qtx.LockTasksForDepartingProjectMember(ctx, repository.LockTasksForDepartingProjectMemberParams{
		ProjectID:  pgPID,
		AssigneeID: pgTargetID,
	})
	if err != nil {
		return domain.NewInternalError("Failed to lock tasks for departing member", err)
	}

	// Step 5 (§8.13): Atomic unassignment (both active and soft-deleted) + Activity Logging
	_, err = qtx.UnassignTasksAndLogForDepartingMember(ctx, repository.UnassignTasksAndLogForDepartingMemberParams{
		ProjectID:  pgPID,
		AssigneeID: targetUserID.String(),
		ActorID:    pgActorID,
	})
	if err != nil {
		return domain.NewInternalError("Failed to unassign project tasks and log activity", err)
	}

	// Step 6 (§8.13): Delete project membership
	_, err = qtx.DeleteProjectMember(ctx, repository.DeleteProjectMemberParams{
		ProjectID: pgPID,
		UserID:    pgTargetID,
	})
	if err != nil {
		return domain.NewInternalError("Failed to delete project member", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.NewInternalError("Failed to commit project member removal", err)
	}

	return nil
}
