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

// WorkspaceUsecase defines the interface for workspace and membership operations.
type WorkspaceUsecase interface {
	CreateWorkspace(ctx context.Context, creatorID uuid.UUID, input domain.CreateWorkspaceInput) (*domain.WorkspaceResponse, error)
	ListUserWorkspaces(ctx context.Context, userID uuid.UUID) ([]domain.WorkspaceResponse, error)
	GetWorkspace(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID) (*domain.WorkspaceResponse, error)
	UpdateWorkspace(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID, input domain.UpdateWorkspaceInput) (*domain.WorkspaceResponse, error)
	DeleteWorkspace(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID) error
	ListMembers(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID) ([]domain.WorkspaceMemberResponse, error)
	AddMember(ctx context.Context, actorID uuid.UUID, workspaceID uuid.UUID, input domain.AddMemberInput) (*domain.WorkspaceMemberResponse, error)
	UpdateMemberRole(ctx context.Context, actorID uuid.UUID, workspaceID uuid.UUID, targetUserID uuid.UUID, newRole string) (*domain.WorkspaceMemberResponse, error)
	RemoveMember(ctx context.Context, actorID uuid.UUID, workspaceID uuid.UUID, targetUserID uuid.UUID) error
}

type workspaceUsecase struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

// NewWorkspaceUsecase creates a new WorkspaceUsecase instance.
func NewWorkspaceUsecase(pool *pgxpool.Pool, queries *repository.Queries) WorkspaceUsecase {
	return &workspaceUsecase{
		pool:    pool,
		queries: queries,
	}
}

func toWorkspaceResponse(w repository.Workspace, role string) domain.WorkspaceResponse {
	var descPtr *string
	if w.Description.Valid {
		d := w.Description.String
		descPtr = &d
	}

	var deletedAtPtr *time.Time
	if w.DeletedAt.Valid {
		t := w.DeletedAt.Time
		deletedAtPtr = &t
	}

	var slugStr string
	if w.Slug.Valid {
		slugStr = w.Slug.String
	}

	return domain.WorkspaceResponse{
		ID:          pgtypeToUUID(w.ID),
		Name:        w.Name,
		Slug:        slugStr,
		Description: descPtr,
		OwnerID:     pgtypeToUUID(w.OwnerID),
		Role:        role,
		CreatedAt:   w.CreatedAt.Time,
		UpdatedAt:   w.UpdatedAt.Time,
		DeletedAt:   deletedAtPtr,
	}
}

// CreateWorkspace creates a new workspace and automatically establishes the creator as the Owner
// inside an atomic database transaction.
func (u *workspaceUsecase) CreateWorkspace(ctx context.Context, creatorID uuid.UUID, input domain.CreateWorkspaceInput) (*domain.WorkspaceResponse, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, domain.NewValidationError("Workspace name is required", nil)
	}

	// Slug resolution
	var slug string
	if input.Slug != nil && strings.TrimSpace(*input.Slug) != "" {
		slug = strings.ToLower(strings.TrimSpace(*input.Slug))
		if !domain.ValidateSlug(slug) {
			return nil, domain.NewValidationError("Invalid slug format. Must consist of lowercase alphanumeric characters and single hyphens (3-63 chars)", nil)
		}
	} else {
		slug = domain.GenerateSlug(name)
	}

	if u.pool == nil {
		return nil, domain.NewInternalError("Database pool not available", nil)
	}

	// Begin atomic transaction
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Ensure slug uniqueness (append counter if auto-generated)
	existing, err := qtx.GetWorkspaceBySlug(ctx, slug)
	if err == nil && existing.ID.Valid {
		if input.Slug != nil && strings.TrimSpace(*input.Slug) != "" {
			return nil, domain.NewConflictError("A workspace with this slug already exists")
		}
		// Auto-generated slug collision: append random suffix
		slug = fmt.Sprintf("%s-%s", slug, uuid.NewString()[:6])
	}

	var descText pgtype.Text
	if input.Description != nil && strings.TrimSpace(*input.Description) != "" {
		descText = pgtype.Text{String: strings.TrimSpace(*input.Description), Valid: true}
	}

	// 1. Insert workspace with owner_id = creatorID
	ws, err := qtx.CreateWorkspace(ctx, repository.CreateWorkspaceParams{
		Name:        name,
		Slug:        pgtype.Text{String: slug, Valid: true},
		Description: descText,
		OwnerID:     uuidToPgtype(creatorID),
	})
	if err != nil {
		if strings.Contains(err.Error(), "workspaces_slug_key") {
			return nil, domain.NewConflictError("A workspace with this slug already exists")
		}
		return nil, domain.NewInternalError("Failed to create workspace", err)
	}

	// 2. Insert creator as Owner in workspace_members (invariant enforcement)
	_, err = qtx.AddWorkspaceMember(ctx, repository.AddWorkspaceMemberParams{
		WorkspaceID: ws.ID,
		UserID:      uuidToPgtype(creatorID),
		Role:        domain.RoleOwner,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to establish workspace owner membership", err)
	}

	// 3. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, domain.NewInternalError("Failed to commit workspace creation", err)
	}

	res := toWorkspaceResponse(ws, domain.RoleOwner)
	return &res, nil
}

