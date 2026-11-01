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

-- name: GetWorkspaceByID :one
SELECT * FROM workspaces
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;

-- name: GetProjectByID :one
SELECT * FROM projects
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;

-- name: GetTaskByID :one
SELECT * FROM tasks
WHERE id = $1 AND deleted_at IS NULL LIMIT 1;
