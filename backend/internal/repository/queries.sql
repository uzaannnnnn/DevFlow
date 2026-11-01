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
-- Project Queries
-- ============================================================================

-- name: CreateProject :one
INSERT INTO projects (
    workspace_id,
    key,
    name,
    description,
    task_counter,
    created_by
) VALUES (
    $1, $2, $3, $4, 0, $5
)
RETURNING *;

-- name: GetProjectByID :one
SELECT * FROM projects
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;

-- name: GetProjectByIDForUpdate :one
SELECT * FROM projects
WHERE id = $1 AND deleted_at IS NULL
FOR UPDATE LIMIT 1;

-- name: GetProjectByWorkspaceAndKey :one
SELECT * FROM projects
WHERE workspace_id = $1 AND lower(key) = lower($2) AND deleted_at IS NULL LIMIT 1;

-- name: ListProjectsByWorkspaceAndUser :many
SELECT
    p.id,
    p.workspace_id,
    p.key,
    p.name,
    p.description,
    p.task_counter,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.deleted_at,
    pm.role as member_role,
    (SELECT count(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count
FROM projects p
JOIN project_members pm ON p.id = pm.project_id
WHERE p.workspace_id = $1
  AND pm.user_id = $2
  AND p.deleted_at IS NULL
  AND (
      sqlc.narg('search')::text IS NULL OR
      p.name ILIKE '%' || sqlc.narg('search')::text || '%' OR
      p.key ILIKE '%' || sqlc.narg('search')::text || '%'
  )
ORDER BY p.created_at DESC;

-- name: UpdateProject :one
UPDATE projects
SET
    name = coalesce(sqlc.narg('name'), name),
    description = coalesce(sqlc.narg('description'), description),
    updated_at = now()
WHERE id = sqlc.arg('id') AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProject :one
UPDATE projects
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- ============================================================================
-- Project Members Queries
-- ============================================================================

-- name: AddProjectMember :one
INSERT INTO project_members (
    project_id,
    workspace_id,
    user_id,
    role
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: GetProjectMember :one
SELECT * FROM project_members
WHERE project_id = $1 AND user_id = $2 LIMIT 1;

-- name: GetProjectMemberForUpdate :one
SELECT * FROM project_members
WHERE project_id = $1 AND user_id = $2
FOR UPDATE LIMIT 1;

-- name: ListProjectMembers :many
SELECT
    pm.id,
    pm.project_id,
    pm.workspace_id,
    pm.user_id,
    pm.role,
    pm.created_at,
    u.email,
    u.name as user_name,
    u.avatar_url
FROM project_members pm
JOIN users u ON pm.user_id = u.id
WHERE pm.project_id = $1
ORDER BY pm.created_at ASC;

-- name: UpdateProjectMemberRole :one
UPDATE project_members
SET role = $3
WHERE project_id = $1 AND user_id = $2
RETURNING *;

-- name: DeleteProjectMember :one
DELETE FROM project_members
WHERE project_id = $1 AND user_id = $2
RETURNING *;

-- name: CountProjectOwners :one
SELECT count(*) FROM project_members
WHERE project_id = $1 AND role = 'owner';

-- name: UnassignTasksForDepartingProjectMember :many
UPDATE tasks
SET assignee_id = NULL, updated_at = now()
WHERE project_id = $1 AND assignee_id = $2
RETURNING id;

-- name: LockTasksForDepartingProjectMember :many
SELECT id FROM tasks
WHERE project_id = $1 AND assignee_id = $2
ORDER BY id
FOR UPDATE;

-- name: UnassignTasksAndLogForDepartingMember :many
WITH unassigned_tasks AS (
    UPDATE tasks
    SET assignee_id = NULL, updated_at = now()
    WHERE tasks.project_id = sqlc.arg(project_id) AND tasks.assignee_id = sqlc.arg(assignee_id)::uuid
    RETURNING id, tasks.project_id
)
INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
SELECT gen_random_uuid(), u.project_id, u.id, sqlc.arg(actor_id), 'task_unassigned',
       jsonb_build_object('unassigned_user_id', sqlc.arg(assignee_id)::text), now()
FROM unassigned_tasks u
RETURNING task_id;

-- ============================================================================
-- Task Basic Stubs
-- ============================================================================

-- name: GetTaskByID :one
SELECT * FROM tasks
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;