// ListUserWorkspaces returns all active workspaces to which the authenticated user belongs.
func (u *workspaceUsecase) ListUserWorkspaces(ctx context.Context, userID uuid.UUID) ([]domain.WorkspaceResponse, error) {
	rows, err := u.queries.ListWorkspacesByUserID(ctx, uuidToPgtype(userID))
	if err != nil {
		return nil, domain.NewInternalError("Failed to list workspaces", err)
	}

	result := make([]domain.WorkspaceResponse, 0, len(rows))
	for _, r := range rows {
		var descPtr *string
		if r.Description.Valid {
			d := r.Description.String
			descPtr = &d
		}
		var slugStr string
		if r.Slug.Valid {
			slugStr = r.Slug.String
		}

		result = append(result, domain.WorkspaceResponse{
			ID:          pgtypeToUUID(r.ID),
			Name:        r.Name,
			Slug:        slugStr,
			Description: descPtr,
			OwnerID:     pgtypeToUUID(r.OwnerID),
			Role:        r.MemberRole,
			CreatedAt:   r.CreatedAt.Time,
			UpdatedAt:   r.UpdatedAt.Time,
		})
	}

	return result, nil
}

// GetWorkspace returns details for a specific workspace, verifying that the user is a member (IDOR prevention).
func (u *workspaceUsecase) GetWorkspace(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID) (*domain.WorkspaceResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgUserID := uuidToPgtype(userID)

	// 1. Verify membership
	member, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Resource withheld: user is not a member (IDOR prevention)
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check workspace membership", err)
	}

	// 2. Fetch workspace
	ws, err := u.queries.GetWorkspaceByID(ctx, pgWSID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to fetch workspace", err)
	}

	res := toWorkspaceResponse(ws, member.Role)
	return &res, nil
}

// UpdateWorkspace modifies workspace information if the authenticated user has PermWorkspaceUpdate.
func (u *workspaceUsecase) UpdateWorkspace(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID, input domain.UpdateWorkspaceInput) (*domain.WorkspaceResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgUserID := uuidToPgtype(userID)

	// 1. Verify membership and authorization
	member, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check membership", err)
	}

	if !domain.HasPermission(member.Role, domain.PermWorkspaceUpdate) {
		return nil, domain.NewForbiddenError("You do not have permission to update this workspace")
	}

	// 2. Prepare updates
	params := repository.UpdateWorkspaceParams{
		ID: pgWSID,
	}

	if input.Name != nil {
		trimmedName := strings.TrimSpace(*input.Name)
		if trimmedName == "" {
			return nil, domain.NewValidationError("Workspace name cannot be empty", nil)
		}
		params.Name = pgtype.Text{String: trimmedName, Valid: true}
	}

	if input.Slug != nil {
		trimmedSlug := strings.ToLower(strings.TrimSpace(*input.Slug))
		if !domain.ValidateSlug(trimmedSlug) {
			return nil, domain.NewValidationError("Invalid slug format", nil)
		}
		// Verify slug uniqueness
		existing, err := u.queries.GetWorkspaceBySlug(ctx, trimmedSlug)
		if err == nil && existing.ID.Valid && pgtypeToUUID(existing.ID) != workspaceID {
			return nil, domain.NewConflictError("A workspace with this slug already exists")
		}
		params.Slug = pgtype.Text{String: trimmedSlug, Valid: true}
	}

	if input.Description != nil {
		params.Description = pgtype.Text{String: strings.TrimSpace(*input.Description), Valid: true}
	}

	updated, err := u.queries.UpdateWorkspace(ctx, params)
	if err != nil {
		if strings.Contains(err.Error(), "workspaces_slug_key") {
			return nil, domain.NewConflictError("A workspace with this slug already exists")
		}
		return nil, domain.NewInternalError("Failed to update workspace", err)
	}

	res := toWorkspaceResponse(updated, member.Role)
	return &res, nil
}

