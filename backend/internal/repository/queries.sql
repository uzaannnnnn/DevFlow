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
-- Task Management Queries
-- ============================================================================

-- name: IncrementProjectTaskCounter :one
UPDATE projects
SET task_counter = task_counter + 1, updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING task_counter, key;

-- name: LockProjectMemberForKeyShare :one
SELECT id, project_id, workspace_id, user_id, role, created_at FROM project_members
WHERE project_id = $1 AND user_id = $2
FOR KEY SHARE LIMIT 1;

-- name: CreateTask :one
INSERT INTO tasks (
    id, project_id, identifier, title, description,
    status, priority, assignee_id, due_date, created_by,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now()
)
RETURNING *;

-- name: CreateTaskActivityLog :one
INSERT INTO activity_logs (
    id, project_id, task_id, actor_id, action, metadata, created_at
) VALUES (
    gen_random_uuid(), $1, $2, $3, $4, $5, now()
)
RETURNING *;

-- name: GetTaskByID :one
SELECT
    t.id,
    t.project_id,
    t.identifier,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.assignee_id,
    t.due_date,
    t.created_by,
    t.created_at,
    t.updated_at,
    t.deleted_at,
    u_assignee.email as assignee_email,
    u_assignee.name as assignee_name,
    u_assignee.avatar_url as assignee_avatar_url,
    u_creator.email as creator_email,
    u_creator.name as creator_name,
    u_creator.avatar_url as creator_avatar_url
FROM tasks t
LEFT JOIN users u_assignee ON t.assignee_id = u_assignee.id
JOIN users u_creator ON t.created_by = u_creator.id
WHERE t.id = $1 AND t.deleted_at IS NULL
LIMIT 1;

-- name: GetTaskByIDForUpdate :one
SELECT * FROM tasks
WHERE id = $1 AND deleted_at IS NULL
FOR UPDATE LIMIT 1;

-- name: ListTasksByProject :many
SELECT
    t.id,
    t.project_id,
    t.identifier,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.assignee_id,
    t.due_date,
    t.created_by,
    t.created_at,
    t.updated_at,
    t.deleted_at,
    u_assignee.email as assignee_email,
    u_assignee.name as assignee_name,
    u_assignee.avatar_url as assignee_avatar_url,
    u_creator.email as creator_email,
    u_creator.name as creator_name,
    u_creator.avatar_url as creator_avatar_url
FROM tasks t
LEFT JOIN users u_assignee ON t.assignee_id = u_assignee.id
JOIN users u_creator ON t.created_by = u_creator.id
WHERE t.project_id = $1
  AND t.deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR t.status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR t.priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR t.assignee_id = sqlc.narg('assignee_id'))
  AND (
      sqlc.narg('search')::text IS NULL OR
      t.title ILIKE '%' || sqlc.narg('search')::text || '%' OR
      t.identifier ILIKE '%' || sqlc.narg('search')::text || '%'
  )
ORDER BY t.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountTasksByProject :one
SELECT count(*)
FROM tasks t
WHERE t.project_id = $1
  AND t.deleted_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR t.status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR t.priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR t.assignee_id = sqlc.narg('assignee_id'))
  AND (
      sqlc.narg('search')::text IS NULL OR
      t.title ILIKE '%' || sqlc.narg('search')::text || '%' OR
      t.identifier ILIKE '%' || sqlc.narg('search')::text || '%'
  );

-- name: UpdateTask :one
UPDATE tasks
SET
    title = coalesce(sqlc.narg('title'), title),
    description = CASE
        WHEN sqlc.arg('set_description')::boolean THEN sqlc.narg('description')
        ELSE description
    END,
    status = coalesce(sqlc.narg('status'), status),
    priority = coalesce(sqlc.narg('priority'), priority),
    assignee_id = CASE
        WHEN sqlc.arg('set_assignee')::boolean THEN sqlc.narg('assignee_id')
        ELSE assignee_id
    END,
    due_date = CASE
        WHEN sqlc.arg('set_due_date')::boolean THEN sqlc.narg('due_date')
        ELSE due_date
    END,
    updated_at = now()
