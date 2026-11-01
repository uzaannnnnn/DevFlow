-- Revert: Check whether any project has multiple members before recreating the legacy unique index.
-- If multiple members exist, abort the rollback with an error to prevent data loss.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM project_members
        GROUP BY project_id, workspace_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot rollback migration 000003: multi-member projects exist. Data deletion prohibited.';
    END IF;
END $$;

DROP INDEX IF EXISTS project_members_project_workspace_idx;

CREATE UNIQUE INDEX project_members_project_workspace_key
    ON project_members(project_id, workspace_id);
