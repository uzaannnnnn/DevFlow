-- ==============================================================================
-- DevFlow MVP Database Schema Migration (000001_init_schema.up.sql)
-- Target: PostgreSQL 14+ (UUID native functions, JSONB, composite FKs)
-- 10 Core Tables: users, refresh_sessions, workspaces, workspace_members,
--                 workspace_invitations, projects, project_members, tasks,
--                 comments, activity_logs.
-- Excluded: password_reset_tokens (deferred to POST-MVP)
-- ==============================================================================

-- 1. Users Table
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) NOT NULL,
    password_hash varchar(255) NOT NULL,
    name varchar(255),
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users(email);
CREATE UNIQUE INDEX users_email_ci_idx ON users(lower(email));

-- 2. Refresh Sessions Table
CREATE TABLE refresh_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash varchar(255) NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX refresh_sessions_token_hash_key ON refresh_sessions(token_hash);
CREATE INDEX refresh_sessions_user_id_idx ON refresh_sessions(user_id);
CREATE INDEX refresh_sessions_expires_at_idx ON refresh_sessions(expires_at);
CREATE INDEX refresh_sessions_active_idx ON refresh_sessions(revoked_at, expires_at)
    WHERE revoked_at IS NULL;

-- 3. Workspaces Table
CREATE TABLE workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    slug varchar(255),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE UNIQUE INDEX workspaces_slug_key ON workspaces(slug);
CREATE INDEX workspaces_owner_id_idx ON workspaces(owner_id);
CREATE INDEX workspaces_deleted_at_idx ON workspaces(deleted_at);
CREATE INDEX workspaces_active_idx ON workspaces(id) WHERE deleted_at IS NULL;

-- 4. Workspace Members Table
CREATE TABLE workspace_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role varchar(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX workspace_members_workspace_user_key ON workspace_members(workspace_id, user_id);
CREATE UNIQUE INDEX workspace_members_owner_partial_key ON workspace_members(workspace_id) WHERE role = 'owner';
CREATE INDEX workspace_members_workspace_id_idx ON workspace_members(workspace_id);
CREATE INDEX workspace_members_user_id_idx ON workspace_members(user_id);

-- 5. Workspace Invitations Table
CREATE TABLE workspace_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email varchar(255) NOT NULL,
    token_hash varchar(255) NOT NULL,
    invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX workspace_invitations_token_hash_key ON workspace_invitations(token_hash);
CREATE INDEX workspace_invitations_workspace_id_idx ON workspace_invitations(workspace_id);
CREATE INDEX workspace_invitations_email_idx ON workspace_invitations(email);
CREATE INDEX workspace_invitations_active_idx ON workspace_invitations(accepted_at, revoked_at, expires_at)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- 6. Projects Table
CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key varchar(10) NOT NULL,
    name varchar(255) NOT NULL,
    description text,
    task_counter int NOT NULL DEFAULT 0 CHECK (task_counter >= 0),
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE UNIQUE INDEX projects_workspace_id_key_key ON projects(workspace_id, key);
CREATE UNIQUE INDEX projects_id_workspace_id_key ON projects(id, workspace_id);
CREATE INDEX projects_workspace_id_idx ON projects(workspace_id);
CREATE INDEX projects_created_by_idx ON projects(created_by);
CREATE INDEX projects_deleted_at_idx ON projects(deleted_at);
CREATE INDEX projects_active_idx ON projects(id) WHERE deleted_at IS NULL;

-- 7. Project Members Table
CREATE TABLE project_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role varchar(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_members_project_workspace_fk
        FOREIGN KEY (project_id, workspace_id)
        REFERENCES projects(id, workspace_id) ON DELETE CASCADE,
    CONSTRAINT project_members_workspace_membership_fk
        FOREIGN KEY (workspace_id, user_id)
        REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX project_members_project_user_key ON project_members(project_id, user_id);
CREATE UNIQUE INDEX project_members_project_workspace_key ON project_members(project_id, workspace_id);
CREATE INDEX project_members_project_id_idx ON project_members(project_id);
CREATE INDEX project_members_user_id_idx ON project_members(user_id);
CREATE INDEX project_members_workspace_user_idx ON project_members(workspace_id, user_id);

-- 8. Tasks Table
CREATE TABLE tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    identifier varchar(30) NOT NULL,
    title varchar(255) NOT NULL,
    description text,
    status varchar(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    priority varchar(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assignee_id uuid,
    due_date timestamptz,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT tasks_assignee_membership_fk
        FOREIGN KEY (project_id, assignee_id)
        REFERENCES project_members(project_id, user_id) ON DELETE RESTRICT,
    CONSTRAINT tasks_assignee_user_fk
        FOREIGN KEY (assignee_id)
        REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX tasks_project_identifier_key ON tasks(project_id, identifier);
CREATE INDEX tasks_project_id_idx ON tasks(project_id);
CREATE INDEX tasks_deleted_at_idx ON tasks(deleted_at);
CREATE INDEX tasks_project_status_idx ON tasks(project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX tasks_assignee_id_idx ON tasks(assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_due_date_idx ON tasks(due_date) WHERE deleted_at IS NULL AND status != 'done';

-- 9. Comments Table
CREATE TABLE comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX comments_task_created_idx ON comments(task_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX comments_author_id_idx ON comments(author_id);
CREATE INDEX comments_deleted_at_idx ON comments(deleted_at);

-- 10. Activity Logs Table
CREATE TABLE activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action varchar(50) NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_logs_project_id_idx ON activity_logs(project_id, created_at DESC);
CREATE INDEX activity_logs_task_id_idx ON activity_logs(task_id);
CREATE INDEX activity_logs_actor_id_idx ON activity_logs(actor_id);
CREATE INDEX activity_logs_created_at_idx ON activity_logs(created_at DESC);