// DeleteWorkspace soft-deletes a workspace (Owner only).
func (u *workspaceUsecase) DeleteWorkspace(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID) error {
	pgWSID := uuidToPgtype(workspaceID)
	pgUserID := uuidToPgtype(userID)

	member, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Workspace not found")
		}
		return domain.NewInternalError("Failed to check membership", err)
	}

	if !domain.HasPermission(member.Role, domain.PermWorkspaceDelete) {
		return domain.NewForbiddenError("Only the workspace owner can delete or archive the workspace")
	}

	_, err = u.queries.SoftDeleteWorkspace(ctx, pgWSID)
	if err != nil {
		return domain.NewInternalError("Failed to delete workspace", err)
	}

	return nil
}

// ListMembers lists all members of the workspace.
func (u *workspaceUsecase) ListMembers(ctx context.Context, userID uuid.UUID, workspaceID uuid.UUID) ([]domain.WorkspaceMemberResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgUserID := uuidToPgtype(userID)

	// Verify caller is a member
	_, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check membership", err)
	}

	rows, err := u.queries.ListWorkspaceMembers(ctx, pgWSID)
	if err != nil {
		return nil, domain.NewInternalError("Failed to list workspace members", err)
	}

	result := make([]domain.WorkspaceMemberResponse, 0, len(rows))
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

		result = append(result, domain.WorkspaceMemberResponse{
			ID:          pgtypeToUUID(r.ID),
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

// AddMember adds an existing registered user to the workspace.
func (u *workspaceUsecase) AddMember(ctx context.Context, actorID uuid.UUID, workspaceID uuid.UUID, input domain.AddMemberInput) (*domain.WorkspaceMemberResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgActorID := uuidToPgtype(actorID)

	targetRole := strings.ToLower(strings.TrimSpace(input.Role))
	if !domain.IsValidRole(targetRole) {
		return nil, domain.NewValidationError("Invalid member role. Must be 'admin', 'member', or 'viewer'", nil)
	}

	// 1. Verify actor permissions
	actorMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check membership", err)
	}

	if !domain.HasPermission(actorMember.Role, domain.PermMemberAdd) {
		return nil, domain.NewForbiddenError("You do not have permission to add members to this workspace")
	}

	// 2. Prevent privilege escalation
	if !domain.CanAssignRole(actorMember.Role, targetRole) {
		return nil, domain.NewForbiddenError(fmt.Sprintf("Your role '%s' cannot assign the '%s' role", actorMember.Role, targetRole))
	}

	// 3. Find target user by email
	targetEmail := strings.ToLower(strings.TrimSpace(input.Email))
	targetUser, err := u.queries.GetUserByEmail(ctx, targetEmail)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("No registered user found with this email address")
		}
		return nil, domain.NewInternalError("Failed to lookup user", err)
	}

	// 4. Check if user is already a member
	existingMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      targetUser.ID,
	})
	if err == nil && existingMember.ID.Valid {
		return nil, domain.NewConflictError("User is already a member of this workspace")
	}

	// 5. Insert membership
	created, err := u.queries.AddWorkspaceMember(ctx, repository.AddWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      targetUser.ID,
		Role:        targetRole,
	})
	if err != nil {
		if strings.Contains(err.Error(), "workspace_members_workspace_user_key") {
			return nil, domain.NewConflictError("User is already a member of this workspace")
		}
		return nil, domain.NewInternalError("Failed to add member to workspace", err)
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

	return &domain.WorkspaceMemberResponse{
		ID:          pgtypeToUUID(created.ID),
		WorkspaceID: pgtypeToUUID(created.WorkspaceID),
		UserID:      pgtypeToUUID(created.UserID),
		Role:        created.Role,
		Email:       targetUser.Email,
		Name:        namePtr,
		AvatarURL:   avatarPtr,
		CreatedAt:   created.CreatedAt.Time,
	}, nil
}

