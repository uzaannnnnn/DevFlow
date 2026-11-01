-- Revert workspace_members role domain to ('owner', 'admin', 'member')
-- Demote any 'viewer' roles to 'member' before restoring the restrictive check constraint
UPDATE workspace_members SET role = 'member' WHERE role = 'viewer';

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'admin', 'member'));

-- Remove description column from workspaces table
ALTER TABLE workspaces DROP COLUMN IF EXISTS description;