WHERE id = sqlc.arg('id') AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteTask :one
UPDATE tasks
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: LockTaskForKeyShare :one
SELECT id, project_id, identifier, title, deleted_at
FROM tasks
WHERE id = $1 AND deleted_at IS NULL
FOR KEY SHARE;

-- name: CreateComment :one
INSERT INTO comments (
    id, task_id, author_id, body, created_at, updated_at
) VALUES (
    gen_random_uuid(), $1, $2, $3, now(), now()
)
RETURNING *;

-- name: GetCommentByID :one
SELECT
    c.id,
    c.task_id,
    c.author_id,
    c.body,
    c.created_at,
    c.updated_at,
    c.deleted_at,
    u.email as author_email,
    u.name as author_name,
    u.avatar_url as author_avatar_url,
    t.project_id
FROM comments c
JOIN users u ON c.author_id = u.id
JOIN tasks t ON c.task_id = t.id
WHERE c.id = $1
  AND c.deleted_at IS NULL
  AND t.deleted_at IS NULL
LIMIT 1;

-- name: GetCommentByIDForUpdate :one
SELECT
    c.id,
    c.task_id,
    c.author_id,
    c.body,
    c.created_at,
    c.updated_at,
    c.deleted_at,
    t.project_id
FROM comments c
JOIN tasks t ON c.task_id = t.id
WHERE c.id = $1
  AND c.deleted_at IS NULL
  AND t.deleted_at IS NULL
FOR UPDATE OF c
LIMIT 1;

-- name: ListCommentsByTask :many
SELECT
    c.id,
    c.task_id,
    c.author_id,
    c.body,
    c.created_at,
    c.updated_at,
    c.deleted_at,
    u.email as author_email,
    u.name as author_name,
    u.avatar_url as author_avatar_url
FROM comments c
JOIN users u ON c.author_id = u.id
JOIN tasks t ON c.task_id = t.id
WHERE c.task_id = $1
  AND c.deleted_at IS NULL
  AND t.deleted_at IS NULL
ORDER BY c.created_at ASC, c.id ASC
LIMIT $2 OFFSET $3;

-- name: CountCommentsByTask :one
SELECT count(*)
FROM comments c
JOIN tasks t ON c.task_id = t.id
WHERE c.task_id = $1
  AND c.deleted_at IS NULL
  AND t.deleted_at IS NULL;

-- name: UpdateComment :one
UPDATE comments
SET body = $2, updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteComment :one
UPDATE comments
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: ListActivitiesByProject :many
SELECT
    a.id,
    a.project_id,
    a.task_id,
    a.actor_id,
    a.action,
    a.metadata,
    a.created_at,
    u.email as actor_email,
    u.name as actor_name,
    u.avatar_url as actor_avatar_url,
    t.identifier as task_identifier,
    t.title as task_title
FROM activity_logs a
JOIN users u ON a.actor_id = u.id
LEFT JOIN tasks t ON a.task_id = t.id
WHERE a.project_id = $1
ORDER BY a.created_at DESC, a.id DESC
LIMIT $2 OFFSET $3;

-- name: CountActivitiesByProject :one
SELECT count(*)
FROM activity_logs a
WHERE a.project_id = $1;

-- name: ListActivitiesByTask :many
SELECT
    a.id,
    a.project_id,
    a.task_id,
    a.actor_id,
    a.action,
    a.metadata,
    a.created_at,
    u.email as actor_email,
    u.name as actor_name,
    u.avatar_url as actor_avatar_url,
    t.identifier as task_identifier,
    t.title as task_title
FROM activity_logs a
JOIN users u ON a.actor_id = u.id
JOIN tasks t ON a.task_id = t.id
WHERE a.task_id = $1
ORDER BY a.created_at DESC, a.id DESC
LIMIT $2 OFFSET $3;

-- name: CountActivitiesByTask :one
SELECT count(*)
FROM activity_logs a
WHERE a.task_id = $1;