// UpdateMemberRole updates a member's role or coordinates ownership transfer.
func (u *workspaceUsecase) UpdateMemberRole(ctx context.Context, actorID uuid.UUID, workspaceID uuid.UUID, targetUserID uuid.UUID, newRole string) (*domain.WorkspaceMemberResponse, error) {
	pgWSID := uuidToPgtype(workspaceID)
	pgActorID := uuidToPgtype(actorID)
	pgTargetID := uuidToPgtype(targetUserID)

	targetRole := strings.ToLower(strings.TrimSpace(newRole))
	if !domain.IsValidRole(targetRole) {
		return nil, domain.NewValidationError("Invalid role", nil)
	}

	// 1. Verify actor membership & permission
	actorMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Workspace not found")
		}
		return nil, domain.NewInternalError("Failed to check membership", err)
	}

	if !domain.HasPermission(actorMember.Role, domain.PermMemberRoleChange) {
		return nil, domain.NewForbiddenError("You do not have permission to change member roles")
	}

	// 2. Verify target member exists
	targetMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgTargetID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("Member not found in this workspace")
		}
		return nil, domain.NewInternalError("Failed to lookup member", err)
	}

	// Prevent unauthorized role management
	if !domain.CanManageMember(actorMember.Role, targetMember.Role) {
		return nil, domain.NewForbiddenError("You cannot modify the role of this member")
	}

	// Privilege escalation prevention
	if !domain.CanAssignRole(actorMember.Role, targetRole) {
		return nil, domain.NewForbiddenError(fmt.Sprintf("Your role '%s' cannot assign the '%s' role", actorMember.Role, targetRole))
	}

	// 3. Special Case: Ownership Transfer (Target is being promoted to Owner)
	if targetRole == domain.RoleOwner {
		if actorMember.Role != domain.RoleOwner {
			return nil, domain.NewForbiddenError("Only the workspace owner can transfer ownership")
		}
		if actorID == targetUserID {
			return nil, domain.NewValidationError("You are already the workspace owner", nil)
		}
		// Approved Decision 3: Successor must be an existing Admin
		if targetMember.Role != domain.RoleAdmin {
			return nil, domain.NewValidationError("Ownership can only be transferred to an existing Admin. Please promote the user to Admin first.", nil)
		}

		// Execute Standalone Ownership Transfer (§8.4) in atomic transaction
		tx, err := u.pool.Begin(ctx)
		if err != nil {
			return nil, domain.NewInternalError("Failed to begin transaction", err)
		}
		defer tx.Rollback(ctx)

		qtx := u.queries.WithTx(tx)

		// 1. Lock workspace row
		_, err = qtx.GetWorkspaceByIDForUpdate(ctx, pgWSID)
		if err != nil {
			return nil, domain.NewInternalError("Failed to lock workspace row", err)
		}

		// 2. Lock both memberships in deterministic order to prevent deadlocks
		_, err = qtx.GetWorkspaceMembersForUpdateDeterministic(ctx, repository.GetWorkspaceMembersForUpdateDeterministicParams{
			WorkspaceID: pgWSID,
			UserID:      pgActorID,
			UserID_2:    pgTargetID,
		})
		if err != nil {
			return nil, domain.NewInternalError("Failed to lock membership rows", err)
		}

		// 3. Demote existing Owner to Admin
		_, err = qtx.UpdateWorkspaceMemberRole(ctx, repository.UpdateWorkspaceMemberRoleParams{
			WorkspaceID: pgWSID,
			UserID:      pgActorID,
			Role:        domain.RoleAdmin,
		})
		if err != nil {
			return nil, domain.NewInternalError("Failed to demote owner to admin", err)
		}

		// 4. Promote successor Admin to Owner
		updatedTarget, err := qtx.UpdateWorkspaceMemberRole(ctx, repository.UpdateWorkspaceMemberRoleParams{
			WorkspaceID: pgWSID,
			UserID:      pgTargetID,
			Role:        domain.RoleOwner,
		})
		if err != nil {
			return nil, domain.NewInternalError("Failed to promote successor to owner", err)
		}

		// 5. Update authoritative owner_id on workspaces table
		_, err = qtx.UpdateWorkspaceOwner(ctx, repository.UpdateWorkspaceOwnerParams{
			ID:      pgWSID,
			OwnerID: pgTargetID,
		})
		if err != nil {
			return nil, domain.NewInternalError("Failed to update workspace owner reference", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, domain.NewInternalError("Failed to commit ownership transfer", err)
		}

		user, _ := u.queries.GetUserByID(ctx, pgTargetID)
		var namePtr *string
		if user.Name.Valid {
			n := user.Name.String
			namePtr = &n
		}
		var avatarPtr *string
		if user.AvatarUrl.Valid {
			a := user.AvatarUrl.String
			avatarPtr = &a
		}

		return &domain.WorkspaceMemberResponse{
			ID:          pgtypeToUUID(updatedTarget.ID),
			WorkspaceID: pgtypeToUUID(updatedTarget.WorkspaceID),
			UserID:      pgtypeToUUID(updatedTarget.UserID),
			Role:        domain.RoleOwner,
			Email:       user.Email,
			Name:        namePtr,
			AvatarURL:   avatarPtr,
			CreatedAt:   updatedTarget.CreatedAt.Time,
		}, nil
	}

	// 4. Special Case: Owner cannot demote self without transferring ownership
	if targetMember.Role == domain.RoleOwner && targetRole != domain.RoleOwner {
		return nil, domain.NewValidationError("The workspace owner cannot demote themselves without transferring ownership to an admin first", nil)
	}

	// 5. Standard Role Update (e.g. member -> admin, admin -> member, viewer -> member)
	updated, err := u.queries.UpdateWorkspaceMemberRole(ctx, repository.UpdateWorkspaceMemberRoleParams{
		WorkspaceID: pgWSID,
		UserID:      pgTargetID,
		Role:        targetRole,
	})
	if err != nil {
		return nil, domain.NewInternalError("Failed to update member role", err)
	}

	user, _ := u.queries.GetUserByID(ctx, pgTargetID)
	var namePtr *string
	if user.Name.Valid {
		n := user.Name.String
		namePtr = &n
	}
	var avatarPtr *string
	if user.AvatarUrl.Valid {
		a := user.AvatarUrl.String
		avatarPtr = &a
	}

	return &domain.WorkspaceMemberResponse{
		ID:          pgtypeToUUID(updated.ID),
		WorkspaceID: pgtypeToUUID(updated.WorkspaceID),
		UserID:      pgtypeToUUID(updated.UserID),
		Role:        updated.Role,
		Email:       user.Email,
		Name:        namePtr,
		AvatarURL:   avatarPtr,
		CreatedAt:   updated.CreatedAt.Time,
	}, nil
}

