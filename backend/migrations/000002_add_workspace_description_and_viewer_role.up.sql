-- Add optional description column to workspaces table
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description text;

-- Extend workspace_members role domain to include 'viewer'
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

