# DevFlow — Product Requirements Document (PRD)

## 1. Product Overview

**Name:** DevFlow  
**Vision:** Make project management simple, transparent, and accessible for every team.  
**Description:** A web-based project management and team collaboration platform enabling users to organize workspaces, manage projects, assign tasks, monitor progress, and collaborate through comments and activity tracking. Inspired by Linear (interface), Trello (Kanban), and Jira (structure), but simpler and more accessible than enterprise platforms.

**Target users:** individuals, freelancers, startup teams, software development teams, project managers, small businesses. Must support both individual usage and team collaboration.

## 2. Access Model

- All workspaces are private by default.
- Only authorized workspace members can access workspace resources.
- Projects have their own membership controls. Access to project contents follows project membership authorization rules.
- Workspace Admin membership does NOT automatically grant unrestricted access to every project.

## 3. Modules

### Module A — Authentication & Account Management

- User registration
- Email/password login
- Logout
- Access token generation (JWT, short-lived ~10–15 min)
- Refresh token rotation
- Session management
- User profile retrieval and updates
- Password reset design (POST-MVP / Deferred: architectural design documented; endpoints and runtime deferred)
- Session revocation

**Security:** Argon2id password hashing; refresh tokens hashed in DB; refresh token rotation; refresh token reuse detection; session revocation; login and refresh rate limiting; CSRF protection for cookie-backed auth endpoints; no sensitive credentials in logs.

### Module B — Workspace Management

- Create workspace
- List accessible workspaces
- Update workspace information
- Invite members by email
- Accept/reject/revoke invitations
- Manage workspace roles
- Remove members
- Archive workspace

**Workspace roles:** Owner, Admin, Member.

### Module C — Project Management

- Create project
- List accessible projects
- View project details
- Update project information
- Archive project
- Manage project members
- Search and filter projects

Project membership must be explicitly represented in the database.

### Module D — Task Management

- Create, view, update, delete task
- Assign task
- Change priority, status, due date
- Search, filter, sort tasks
- Generate task identifiers

**Task fields:** UUID, identifier, title, description, status, priority, assignee, due date, project reference, created by, created at, updated at.

**Task statuses:** Todo, In Progress, Review, Done.  
**Task priorities:** Low, Medium, High, Urgent.

**Business rules:** assignees must be project members; tasks belong to a valid project; no data exposure to unauthorized users; task deletion must not unintentionally destroy historical activity information.

### Module E — Kanban & Collaboration

**Kanban:** four status columns (Todo, In Progress, Review, Done); drag-and-drop task movement; backend persistence; optimistic UI updates; rollback on failure; activity tracking for status changes.

**Collaboration:** create, edit (own), delete (own), view comments; track project and task activities.

**Activity examples:** project created, task created/updated, task status changed, priority changed, assignee changed, due date changed, comment added, project member added/removed. Activity records are append-only for normal application users.

### Module F — Dashboard

- Total projects
- Total tasks
- Task distribution by status
- My assigned tasks
- Overdue tasks (exclude completed)
- Recent activities
- Project progress

**Progress:** Completed Tasks / Total Tasks × 100%. Zero when no tasks exist. Overdue tasks exclude completed tasks.

## 4. Role & Authorization Design

Workspace roles (Owner, Admin, Member) and project membership are separate authorization dimensions. Every sensitive backend operation independently validates authorization; frontend visibility is never the sole enforcement.

Explicit rules for: workspace access, project access, project membership management, task access, task assignment, comment modification, activity log access, invitation management, ownership transfer.

## 5. Decision Governance & Architectural Decisions

DevFlow explicitly distinguishes between **APPROVED architectural decisions** (binding for design and implementation) and **PROPOSED future recommendations**:

- **Approved Architectural Decisions:** All six foundational decisions documented in `OPEN_DECISIONS.md` (Decisions 1 through 6) are formally **APPROVED** and binding for all sprints:
  1. **Decision 1 (Task Identifier):** APPROVED — Option A (Project-specific identifier, e.g. `DEV-001`, sequential counter on `projects`, `varchar(30)` column).
  2. **Decision 2 (Task Deletion):** APPROVED — Option A (Soft deletion with `deleted_at timestamptz`).
  3. **Decision 3 (Workspace Ownership):** APPROVED — Option A (Ownership transfer required before leaving; eligible successor must be an existing Admin; atomic single-transaction voluntary departure).
  4. **Decision 4 (Invitations):** APPROVED — Option A (Email-bound single-use SHA-256 token hash).
  5. **Decision 5 (Task Visibility):** APPROVED — Option A (Project members only; workspace Admin does not bypass project boundary).
  6. **Decision 6 (Project Key / Identifier Prefix):** APPROVED — Option A (Immutable `key varchar(10)` on `projects`, unique per workspace).

- **Proposed Recommendations:** Any prospective features, deferred enhancements (such as runtime password reset or email provider selection), or tentative suggestions outside the six approved decisions above are classified as **PROPOSED recommendations**. They are non-binding and require formal review before implementation.

## 6. Out of Scope (MVP)

- Password reset implementation and runtime endpoints (deferred to POST-MVP; architectural design documented, no MVP endpoints; `password_reset_tokens` table excluded from initial MVP migrations)
- Microservices
- Public workspaces/projects
- Real-time WebSocket collaboration (activity is pull-based via REST)
- File attachments
- Email delivery infrastructure (invitations designed but provider TBD)
- Mobile applications
- SSO / social login