// RemoveMember removes a member from the workspace after atomically unassigning any referencing tasks
// per DATABASE_SPECIFICATION §8.13.
func (u *workspaceUsecase) RemoveMember(ctx context.Context, actorID uuid.UUID, workspaceID uuid.UUID, targetUserID uuid.UUID) error {
	pgWSID := uuidToPgtype(workspaceID)
	pgActorID := uuidToPgtype(actorID)
	pgTargetID := uuidToPgtype(targetUserID)

	// 1. Verify actor membership
	actorMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgActorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Workspace not found")
		}
		return domain.NewInternalError("Failed to check membership", err)
	}

	// 2. Verify target membership
	targetMember, err := u.queries.GetWorkspaceMember(ctx, repository.GetWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgTargetID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewNotFoundError("Member not found in this workspace")
		}
		return domain.NewInternalError("Failed to lookup member", err)
	}

	// 3. Self-removal vs. Removing another member
	if actorID == targetUserID {
		// Owner protection: Last owner cannot leave without transferring ownership first (Decision 3 & §8.15)
		if targetMember.Role == domain.RoleOwner {
			return domain.NewValidationError("The workspace owner cannot leave the workspace without transferring ownership to an admin first", nil)
		}
	} else {
		// Removing someone else requires PermMemberRemove and hierarchy check
		if !domain.HasPermission(actorMember.Role, domain.PermMemberRemove) {
			return domain.NewForbiddenError("You do not have permission to remove members from this workspace")
		}
		if !domain.CanManageMember(actorMember.Role, targetMember.Role) {
			return domain.NewForbiddenError("You cannot remove this member")
		}
	}

	if u.pool == nil {
		return domain.NewInternalError("Database pool not available", nil)
	}

	// 4. Atomic Member Removal Transaction (§8.13)
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return domain.NewInternalError("Failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	qtx := u.queries.WithTx(tx)

	// Step A: Lock workspace_members row
	_, err = qtx.GetWorkspaceMemberForUpdate(ctx, repository.GetWorkspaceMemberForUpdateParams{
		WorkspaceID: pgWSID,
		UserID:      pgTargetID,
	})
	if err != nil {
		return domain.NewInternalError("Failed to lock member row", err)
	}

	// Step B: Unassign all referencing tasks (active and soft-deleted) in this workspace
	_, err = qtx.UnassignTasksForDepartingMember(ctx, repository.UnassignTasksForDepartingMemberParams{
		WorkspaceID: pgWSID,
		AssigneeID:  pgTargetID,
	})
	if err != nil {
		return domain.NewInternalError("Failed to unassign tasks for member", err)
	}

	// Step C: Delete workspace membership (cascades to project_members via composite FK)
	_, err = qtx.DeleteWorkspaceMember(ctx, repository.DeleteWorkspaceMemberParams{
		WorkspaceID: pgWSID,
		UserID:      pgTargetID,
	})
	if err != nil {
		return domain.NewInternalError("Failed to delete workspace member", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.NewInternalError("Failed to commit member removal", err)
	}

	return nil
}
