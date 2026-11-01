-- Drop erroneous unique index that prevented having more than one member per project
DROP INDEX IF EXISTS project_members_project_workspace_key;

-- Recreate as standard non-unique B-tree index
CREATE INDEX IF NOT EXISTS project_members_project_workspace_idx
    ON project_members(project_id, workspace_id);
