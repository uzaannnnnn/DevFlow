-- Foundational database queries for DevFlow
-- Used by sqlc to generate type-safe models and Querier interface.

-- name: Ping :one
SELECT 1 AS ready;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 LIMIT 1;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE lower(email) = lower($1) LIMIT 1;

-- name: CreateUser :one
INSERT INTO users (
    email,
    password_hash,
    name,
    avatar_url
) VALUES (
    lower($1),
    $2,
    $3,
    $4
) RETURNING *;

-- name: CreateRefreshSession :one
INSERT INTO refresh_sessions (
    user_id,
    token_hash,
    expires_at
) VALUES (
    $1,
    $2,
    $3
) RETURNING *;

-- name: GetRefreshSessionByTokenHash :one
SELECT * FROM refresh_sessions
WHERE token_hash = $1 LIMIT 1;

-- name: GetRefreshSessionByTokenHashForUpdate :one
SELECT * FROM refresh_sessions
WHERE token_hash = $1
FOR UPDATE LIMIT 1;

-- name: RevokeRefreshSessionByTokenHash :one
UPDATE refresh_sessions
SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL
RETURNING *;

-- name: RevokeRefreshSessionByID :one
UPDATE refresh_sessions
SET revoked_at = now()
WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
RETURNING *;

-- name: RevokeAllUserRefreshSessions :exec
UPDATE refresh_sessions
SET revoked_at = now()
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: ListActiveUserRefreshSessions :many
SELECT * FROM refresh_sessions
WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
ORDER BY created_at DESC;

-- ============================================================================
-- Workspace Queries
-- ============================================================================

-- name: CreateWorkspace :one
INSERT INTO workspaces (
    name,
    slug,
    description,
    owner_id
) VALUES (
    $1,
    $2,
    $3,
    $4
) RETURNING *;

-- name: GetWorkspaceByID :one
SELECT * FROM workspaces
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;

-- name: GetWorkspaceByIDForUpdate :one
SELECT * FROM workspaces
WHERE id = $1 AND deleted_at IS NULL
FOR UPDATE LIMIT 1;

-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces
WHERE lower(slug) = lower($1) AND deleted_at IS NULL LIMIT 1;

-- name: ListWorkspacesByUserID :many
SELECT 
    w.id,
    w.name,
    w.slug,
    w.description,
    w.owner_id,
    w.created_at,
    w.updated_at,
    w.deleted_at,
    wm.role as member_role
FROM workspaces w
JOIN workspace_members wm ON w.id = wm.workspace_id
WHERE wm.user_id = $1 AND w.deleted_at IS NULL
ORDER BY w.created_at DESC;

-- name: UpdateWorkspace :one
UPDATE workspaces
SET 
    name = coalesce(sqlc.narg('name'), name),
    slug = coalesce(sqlc.narg('slug'), slug),
    description = coalesce(sqlc.narg('description'), description),
    updated_at = now()
WHERE id = sqlc.arg('id') AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteWorkspace :one
UPDATE workspaces
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateWorkspaceOwner :one
UPDATE workspaces
SET owner_id = $2, updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- ============================================================================
-- Workspace Members Queries
-- ============================================================================

-- name: AddWorkspaceMember :one
INSERT INTO workspace_members (
    workspace_id,
    user_id,
    role
) VALUES (
    $1,
    $2,
    $3
) RETURNING *;

-- name: GetWorkspaceMember :one
SELECT * FROM workspace_members
WHERE workspace_id = $1 AND user_id = $2 LIMIT 1;

-- name: GetWorkspaceMemberForUpdate :one
SELECT * FROM workspace_members
WHERE workspace_id = $1 AND user_id = $2
FOR UPDATE LIMIT 1;

-- name: GetWorkspaceMembersForUpdateDeterministic :many
SELECT user_id, role
FROM workspace_members
WHERE workspace_id = $1
  AND user_id IN ($2, $3)
ORDER BY user_id
FOR UPDATE;

-- name: ListWorkspaceMembers :many
SELECT 
    wm.id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.created_at,
    u.email,
    u.name as user_name,
    u.avatar_url
FROM workspace_members wm
JOIN users u ON wm.user_id = u.id
WHERE wm.workspace_id = $1
ORDER BY wm.created_at ASC;

-- name: UpdateWorkspaceMemberRole :one
UPDATE workspace_members
SET role = $3
WHERE workspace_id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteWorkspaceMember :one
DELETE FROM workspace_members
WHERE workspace_id = $1 AND user_id = $2
RETURNING *;

-- name: CountWorkspaceOwners :one
SELECT count(*)::bigint FROM workspace_members
WHERE workspace_id = $1 AND role = 'owner';

-- name: UnassignTasksForDepartingMember :many
UPDATE tasks t
SET assignee_id = NULL, updated_at = now()
FROM projects p
WHERE t.project_id = p.id
  AND p.workspace_id = $1
  AND t.assignee_id = $2
RETURNING t.id, t.project_id;

-- ============================================================================
-- Project and Task Basic Stubs
-- ============================================================================

-- name: GetProjectByID :one
SELECT * FROM projects
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;

-- name: GetTaskByID :one
SELECT * FROM tasks
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;
