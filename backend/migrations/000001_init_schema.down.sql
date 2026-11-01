-- ==============================================================================
-- DevFlow MVP Database Schema Reversal (000001_init_schema.down.sql)
-- Drops all 10 core tables in reverse dependency order.
-- ==============================================================================

DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS workspace_invitations CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS refresh_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

