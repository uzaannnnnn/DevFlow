# DevFlow — Database Specification

## 1. Minimum PostgreSQL Version

**PostgreSQL 14+**. `gen_random_uuid()` is built-in since PostgreSQL 13; all features used (UUID PKs, partial indexes, composite foreign keys, `timestamptz`, `jsonb`) are available on PostgreSQL 14+. No pgcrypto extension is required for `gen_random_uuid()`.

## 2. Database Design Principles

- **UUID primary keys** throughout (`gen_random_uuid()`). No surrogate integer IDs.
- **PostgreSQL-native types**: `uuid`, `timestamptz`, `varchar`, `text`, `jsonb`, `int`.
- **Timestamps**: `created_at` and `updated_at` default to `now()`; `timestamptz` for all time columns.
- **Soft deletion**: `deleted_at` nullable `timestamptz` on tasks, workspaces, projects, and comments. Default queries exclude soft-deleted rows. Activity logs are append-only (no `deleted_at`).
- **Hashes, never plaintext**: password hashes (Argon2id), refresh token hashes (SHA-256), invitation token hashes (SHA-256), password reset token hashes (SHA-256).
- **Composite foreign keys** where they enforce cross-workspace/project consistency at the database level.
- **Check constraints** for enumerated values (role, status, priority).
- **No ORM**: raw SQL via pgx and sqlc-generated queries. DDL managed by golang-migrate (migration files created in Sprint 1, not here).
- **No `now()` in index predicates**: partial index predicates use immutable column conditions only; time-based expiration is checked in query-time `WHERE` clauses.
- **No column-list `SET NULL` on composite FKs**: PostgreSQL column-list `SET NULL` (PG 15+) would attempt to NULL non-null columns; use single-column FKs with `SET NULL` plus composite FKs with `RESTRICT` instead.

## 3. Entity Descriptions

| # | Table | Purpose |
|---|-------|---------|
| 1 | `users` | Registered accounts; stores email and Argon2id password hash |
| 2 | `refresh_sessions` | Rotating refresh token sessions (hashed tokens); supports expiration, revocation, rotation |
| 3 | `password_reset_tokens` | Time-limited, single-use password reset tokens (hashed) — **POST-MVP / DEFERRED (excluded from initial MVP migrations)** |
| 4 | `workspaces` | Team/organization containers; private by default; has exactly one Owner |
| 5 | `workspace_members` | User ↔ workspace membership + role; one membership per user per workspace; at most one Owner per workspace |
| 6 | `workspace_invitations` | Pending email-bound invitations to a workspace; token hash, single-use, expires |
| 7 | `projects` | Workspace-scoped projects; has `task_counter` and immutable `key` for project-specific identifiers |
| 8 | `project_members` | User ↔ project membership + role; member must be a workspace member; one membership per user per project |
| 9 | `tasks` | Work items within a project; project-scoped identifier; soft-deleted |
| 10 | `comments` | Task comments; references valid task and author; soft-deleted |
| 11 | `activity_logs` | Append-only audit trail of project/task events; references actor and relevant resources |

No additional tables are required for the MVP. Note: The MVP active schema consists of 10 tables (tables 1–2 and 4–11); table 3 (`password_reset_tokens`) is architecturally specified but deferred to a future post-MVP release and excluded from initial Sprint 1 migrations.

## 4. Complete Table Specifications

### 4.1 `users`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| email | varchar(255) | NOT NULL | | UQ | Unique; login identifier |
| password_hash | varchar(255) | NOT NULL | | | Argon2id hash; never plaintext |
| name | varchar(255) | NULL | | | Display name |
| avatar_url | text | NULL | | | Profile picture URL |
| created_at | timestamptz | NOT NULL | `now()` | | Record creation time |
| updated_at | timestamptz | NOT NULL | `now()` | | Last update time |

**Indexes:**
- `users_email_key` — UNIQUE on `email`
- `users_email_ci_idx` — UNIQUE on `lower(email)` (case-insensitive lookup)

**Constraints:** PK + unique email.

---

### 4.2 `refresh_sessions`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| user_id | uuid | NOT NULL | | FK → users(id) | Session belongs to a user |
| token_hash | varchar(255) | NOT NULL | | UQ | SHA-256 hash of refresh token; never plaintext |
| expires_at | timestamptz | NOT NULL | | | Session expiration; checked at query time |
| revoked_at | timestamptz | NULL | | | NULL = active; set on logout, rotation, or reuse detection |
| created_at | timestamptz | NOT NULL | `now()` | | Session creation time |

**Indexes:**
- `refresh_sessions_user_id_idx` — on `user_id` (list user's sessions)
- `refresh_sessions_token_hash_key` — UNIQUE on `token_hash` (lookup by token on refresh)
- `refresh_sessions_expires_at_idx` — on `expires_at` (background cleanup)
- `refresh_sessions_active_idx` — partial: `WHERE revoked_at IS NULL` (active session lookup; expiration checked in query `WHERE expires_at > now()`)

**Constraints:** FK `user_id` → `users(id)` ON DELETE CASCADE.

**Revocation terminology:** The schema supports revoking **all sessions for a user** (set `revoked_at` on all rows matching `user_id`). It does **not** implement a distinct "token family" grouping unless a `family_id` column is added later. Token reuse detection marks the presenting session revoked and revokes all other sessions for the same user (the entire session set serves as family-level revocation by approximation).

---

### 4.3 `password_reset_tokens` (POST-MVP / DEFERRED)

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| user_id | uuid | NOT NULL | | FK → users(id) | Token belongs to a user |
| token_hash | varchar(255) | NOT NULL | | UQ | SHA-256 hash of reset token; never plaintext |
| expires_at | timestamptz | NOT NULL | | | Token expiration (e.g. 1 hour); checked at query time |
| used_at | timestamptz | NULL | | | NULL = unused; set when token is consumed |
| created_at | timestamptz | NOT NULL | `now()` | | Token creation time |

**Indexes:**
- `password_reset_tokens_user_id_idx` — on `user_id`
- `password_reset_tokens_token_hash_key` — UNIQUE on `token_hash`
- `password_reset_tokens_expires_at_idx` — on `expires_at`

**Constraints:** FK `user_id` → `users(id)` ON DELETE CASCADE.

**Integrity notes:** Single-use — on accept, check `used_at IS NULL AND expires_at > now()` in a transaction, then set `used_at = now()`. 

**DEFERRED STATUS:** The `password_reset_tokens` table is **POST-MVP / DEFERRED**. It is excluded from initial MVP database migrations (Sprint 1 migrations) and deferred until post-MVP account recovery implementation. No password reset endpoints or runtime logic are present in MVP scope.

---

### 4.4 `workspaces`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| name | varchar(255) | NOT NULL | | | Workspace display name |
| slug | varchar(255) | NULL | | UQ | URL-friendly identifier; unique |
| owner_id | uuid | NOT NULL | | FK → users(id) | Authoritative Owner reference; must match a `workspace_members` row with `user_id = owner_id AND role = 'owner'` |
| created_at | timestamptz | NOT NULL | `now()` | | Record creation time |
| updated_at | timestamptz | NOT NULL | `now()` | | Last update time |
| deleted_at | timestamptz | NULL | | | Soft delete (archive); NULL = active |

**Indexes:**
- `workspaces_slug_key` — UNIQUE on `slug`
- `workspaces_owner_id_idx` — on `owner_id`
- `workspaces_deleted_at_idx` — on `deleted_at`
- `workspaces_active_idx` — partial: `WHERE deleted_at IS NULL` (active workspace lookup)

**Constraints:**
- FK `owner_id` → `users(id)` ON DELETE RESTRICT (cannot delete a user who owns a workspace)

**Owner integrity:** `workspaces.owner_id` is the authoritative Owner reference. Every committed workspace must have exactly one `workspace_members` row where `user_id = owner_id AND role = 'owner'`. This invariant is enforced at the **transaction level**: workspace creation inserts both rows atomically; ownership transfer updates `workspaces.owner_id` and `workspace_members.role` in the same transaction. The partial unique index `workspace_members_owner_partial_key` (one Owner per workspace) provides a database-level backstop against multiple Owners. When the Owner remains in the workspace, standalone ownership transfer (§8.4) demotes the Owner to Admin and promotes an eligible Admin successor. When the Owner departs the workspace voluntarily, ownership transfer, task unassignment, and member removal must occur atomically in a single transaction (§8.15).

**Workspace hard deletion vs soft deletion:**
- **Soft deletion (`deleted_at`):** The normal application workflow for archiving a workspace. Setting `deleted_at = now()` marks the workspace inactive, preserving all memberships, projects, tasks, comments, and activity logs.
- **Hard deletion (`DELETE FROM workspaces`):** An administrative operation only. PostgreSQL foreign key constraints do NOT unconditionally block workspace hard deletion. Instead, cascade behavior depends on existing dependent records:
  1. `workspaces → projects ON DELETE CASCADE` attempts to delete child projects. If any project has associated `activity_logs`, deletion is blocked by `activity_logs.project_id ON DELETE RESTRICT`.
  2. `workspaces → workspace_members ON DELETE CASCADE` attempts to delete workspace memberships, cascading to `project_members`. If any member has assigned tasks (active or soft-deleted), deletion is blocked by `tasks(project_id, assignee_id) ON DELETE RESTRICT`.
  3. If a workspace contains no activity logs and no assigned tasks (e.g. an empty workspace), `DELETE FROM workspaces` cascades and deletes child records (`projects`, `project_members`, `workspace_members`, `workspace_invitations`, `tasks`, `comments`).
  Therefore, application logic must not rely on an unconditional database-level FK guarantee to prevent workspace hard deletion; soft delete remains the mandatory application behavior.

---

### 4.5 `workspace_members`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| workspace_id | uuid | NOT NULL | | FK → workspaces(id) | Workspace this membership belongs to |
| user_id | uuid | NOT NULL | | FK → users(id) | User who is a member |
| role | varchar(20) | NOT NULL | `'member'` | | Check: `role IN ('owner', 'admin', 'member')` |
| created_at | timestamptz | NOT NULL | `now()` | | Membership creation time |

**Indexes:**
- `workspace_members_workspace_id_idx` — on `workspace_id`
- `workspace_members_user_id_idx` — on `user_id`
- `workspace_members_workspace_user_key` — UNIQUE on `(workspace_id, user_id)` (one membership per user per workspace; also referenced by project_members composite FK)
- `workspace_members_owner_partial_key` — UNIQUE on `workspace_id` WHERE `role = 'owner'` (at most one Owner per workspace)

**Constraints:**
- FK `workspace_id` → `workspaces(id)` ON DELETE CASCADE
- FK `user_id` → `users(id)` ON DELETE CASCADE
- CHECK `role IN ('owner', 'admin', 'member')`
- UNIQUE `(workspace_id, user_id)`

**Member-removal conflict resolution:** `workspace_members → project_members` uses ON DELETE CASCADE, while `tasks(project_id, assignee_id) → project_members(project_id, user_id)` uses ON DELETE RESTRICT. PostgreSQL foreign key constraints do not ignore soft-deleted rows; therefore, both active and soft-deleted assigned tasks still reference their project membership through the composite FK. Before a workspace membership can be deleted, all tasks assigned to that member within the target workspace must be unassigned (`assignee_id = NULL`). Tasks belonging to other workspaces are never touched. If the member being removed is the workspace Owner, standalone removal via this procedure is prohibited; the combined atomic Owner voluntary departure transaction (§8.15) must be executed instead to ensure the workspace is never left without an Owner (Decision 3).

**Atomic workspace-member removal transaction:**
1. Lock the workspace membership row:
   `SELECT * FROM workspace_members WHERE workspace_id = $workspace_id AND user_id = $user_id FOR UPDATE`
2. Lock all project memberships for this user in this workspace in deterministic order:
   `SELECT * FROM project_members WHERE workspace_id = $workspace_id AND user_id = $user_id ORDER BY project_id, id FOR UPDATE`
3. Find and lock all tasks assigned to the departing member in this workspace (including soft-deleted tasks) using the project relationship in deterministic order:
   `SELECT t.id, t.project_id FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.workspace_id = $workspace_id AND t.assignee_id = $user_id ORDER BY t.project_id, t.id FOR UPDATE OF t`
4. Set `assignee_id = NULL` on all those tasks (both active and soft-deleted) scoped to the target workspace and insert activity log records atomically using a data-modifying CTE:
   ```sql
   WITH unassigned_tasks AS (
       UPDATE tasks t
       SET assignee_id = NULL, updated_at = now()
       FROM projects p
       WHERE t.project_id = p.id
         AND p.workspace_id = $workspace_id
         AND t.assignee_id = $user_id
       RETURNING t.id, t.project_id
   )
   INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
   SELECT gen_random_uuid(), u.project_id, u.id, $actor_id, 'task_unassigned',
          jsonb_build_object('unassigned_user_id', $user_id), now()
   FROM unassigned_tasks u;
   ```
   *(Explicitly omits any `deleted_at IS NULL` filter; soft-deleted tasks still hold FK references and must be unassigned)*
5. Delete the workspace membership:
   `DELETE FROM workspace_members WHERE workspace_id = $workspace_id AND user_id = $user_id`
   *(Cascades to `project_members` via ON DELETE CASCADE; succeeds without RESTRICT violations because all tasks referencing those memberships in this workspace were unassigned in step 4)*

**Transaction boundary:** Single transaction spanning steps 1–5.

**Rollback behavior:** Full rollback; no membership removed, no tasks unassigned, and no activity logs written if any step fails.

**Concrete concurrency-control strategy:**
- **Preventing concurrent member removal:** Step 1 locks the `workspace_members` row with `FOR UPDATE`, serializing concurrent removal or role change attempts for this membership.
- **Preventing concurrent task assignment to the departing member:** Step 2 acquires a `FOR UPDATE` lock on all `project_members` tuples for `$user_id` in this workspace. In PostgreSQL, validating the composite FK `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id)` on `INSERT` or `UPDATE` of a task requires acquiring a `FOR KEY SHARE` lock on the referenced `project_members` row. Because `FOR UPDATE` conflicts with `FOR KEY SHARE`, any concurrent transaction attempting to assign a task (new or existing) to the departing member in this workspace will block on Step 2. When Step 5 deletes `workspace_members` (cascading to delete `project_members`) and commits, the blocked assignment transaction resumes, detects that the `project_members` row no longer exists, and fails with a foreign key violation (`tasks_assignee_membership_fk`). Thus, concurrent assignments cannot race with membership removal.
- **Hierarchical and deterministic lock ordering:** Row locks are acquired in a strict global hierarchy: `workspace_members` → `project_members` → `tasks`. Within multi-row locks, deterministic sorting is enforced:
  - Step 2 sorts project memberships by `ORDER BY project_id, id FOR UPDATE`.
  - Step 3 sorts task rows by `ORDER BY t.project_id, t.id FOR UPDATE OF t`.
  This deterministic lock ordering prevents internal intra-statement and cross-transaction deadlocks (AB-BA deadlocks) between concurrent removal, assignment (§8.8), and creation (§8.7) transactions.
- **Preventing concurrent modifications to existing assigned tasks:** Step 3 executes `FOR UPDATE OF t` on all tasks assigned to the user in this workspace. This locks the task rows and serializes concurrent updates to those tasks until unassignment and activity logging complete in Step 4.
- **Atomic unassignment and audit logging:** Step 4 uses an atomic data-modifying CTE (`UPDATE ... RETURNING` combined with `INSERT ... SELECT`) so that every successfully unassigned task generates exactly one corresponding `activity_logs` entry within the same statement and transaction. If the transaction aborts, both the unassignments and activity logs are rolled back completely.
- **Cross-workspace isolation:** Steps 3 and 4 scope affected tasks strictly using the project relationship `JOIN projects p ON t.project_id = p.id WHERE p.workspace_id = $workspace_id`. Tasks belonging to projects in other workspaces are never locked, modified, or unassigned.
- **Handling soft-deleted tasks:** Steps 3 and 4 do not filter by `deleted_at IS NULL`. The database-level composite foreign key constraint `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id) ON DELETE RESTRICT` evaluates across all rows in `tasks`. If soft-deleted tasks were omitted, Step 5 would abort with a RESTRICT violation when cascading to `project_members`.
- **Activity log preservation:** Historical logs are preserved; new `task_unassigned` audit events are recorded before membership deletion.

**User-account deletion workflow:** Hard-deleting a user (`DELETE FROM users`) cascades to `refresh_sessions`, `password_reset_tokens`, and `workspace_members` (all ON DELETE CASCADE), which in turn cascades to `project_members` via composite FK. However, `tasks.created_by` (RESTRICT), `comments.author_id` (RESTRICT), and `activity_logs.actor_id` (RESTRICT) block user hard-deletion while those records exist. The separate single-column FK `tasks.assignee_id → users(id) ON DELETE SET NULL` would clear assignee references, but the RESTRICT FKs on `created_by`, `author_id`, and `actor_id` take precedence and block the deletion entirely. The application must reassign created tasks, transfer ownership, or otherwise handle owned content before user hard-deletion. User accounts have no `deleted_at` column; they are either active or hard-deleted.

**Interaction of the two FKs on `tasks.assignee_id`:** `tasks.assignee_id` participates in two FKs: (a) single-column `assignee_id → users(id) ON DELETE SET NULL` clears the assignee reference when a user is hard-deleted; (b) composite `(project_id, assignee_id) → project_members(project_id, user_id) ON DELETE RESTRICT` blocks project-membership deletion while tasks reference that membership. With MATCH SIMPLE (default), a NULL `assignee_id` passes the composite constraint. The two FKs operate independently: user deletion triggers SET NULL on `assignee_id`; project membership deletion triggers RESTRICT if any task's `(project_id, assignee_id)` matches that membership row.

---

### 4.6 `workspace_invitations`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| workspace_id | uuid | NOT NULL | | FK → workspaces(id) | Workspace being invited to |
| email | varchar(255) | NOT NULL | | | Invitee email (case-insensitive) |
| token_hash | varchar(255) | NOT NULL | | UQ | SHA-256 hash of invitation token; never plaintext |
| invited_by | uuid | NOT NULL | | FK → users(id) | User who created the invitation |
| expires_at | timestamptz | NOT NULL | | | Invitation expiration (e.g. 7 days); checked at query time |
| accepted_at | timestamptz | NULL | | | NULL = pending; set when accepted |
| revoked_at | timestamptz | NULL | | | NULL = not revoked; set when revoked |
| created_at | timestamptz | NOT NULL | `now()` | | Invitation creation time |

**Indexes:**
- `workspace_invitations_token_hash_key` — UNIQUE on `token_hash`
- `workspace_invitations_workspace_id_idx` — on `workspace_id`
- `workspace_invitations_email_idx` — on `email`
- `workspace_invitations_active_idx` — partial: `WHERE accepted_at IS NULL AND revoked_at IS NULL` (pending invitation lookup; expiration checked in query `WHERE expires_at > now()`)

**Constraints:**
- FK `workspace_id` → `workspaces(id)` ON DELETE CASCADE
- FK `invited_by` → `users(id)` ON DELETE CASCADE

**Integrity notes:**
- Single-use: acceptance sets `accepted_at` in the same transaction that validates `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()` with `FOR UPDATE` row lock.
- Email-bound: acceptance verifies the accepting account's email matches `email`.
- Revoked, expired, or accepted invitations cannot be accepted again (checked by the validation WHERE clause).

---

### 4.7 `projects`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| workspace_id | uuid | NOT NULL | | FK → workspaces(id) | Workspace this project belongs to |
| key | varchar(10) | NOT NULL | | UQ (per workspace) | Immutable identifier prefix (e.g. `DEV`); set at creation; unique within workspace |
| name | varchar(255) | NOT NULL | | | Project display name |
| description | text | NULL | | | Project description |
| task_counter | int | NOT NULL | `0` | | Sequential counter for project-specific task identifiers; incremented atomically in task creation transaction; PostgreSQL signed 32-bit int supporting up to 2,147,483,647 tasks per project |
| created_by | uuid | NOT NULL | | FK → users(id) | User who created the project; automatically added as project member |
| created_at | timestamptz | NOT NULL | `now()` | | Record creation time |
| updated_at | timestamptz | NOT NULL | `now()` | | Last update time |
| deleted_at | timestamptz | NULL | | | Soft delete (archive); NULL = active |

**Indexes:**
- `projects_workspace_id_idx` — on `workspace_id`
- `projects_created_by_idx` — on `created_by`
- `projects_deleted_at_idx` — on `deleted_at`
- `projects_active_idx` — partial: `WHERE deleted_at IS NULL` (active project lookup)
- `projects_workspace_id_key_key` — UNIQUE on `(workspace_id, key)` (project key unique per workspace)
- `projects_id_workspace_id_key` — UNIQUE on `(id, workspace_id)` (required target for composite FKs from `project_members` and `tasks`)

**Constraints:**
- FK `workspace_id` → `workspaces(id)` ON DELETE CASCADE
- FK `created_by` → `users(id)` ON DELETE RESTRICT
- UNIQUE `(id, workspace_id)` — required for composite FK references
- UNIQUE `(workspace_id, key)`
- CHECK `task_counter >= 0`

**Integrity notes:**
- Project belongs to exactly one workspace (FK `workspace_id`).
- **Project Key Convention & Invariants (Decision 6):**
  - **Format & Validation:** Validated against regex `^[A-Z][A-Z0-9]{1,9}$` (2 to 10 characters, starting with an uppercase letter, followed by uppercase alphanumeric characters).
  - **Auto-Generation:** If not explicitly provided, derived automatically from the project name by extracting word initials or first alphanumeric characters (prepends 'P' if starting with a digit, clamped between 2 and 10 characters).
  - **Uniqueness & Scope:** Enforced per-workspace via `UNIQUE(workspace_id, key)`. Different workspaces may reuse the same key. Key collisions within the same workspace result in HTTP 409 Conflict.
  - **Permanent Immutability:** Set upon project creation and strictly immutable thereafter (no `UPDATE` permitted). Ensures task identifiers (e.g. `CORE-001`) remain permanent across Git branches, commits, PR references, and audit trails.
- `task_counter` starts at 0; first task gets counter value 1. Supports values up to 2,147,483,647 (the maximum positive value of PostgreSQL int), providing sufficient headroom for project lifetimes.
- Project archival = soft delete (`deleted_at`). Archived projects' tasks remain; activity logs preserved.

---

### 4.8 `project_members`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| project_id | uuid | NOT NULL | | FK (composite) → projects(id, workspace_id) | Project this membership belongs to |
| workspace_id | uuid | NOT NULL | | FK (composite) → projects(id, workspace_id) | Denormalized workspace ID; ensures project member's workspace matches project's workspace |
| user_id | uuid | NOT NULL | | FK (composite) → workspace_members(workspace_id, user_id) | User who is a project member; must be a workspace member |
| role | varchar(20) | NOT NULL | `'member'` | | Check: `role IN ('owner', 'admin', 'member')`. Project-level role; project creator is added as role 'owner'. Does not introduce new product permissions beyond workspace role semantics. |
| created_at | timestamptz | NOT NULL | `now()` | | Membership creation time |

**Indexes:**
- `project_members_project_id_idx` — on `project_id`
- `project_members_user_id_idx` — on `user_id`
- `project_members_project_user_key` — UNIQUE on `(project_id, user_id)` (one membership per user per project; referenced by tasks composite FK)
- `project_members_project_workspace_key` — UNIQUE on `(project_id, workspace_id)` (referenced by tasks and composite FK target)
- `project_members_workspace_user_idx` — on `(workspace_id, user_id)` (lookup workspace members for a project)

**Constraints:**
- FK `(project_id, workspace_id)` → `projects(id, workspace_id)` ON DELETE CASCADE (composite FK)
- FK `(workspace_id, user_id)` → `workspace_members(workspace_id, user_id)` ON DELETE CASCADE (composite FK; enforces project member is a workspace member)
- CHECK `role IN ('owner', 'admin', 'member')`
- UNIQUE `(project_id, user_id)`

**Integrity notes:**
- Project members must be workspace members: enforced by composite FK `project_members(workspace_id, user_id) → workspace_members(workspace_id, user_id)`.
- One membership per user per project: UNIQUE `(project_id, user_id)`.
- Project member's workspace matches project's workspace: enforced by composite FK `project_members(project_id, workspace_id) → projects(id, workspace_id)`.
- Member removal from workspace cascades to project memberships (ON DELETE CASCADE on the workspace_members FK).

**Design Decision — Direct `user_id → users(id)` FK Omission:**
The table specification and DDL deliberately omit a direct single-column foreign key from `project_members.user_id` to `users(id)`. Referential integrity and cascade deletion are fully provided by the composite foreign key `(workspace_id, user_id) REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE`. Because `workspace_members.user_id` has a direct NOT NULL foreign key to `users(id) ON DELETE CASCADE`:
1. A user cannot be added to `project_members` without already having a valid membership in `workspace_members` (guaranteeing the user exists in `users`).
2. Deleting a user from `users` cascades to `workspace_members`, which immediately cascades to `project_members`.
3. Omitting the redundant direct FK avoids duplicate constraint checks on every insert/update of `project_members` and eliminates duplicate cascade execution paths in PostgreSQL during user deletion.

**Project-level roles clarification:** The PRD defines workspace roles (Owner/Admin/Member) and requires explicit project membership. The `project_members.role` column exists to record the project creator as role `'owner'` and to allow future differentiation, but project-level role **permissions are not independently defined in the PRD**. Authorization for project resources is based on **project membership** (existence of a `project_members` row), not on the specific project role value. No product permissions beyond those implied by workspace role semantics are silently introduced.

---

### 4.9 `tasks`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| project_id | uuid | NOT NULL | | FK → projects(id) | Project this task belongs to |
| identifier | varchar(30) | NOT NULL | | UQ (per project) | Project-scoped identifier (e.g. `DEV-001`, `DEV-999`, `DEV-1000`); minimum width 3 digits formatted as `LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')` to prevent truncation beyond 999; varchar(30) safely accommodates 10-char project key + hyphen + 10-digit counter with headroom; unique within project |
| title | varchar(255) | NOT NULL | | | Task title |
| description | text | NULL | | | Task description |
| status | varchar(20) | NOT NULL | `'todo'` | | Check: `status IN ('todo', 'in_progress', 'review', 'done')` |
| priority | varchar(20) | NOT NULL | `'medium'` | | Check: `priority IN ('low', 'medium', 'high', 'urgent')` |
| assignee_id | uuid | NULL | | FK → users(id); FK (composite) → project_members(project_id, user_id) | Must be a member of the task's project; NULL = unassigned |
| due_date | timestamptz | NULL | | | Nullable due date |
| created_by | uuid | NOT NULL | | FK → users(id) | User who created the task |
| created_at | timestamptz | NOT NULL | `now()` | | Record creation time |
| updated_at | timestamptz | NOT NULL | `now()` | | Last update time |
| deleted_at | timestamptz | NULL | | | Soft delete; NULL = active |

**Indexes:**
- `tasks_project_id_idx` — on `project_id`
- `tasks_project_status_idx` — on `(project_id, status)` WHERE `deleted_at IS NULL` (partial: Kanban/dashboard queries excluding deleted)
- `tasks_assignee_id_idx` — on `assignee_id` WHERE `deleted_at IS NULL` (partial: my assigned tasks excluding deleted)
- `tasks_due_date_idx` — on `due_date` WHERE `deleted_at IS NULL AND status != 'done'` (partial: overdue task queries)
- `tasks_project_identifier_key` — UNIQUE on `(project_id, identifier)` (task identifier uniqueness)
- `tasks_deleted_at_idx` — on `deleted_at`

**Constraints:**
- FK `project_id` → `projects(id)` ON DELETE CASCADE
- FK `(project_id, assignee_id)` → `project_members(project_id, user_id)` ON DELETE RESTRICT (composite FK; enforces assignee is a project member; prevents deleting a membership that has assigned tasks)
- FK `assignee_id` → `users(id)` ON DELETE SET NULL (single-column FK; if a user is deleted, their assignee references are cleared)
- FK `created_by` → `users(id)` ON DELETE RESTRICT
- UNIQUE `(project_id, identifier)`
- CHECK `status IN ('todo', 'in_progress', 'review', 'done')`
- CHECK `priority IN ('low', 'medium', 'high', 'urgent')`

**Integrity notes:**
- Task belongs to exactly one project (FK `project_id`).
- Task identifier unique within project: UNIQUE `(project_id, identifier)`.
- Task identifier formatting: Formatted as `"{key}-{LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')}"`. The explicit cast `counter::text` and length calculation `GREATEST(3, LENGTH(counter::text))` ensure minimum 3-digit zero-padding (`DEV-001` through `DEV-999`) without truncating larger values (`DEV-1000`, `DEV-1001`, etc.), keeping all identifiers distinct and valid. The column type `varchar(30)` provides comfortable headroom for 10-character keys, a hyphen, and sequential counters up to the maximum positive value of PostgreSQL int (2,147,483,647 tasks per project, which is 10 digits; maximum identifier length 10 + 1 + 10 = 21 characters, well within varchar(30)).
- Assignee must be project member: composite FK `tasks(project_id, assignee_id)` → `project_members(project_id, user_id)` ON DELETE RESTRICT. With MATCH SIMPLE (default), NULL `assignee_id` passes the constraint. The separate single-column FK `assignee_id → users(id) ON DELETE SET NULL` handles user deletion.
- `ON DELETE RESTRICT` on the composite FK avoids the column-list `SET NULL` problem: `project_id` is NOT NULL and cannot be set to NULL. Instead, deleting a project membership with assigned tasks is blocked (RESTRICT); the application must reassign or unassign tasks first.
- Soft delete: `deleted_at` excludes task from default queries; comments and activity logs preserved (task is not hard-deleted in normal operation).

---

### 4.10 `comments`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| task_id | uuid | NOT NULL | | FK → tasks(id) | Task this comment belongs to |
| author_id | uuid | NOT NULL | | FK → users(id) | User who wrote the comment |
| body | text | NOT NULL | | | Comment text content |
| created_at | timestamptz | NOT NULL | `now()` | | Record creation time |
| updated_at | timestamptz | NOT NULL | `now()` | | Last edit time |
| deleted_at | timestamptz | NULL | | | Soft delete (author deletes own comment) |

**Indexes:**
- `comments_task_created_idx` — on `(task_id, created_at)` WHERE `deleted_at IS NULL` (partial: ordered comment listing excluding deleted)
- `comments_author_id_idx` — on `author_id`
- `comments_deleted_at_idx` — on `deleted_at`

**Constraints:**
- FK `task_id` → `tasks(id)` ON DELETE CASCADE (hard delete only; soft-delete does not trigger)
- FK `author_id` → `users(id)` ON DELETE RESTRICT (preserve comment history even if user leaves)

**Integrity notes:**
- Comment references valid task and author (FKs).
- Users edit/delete only their own comments: application-level authorization (`author_id = current_user`).
- Soft-delete preserves comment text; `deleted_at` marks it hidden.

---

### 4.11 `activity_logs`

| Column | Type | Null | Default | Key | Purpose / Business Rules |
|--------|------|------|---------|-----|--------------------------|
| id | uuid | NOT NULL | `gen_random_uuid()` | PK | Primary key |
| project_id | uuid | NOT NULL | | FK → projects(id) | Project the activity belongs to |
| task_id | uuid | NULL | | FK → tasks(id) | Related task (nullable for project-level activities) |
| actor_id | uuid | NOT NULL | | FK → users(id) | User who performed the action |
| action | varchar(50) | NOT NULL | | | Action type (e.g. `task_created`, `task_status_changed`, `comment_added`) |
| metadata | jsonb | NOT NULL | `'{}'::jsonb` | | Optional structured details (old/new values, identifiers) |
| created_at | timestamptz | NOT NULL | `now()` | | Activity occurrence time |

**Indexes:**
- `activity_logs_project_id_idx` — on `(project_id, created_at DESC)` (recent activity by project)
- `activity_logs_task_id_idx` — on `task_id` (activity for a specific task)
- `activity_logs_actor_id_idx` — on `actor_id` (activity by user)
- `activity_logs_created_at_idx` — on `created_at DESC` (recent activity feed)

**Constraints:**
- FK `project_id` → `projects(id)` ON DELETE RESTRICT (hard-deleting a project with activity logs is blocked; activity logs are append-only and preserved)
- FK `task_id` → `tasks(id)` ON DELETE SET NULL (applies only to **hard deletion**; soft-delete does not trigger ON DELETE; `task_id` is nullable)
- FK `actor_id` → `users(id)` ON DELETE RESTRICT (preserve activity history even if user leaves)

**Integrity notes:**
- Append-only: no `updated_at` or `deleted_at`; normal users cannot modify or delete activity logs.
- **Task soft-delete preserves `task_id`**: `ON DELETE SET NULL` applies only to hard deletion, which does not occur in normal operation. When a task is soft-deleted (`deleted_at` set), the `task_id` reference in activity logs is preserved.
- Activity history preserved when a user is removed from workspace/project: `actor_id` FK is RESTRICT, so the user cannot be hard-deleted while activities reference them. If user is removed from workspace but not hard-deleted, activities remain with `actor_id` intact.

**MVP activity log retention policy:** Activity logs are append-only and preserved indefinitely. Normal operations use soft deletion (`deleted_at`) for workspaces, projects, tasks, and comments; activity logs referencing soft-deleted resources are preserved with their `task_id` intact.

**Workspace Hard Deletion Behavior:**
Foreign key cascade chains do NOT unconditionally block workspace hard deletion (`DELETE FROM workspaces`). The actual behavior depends on existing dependent records:
- **Activity logs referencing projects:** If any project in the workspace has activity logs, deleting the project is blocked by `activity_logs.project_id ON DELETE RESTRICT`.
- **Assigned tasks referencing project members:** If any project member in the workspace has assigned tasks (active or soft-deleted), cascading deletion of `workspace_members` to `project_members` is blocked by `tasks(project_id, assignee_id) ON DELETE RESTRICT`.
- **Cascade behavior depends on existing dependent records:** If a workspace has no activity logs and no assigned tasks (e.g. an empty or freshly created workspace), `DELETE FROM workspaces` will cascade and delete all child records (`projects`, `project_members`, `workspace_members`, `workspace_invitations`, `tasks`, `comments`).
- **Soft deletion remains normal behavior:** In normal application operation, workspaces are soft-deleted / archived (`deleted_at = now()`), preserving all workspace records, memberships, projects, tasks, and audit logs. Hard deletion is an administrative operation only. Application logic must not claim an unconditional FK guarantee against workspace hard deletion.

## 5. Relationships and Cardinalities

| Parent | Child | FK Column(s) | Referenced | On Delete | Cardinality | Enforcement |
|--------|-------|--------------|------------|-----------|-------------|-------------|
| users | refresh_sessions | user_id | users.id | CASCADE | 1:N | DB FK |
| users | password_reset_tokens | user_id | users.id | CASCADE | 1:N | DB FK (POST-MVP / Deferred) |
| users | workspace_members | user_id | users.id | CASCADE | 1:N | DB FK |
| users | workspace_invitations | invited_by | users.id | CASCADE | 1:N | DB FK |
| users | tasks | created_by | users.id | RESTRICT | 1:N | DB FK |
| users | tasks | assignee_id | users.id | SET NULL | 1:N (optional) | DB FK |
| users | comments | author_id | users.id | RESTRICT | 1:N | DB FK |
| users | activity_logs | actor_id | users.id | RESTRICT | 1:N | DB FK |
| workspaces | workspace_members | workspace_id | workspaces.id | CASCADE | 1:N | DB FK |
| workspaces | workspace_invitations | workspace_id | workspaces.id | CASCADE | 1:N | DB FK |
| workspaces | projects | workspace_id | workspaces.id | CASCADE | 1:N | DB FK |
| projects | project_members | (project_id, workspace_id) | projects(id, workspace_id) | CASCADE | 1:N | DB composite FK |
| projects | tasks | project_id | projects.id | CASCADE | 1:N | DB FK |
| projects | activity_logs | project_id | projects.id | RESTRICT | 1:N | DB FK |
| workspace_members | project_members | (workspace_id, user_id) | workspace_members(workspace_id, user_id) | CASCADE | 1:N | DB composite FK |
| project_members | tasks | (project_id, assignee_id) | project_members(project_id, user_id) | RESTRICT | 1:N | DB composite FK |
| tasks | comments | task_id | tasks.id | CASCADE | 1:N | DB FK |
| tasks | activity_logs | task_id | tasks.id | SET NULL | 1:N | DB FK (hard delete only) |

## 6. Constraints and Invariants

### 6.1 Database-Enforced Invariants

| Invariant | Mechanism |
|-----------|-----------|
| User email unique | UNIQUE on `users(email)` + `users(lower(email))` |
| Password hash stored, never plaintext | Column stores hash only |
| Refresh token hash stored, never plaintext | Column stores `token_hash` only |
| Refresh session expiration | `expires_at` column; checked at query time |
| Refresh session revocation | `revoked_at` column; NULL = active |
| One membership per user per workspace | UNIQUE `(workspace_id, user_id)` on `workspace_members` |
| Workspace role domain | CHECK `role IN ('owner','admin','member')` |
| At most one Owner per workspace | UNIQUE partial index on `workspace_members(workspace_id) WHERE role = 'owner'` |
| Invitation token hash stored, never plaintext | Column stores `token_hash` only |
| Invitation single-use | `accepted_at` set in transaction with `FOR UPDATE` |
| Invitation expiration | `expires_at` column; checked at query time |
| One membership per user per project | UNIQUE `(project_id, user_id)` on `project_members` |
| Project role domain | CHECK `role IN ('owner','admin','member')` |
| Task status domain | CHECK `status IN ('todo','in_progress','review','done')` |
| Task priority domain | CHECK `priority IN ('low','medium','high','urgent')` |
| Task identifier unique per project | UNIQUE `(project_id, identifier)` on `tasks` |
| Project key unique per workspace | UNIQUE `(workspace_id, key)` on `projects` |
| Assignee must be project member | Composite FK `tasks(project_id, assignee_id)` → `project_members(project_id, user_id)` ON DELETE RESTRICT |
| Project member must be workspace member | Composite FK `project_members(workspace_id, user_id)` → `workspace_members(workspace_id, user_id)` ON DELETE CASCADE |
| Project member workspace matches project | Composite FK `project_members(project_id, workspace_id)` → `projects(id, workspace_id)` ON DELETE CASCADE |
| Project belongs to one workspace | FK `projects.workspace_id` → `workspaces(id)` |
| Comment references valid task and author | FKs `comments.task_id` → `tasks(id)`, `comments.author_id` → `users(id)` |
| Activity references valid actor and project | FKs `activity_logs.actor_id` → `users(id)`, `activity_logs.project_id` → `projects(id)` |

### 6.2 Transaction-Level Invariants

| Operation | Invariant | Enforcement |
|-----------|-----------|-------------|
| Workspace creation | `workspaces.owner_id` must match a `workspace_members` row with `user_id = owner_id AND role = 'owner'` | Application inserts both rows in one transaction |
| Ownership transfer | Successor must be an existing workspace member with the Admin role (Decision 3); `workspaces.owner_id` updated atomically with `workspace_members.role` | Application uses `FOR UPDATE` on workspace and membership rows; updates both tables in one transaction (section 8.4) |
| Owner voluntary departure | Successor must be an eligible Admin; ownership transfer, task unassignment across projects, and membership deletion execute atomically in one transaction | Application executes single combined transaction with explicit row locks (section 8.15) |
| Invitation acceptance | User email must match invitation email; user becomes workspace member; invitation marked accepted | Application validates email match, inserts `workspace_members`, sets `accepted_at` in one transaction with `FOR UPDATE` on invitation |
| Task creation | `task_counter` incremented and task inserted with generated identifier in one transaction; optional assignee locked with `FOR KEY SHARE` | Application uses `UPDATE projects SET task_counter = task_counter + 1 RETURNING task_counter, key`, validates assignee, then `INSERT` in one transaction (section 8.7) |
| Task assignment | Assignee must be a project member at time of assignment; `project_members` locked with `FOR KEY SHARE` before `tasks` row lock to eliminate AB-BA deadlocks | Lock ordering protocol (`project_members` → `tasks`, section 8.8) + composite FK constraint |

### 6.3 Application-Level Authorization Rules

| Rule | Description |
|------|-------------|
| Workspace Admin ≠ project access | Workspace Admin role does not grant access to projects the user is not a member of |
| Task access requires project membership | Caller must be a `project_members` row for the task's project |
| Comment edit/delete | Only the comment author may edit or delete their own comment |
| Invitation creation | Only workspace Owner/Admin may create invitations |
| Ownership transfer | Only current Owner can transfer ownership |
| Activity log access | Read-only for project members; no modification by normal users |
| Project-level role permissions | Not independently defined in PRD; authorization based on project membership existence, not role value |

## 6.4 Exactly-One Owner Invariant

**Database-enforced:** At most one Owner per workspace. The partial unique index `workspace_members(workspace_id) WHERE role = 'owner'` prevents two rows with role='owner' for the same workspace.

**Application/transaction-enforced:** Exactly one Owner per committed workspace. Every committed workspace must have exactly one `workspace_members` row where `user_id = workspaces.owner_id AND role = 'owner'`. This cross-table invariant cannot be enforced by a single PostgreSQL constraint and is maintained at the transaction level.

**Operations that could violate the invariant and their enforcement:**

| Operation | Risk | Enforcement |
|-----------|------|-------------|
| Workspace creation | Workspace created without an Owner | Application inserts workspace and owner membership in one transaction (section 8.1) |
| Ownership transfer | Moment with zero or two Owners | Transaction demotes old Owner to Admin first, then promotes eligible Admin successor to Owner, then updates `workspaces.owner_id`; `FOR UPDATE` on workspace serializes concurrent transfers (section 8.4) |
| Owner departure / leave | Workspace left without an Owner | Application validates an eligible Admin exists and executes the atomic Owner departure transaction combining ownership transfer, task unassignment, and membership removal in one transaction (section 8.15) (Decision 3) |
| Member removal | Removing the only Owner | Application blocks standalone removal of the Owner; combined atomic departure workflow (§8.15) required if Owner is leaving |
| Role change | Changing the Owner's role to non-Owner | Application validates another Owner exists before demoting the current Owner |
| Workspace soft-delete | No Owner impact (workspace retained) | Soft delete doesn't affect membership rows |
| Workspace hard-delete | Workspace removed entirely | Blocked only when dependent records exist (activity logs → RESTRICT on projects, assigned tasks → RESTRICT on project memberships). Cascade behavior depends on existing dependent records; hard delete cascades and succeeds if neither exists. Soft delete/archive is the normal application behavior; hard delete is administrative only. |

## 7. Index Strategy

| Index | Table | Columns | Type | Predicate | Purpose |
|-------|-------|---------|------|-----------|---------|
| `users_email_key` | users | email | UNIQUE | — | Login lookup; duplicate prevention |
| `users_email_ci_idx` | users | lower(email) | UNIQUE | — | Case-insensitive email lookup |
| `refresh_sessions_user_id_idx` | refresh_sessions | user_id | B-tree | — | List user's sessions |
| `refresh_sessions_token_hash_key` | refresh_sessions | token_hash | UNIQUE | — | Token lookup on refresh |
| `refresh_sessions_expires_at_idx` | refresh_sessions | expires_at | B-tree | — | Background cleanup of expired sessions |
| `refresh_sessions_active_idx` | refresh_sessions | (revoked_at, expires_at) | B-tree | `WHERE revoked_at IS NULL` | Active session lookup; expiration checked in query |
| `password_reset_tokens_user_id_idx` | password_reset_tokens | user_id | B-tree | — | User's reset tokens |
| `password_reset_tokens_token_hash_key` | password_reset_tokens | token_hash | UNIQUE | — | Token lookup on reset |
| `workspaces_slug_key` | workspaces | slug | UNIQUE | — | Slug lookup |
| `workspaces_owner_id_idx` | workspaces | owner_id | B-tree | — | Owner lookup |
| `workspaces_deleted_at_idx` | workspaces | deleted_at | B-tree | — | Soft-delete queries |
| `workspaces_active_idx` | workspaces | id | B-tree | `WHERE deleted_at IS NULL` | Active workspace lookup |
| `workspace_members_workspace_id_idx` | workspace_members | workspace_id | B-tree | — | List workspace members |
| `workspace_members_user_id_idx` | workspace_members | user_id | B-tree | — | User's workspaces |
| `workspace_members_workspace_user_key` | workspace_members | (workspace_id, user_id) | UNIQUE | — | One membership per user per workspace; referenced by project_members composite FK |
| `workspace_members_owner_partial_key` | workspace_members | workspace_id | UNIQUE | `WHERE role = 'owner'` | At most one Owner per workspace |
| `workspace_invitations_token_hash_key` | workspace_invitations | token_hash | UNIQUE | — | Token lookup on accept |
| `workspace_invitations_workspace_id_idx` | workspace_invitations | workspace_id | B-tree | — | Workspace invitations |
| `workspace_invitations_email_idx` | workspace_invitations | email | B-tree | — | Invitation lookup by email |
| `workspace_invitations_active_idx` | workspace_invitations | (accepted_at, revoked_at, expires_at) | B-tree | `WHERE accepted_at IS NULL AND revoked_at IS NULL` | Pending invitation validation; expiration checked in query |
| `projects_workspace_id_idx` | projects | workspace_id | B-tree | — | List projects by workspace |
| `projects_created_by_idx` | projects | created_by | B-tree | — | User's projects |
| `projects_workspace_id_key_key` | projects | (workspace_id, key) | UNIQUE | — | Project key unique per workspace |
| `projects_id_workspace_id_key` | projects | (id, workspace_id) | UNIQUE | — | Target for composite FKs |
| `projects_deleted_at_idx` | projects | deleted_at | B-tree | — | Soft-delete queries |
| `projects_active_idx` | projects | id | B-tree | `WHERE deleted_at IS NULL` | Active project lookup |
| `project_members_project_id_idx` | project_members | project_id | B-tree | — | List project members |
| `project_members_user_id_idx` | project_members | user_id | B-tree | — | User's projects |
| `project_members_project_user_key` | project_members | (project_id, user_id) | UNIQUE | — | One membership per user per project; referenced by tasks composite FK |
| `project_members_project_workspace_key` | project_members | (project_id, workspace_id) | UNIQUE | — | Target for composite FKs |
| `project_members_workspace_user_idx` | project_members | (workspace_id, user_id) | B-tree | — | Lookup workspace members for a project |
| `tasks_project_id_idx` | tasks | project_id | B-tree | — | List tasks by project |
| `tasks_project_status_idx` | tasks | (project_id, status) | B-tree | `WHERE deleted_at IS NULL` | Kanban/dashboard queries excluding deleted |
| `tasks_assignee_id_idx` | tasks | assignee_id | B-tree | `WHERE deleted_at IS NULL` | My assigned tasks excluding deleted |
| `tasks_due_date_idx` | tasks | due_date | B-tree | `WHERE deleted_at IS NULL AND status != 'done'` | Overdue task queries |
| `tasks_project_identifier_key` | tasks | (project_id, identifier) | UNIQUE | — | Task identifier uniqueness |
| `tasks_deleted_at_idx` | tasks | deleted_at | B-tree | — | Soft-delete queries |
| `comments_task_created_idx` | comments | (task_id, created_at) | B-tree | `WHERE deleted_at IS NULL` | Ordered comment listing excluding deleted |
| `comments_author_id_idx` | comments | author_id | B-tree | — | User's comments |
| `comments_deleted_at_idx` | comments | deleted_at | B-tree | — | Soft-delete queries |
| `activity_logs_project_id_idx` | activity_logs | (project_id, created_at DESC) | B-tree | — | Recent activity by project |
| `activity_logs_task_id_idx` | activity_logs | task_id | B-tree | — | Activity for a task |
| `activity_logs_actor_id_idx` | activity_logs | actor_id | B-tree | — | Activity by user |
| `activity_logs_created_at_idx` | activity_logs | created_at DESC | B-tree | — | Recent activity feed |

**Index rationale notes:**
- `users_email_key` (unique on `email`) and `users_email_ci_idx` (unique on `lower(email)`): both kept. `users_email_key` enforces exact uniqueness; `users_email_ci_idx` supports case-insensitive login lookups. Not redundant because they serve different lookup semantics.
- No single-column `tasks_project_id_idx` redundancy concern: `tasks_project_status_idx` has `project_id` as leading column but is partial (`deleted_at IS NULL`); `tasks_project_id_idx` is needed for queries on deleted tasks or without status filter.
- All partial indexes use immutable predicates (`deleted_at IS NULL`, `role = 'owner'`, `revoked_at IS NULL`, `accepted_at IS NULL AND revoked_at IS NULL`). No `now()` in predicates.
- Expiration (`expires_at`) is checked at query time, not in index predicates.

## 8. Transaction Specifications

### 8.1 Workspace Creation and Initial Owner Membership

**Validation:**
- User is authenticated
- Workspace name is valid (non-empty)
- Slug is unique (if provided)

**Database operations (in one transaction):**
1. `INSERT INTO workspaces (id, name, slug, owner_id, created_at, updated_at) VALUES (...)`
2. `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (..., 'owner')`

**Transaction boundary:** Single transaction spanning both inserts.

**Rollback behavior:** Full rollback; no workspace without owner membership, no orphan membership.

**Concurrency risks:** Slug uniqueness race — handled by UNIQUE constraint; second insert fails with unique violation.

**Constraints:** FK `owner_id` → `users(id)`; workspace_members FKs.

---

### 8.2 Workspace Invitation Creation

**Validation:**
- Caller is workspace Owner or Admin
- Invitee email is valid

**Database operations (in one transaction):**
1. `INSERT INTO workspace_invitations (id, workspace_id, email, token_hash, invited_by, expires_at, created_at) VALUES (...)`

**Transaction boundary:** Single transaction.

**Rollback behavior:** Invitation not created on failure.

**Concurrency risks:** Token hash collision — handled by UNIQUE constraint.

**Constraints:** FKs to workspaces and users.

---

### 8.3 Invitation Acceptance and Workspace Membership Creation

**Validation:**
- Token hash matches an active invitation (`accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`)
- Accepting account's email matches invitation email
- User is not already a workspace member

**Database operations (in one transaction):**
1. `SELECT ... FROM workspace_invitations WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`
2. `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (..., 'member')`
3. `UPDATE workspace_invitations SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL`

**Transaction boundary:** Single transaction with `FOR UPDATE` row lock on the invitation.

**Rollback behavior:** Full rollback; invitation remains pending if any step fails.

**Concurrency risks:** Two simultaneous acceptance attempts with same token — `FOR UPDATE` serializes; second transaction finds `accepted_at` already set (updated by first), or serialization failure.

**Constraints:** UNIQUE `(workspace_id, user_id)` prevents duplicate membership.

---

### 8.4 Standalone Ownership Transfer (Owner Remains as Admin)

**Scope:**
This standalone transaction applies when the current Owner transfers ownership to an eligible successor but remains in the workspace as an Admin. If the current Owner is departing the workspace voluntarily, the combined atomic workflow in §8.15 must be used instead.

**Successor eligibility (Decision 3 alignment):**
Approved Decision 3 specifies transferring ownership to another member "with role Owner or Admin". Because DevFlow strictly enforces at most one Owner per workspace at any time (`workspace_members_owner_partial_key`), there is no other member holding the Owner role. Therefore, the eligible successor must be an existing workspace member with the **Admin** role (`role = 'admin'`). An ordinary Member (`role = 'member'`) is not eligible for direct ownership transfer without prior promotion to Admin.

**Validation:**
- Current caller is the authenticated workspace Owner (`workspaces.owner_id = current_user_id` with `role = 'owner'` in `workspace_members`)
- Target successor is an existing member of this workspace with the **Admin** role (`workspace_members.role = 'admin'`)
- Target successor is distinct from the current Owner (`new_owner_id != current_user_id`)
- Transfer will not leave the workspace without an Owner

**Database operations (in one transaction):**
1. `SELECT * FROM workspaces WHERE id = $workspace_id AND owner_id = $current_user_id FOR UPDATE` — lock workspace row
2. Lock and validate both membership rows in deterministic order to prevent deadlocks:
   `SELECT user_id, role FROM workspace_members WHERE workspace_id = $workspace_id AND user_id IN ($current_user_id, $new_owner_id) ORDER BY user_id FOR UPDATE`
   (Validate caller has `role = 'owner'` and target successor has `role = 'admin'`)
3. `UPDATE workspace_members SET role = 'admin' WHERE workspace_id = $workspace_id AND user_id = $current_user_id` — demote existing Owner to Admin
4. `UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $workspace_id AND user_id = $new_owner_id` — promote successor Admin to Owner
5. `UPDATE workspaces SET owner_id = $new_owner_id, updated_at = now() WHERE id = $workspace_id` — update authoritative Owner reference

**Transaction boundary:** Single transaction with `FOR UPDATE` on workspace and membership rows.

**Rollback behavior:** Full rollback; previous ownership state restored (old Owner role, old `workspaces.owner_id`).

**Concurrency risks:** Two simultaneous transfers — `FOR UPDATE` on workspace serializes; only the first succeeds. The partial unique index `workspace_members_owner_partial_key` provides a database-level backstop: promoting the new Owner before demoting the old one would temporarily create two Owner rows and violate the unique index. The ordered steps (demote before promote) prevent this. Deterministic lock order on `workspace_members` (`ORDER BY user_id`) prevents deadlocks between concurrent membership operations.

**Constraints:** Partial unique index `workspace_members_owner_partial_key` ensures at most one Owner per workspace.

**Note on Owner departure:** This standalone transaction applies only when the current Owner remains a member of the workspace (stepping down to Admin). It does NOT remove the Owner's membership or alter their assigned tasks. If the Owner wishes to leave the workspace entirely, they must execute the atomic combined workflow in §8.15.

---

### 8.5 Project Creation and Initial Project Membership

**Validation:**
- Caller is a workspace member
- Project name is valid
- Project key is unique within workspace

**Database operations (in one transaction):**
1. `INSERT INTO projects (id, workspace_id, key, name, description, task_counter, created_by, created_at, updated_at) VALUES (..., 0, ...)`
2. `INSERT INTO project_members (id, project_id, workspace_id, user_id, role, created_at) VALUES (..., 'owner')`

**Transaction boundary:** Single transaction.

**Rollback behavior:** Full rollback; no project without initial membership.

**Concurrency risks:** Project key uniqueness race — handled by UNIQUE constraint `(workspace_id, key)`.

**Constraints:** Composite FK `project_members(project_id, workspace_id)` → `projects(id, workspace_id)` requires `projects` UNIQUE `(id, workspace_id)`.

---

### 8.6 Project Member Addition and Removal

**Addition validation:**
- Caller is authorized to manage project members
- Target user is a workspace member of the project's workspace
- Target user is not already a project member

**Addition operations (in one transaction):**
1. `INSERT INTO project_members (id, project_id, workspace_id, user_id, role, created_at) VALUES (gen_random_uuid(), $project_id, $workspace_id, $user_id, $role, now())`

**Direct Project Member Removal validation:**
- Caller is authorized to manage project members in the target project
- Target user is an active project member of the specified project

**Direct Project Member Removal operations (in one transaction):**
1. `SELECT * FROM project_members WHERE project_id = $project_id AND user_id = $user_id FOR UPDATE` — lock the project membership row
2. `SELECT id FROM tasks WHERE project_id = $project_id AND assignee_id = $user_id ORDER BY id FOR UPDATE` — find and lock all assigned tasks in this project in deterministic order (including soft-deleted tasks)
3. Set `assignee_id = NULL` on all those tasks (both active and soft-deleted) in this project and record activity log entries atomically via a data-modifying CTE:
   ```sql
   WITH unassigned_tasks AS (
       UPDATE tasks
       SET assignee_id = NULL, updated_at = now()
       WHERE project_id = $project_id
         AND assignee_id = $user_id
       RETURNING id, project_id
   )
   INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
   SELECT gen_random_uuid(), u.project_id, u.id, $actor_id, 'task_unassigned',
          jsonb_build_object('unassigned_user_id', $user_id), now()
   FROM unassigned_tasks u;
   ```
4. `DELETE FROM project_members WHERE project_id = $project_id AND user_id = $user_id` — remove the project membership row

**Transaction boundary:** Single transaction spanning steps 1–4.

**Rollback behavior:** Full rollback; no project membership removed, no tasks unassigned, and no activity logs written if any step fails.

**Concurrency control and isolation:**
- **Preventing concurrent task assignment to the departing member:** Step 1 acquires a `FOR UPDATE` lock on `project_members(project_id, user_id)`. In PostgreSQL, validating the composite FK `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id)` during task insert or assignment requires acquiring a `FOR KEY SHARE` lock on the referenced tuple in `project_members`. Because `FOR UPDATE` conflicts with `FOR KEY SHARE`, any concurrent transaction attempting to assign a task to `$user_id` in this project will block on Step 1. When Step 4 deletes the membership row and the transaction commits, the waiting assignment wakes up, finds the `project_members` row gone, and aborts with an FK violation (`tasks_assignee_membership_fk`).
- **Hierarchical and deterministic lock ordering:** Row locks follow the global hierarchy `project_members` → `tasks`. Task rows in Step 2 are acquired in deterministic order (`ORDER BY id FOR UPDATE`), eliminating AB-BA deadlocks between concurrent membership removals, assignments (§8.8), and creations (§8.7).
- **Preventing concurrent modifications to existing assigned tasks:** Step 2 locks existing assigned task rows with `FOR UPDATE`, serializing concurrent updates on those tasks until unassignment and activity logging complete in Step 3.
- **Atomic unassignment and audit logging:** Step 3 executes a data-modifying CTE (`UPDATE ... RETURNING` combined with `INSERT ... SELECT`) ensuring that each unassigned task receives exactly one activity log entry atomically within the same transaction.
- **Strict single-project scoping:** All statements are strictly filtered by `project_id = $project_id`. Tasks, assignments, and memberships in other projects (even within the same workspace) are never modified.
- **Handling soft-deleted tasks:** Steps 2 and 3 do not filter on `deleted_at IS NULL`. PostgreSQL's composite FK `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id) ON DELETE RESTRICT` enforces referential integrity across all rows in `tasks`. Soft-deleted tasks must be unassigned before deleting `project_members`, otherwise Step 4 will abort with an `ON DELETE RESTRICT` violation.
- **Workspace membership untouched:** The user remains a member of the workspace and retains access to all other projects.
- **Activity log preservation:** Historical logs remain intact; new `task_unassigned` events are recorded before membership deletion.

---

### 8.7 Task Creation and Atomic Identifier Generation

**Validation:**
- Caller is a project member
- Task title is valid
- Status/priority are valid domains
- Assignee (if provided) is a project member

**Consistent Lock Protocol & Assignee Validation:**
When an optional assignee is provided at task creation (`$assignee_id` is NOT NULL), the transaction adheres to the global **`project_members` → `tasks`** lock protocol. By acquiring a `FOR KEY SHARE` lock on the target `project_members` tuple before inserting into `tasks`, the transaction serializes against any concurrent project or workspace member removal transaction (§8.6, §8.13, §8.15) that holds `FOR UPDATE` on that membership, eliminating race conditions and deadlocks.

**Database operations (in one transaction):**

```sql
BEGIN;

-- 1. Atomically increment project task counter and lock the project row
UPDATE projects
SET task_counter = task_counter + 1
WHERE id = $project_id
RETURNING task_counter, key;

-- Application formats identifier:
-- identifier = key || '-' || LPAD(task_counter::text, GREATEST(3, LENGTH(task_counter::text)), '0')
-- e.g. DEV-001, DEV-999, DEV-1000 (minimum 3 digits, avoids truncating counters exceeding 999
-- up to the PostgreSQL int limit 2,147,483,647)

-- 2. If an assignee is specified, validate and lock project membership using FOR KEY SHARE
-- Adheres to the project_members -> tasks lock hierarchy to prevent deadlocks with member removal
SELECT id
FROM project_members
WHERE project_id = $project_id AND user_id = $assignee_id
FOR KEY SHARE;
-- If no row returned: target user is not a project member; ROLLBACK and abort with 400 Bad Request.

-- 3. Insert the new task
INSERT INTO tasks (
    id, project_id, identifier, title, description, status, priority,
    assignee_id, due_date, created_by, created_at, updated_at
) VALUES (
    $task_id, $project_id, $identifier, $title, $description, $status, $priority,
    $assignee_id, $due_date, $actor_id, now(), now()
);

-- 4. Record task creation in activity log
INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
VALUES (
    gen_random_uuid(), $project_id, $task_id, $actor_id, 'task_created',
    jsonb_build_object('identifier', $identifier, 'title', $title), now()
);

COMMIT;
```

**Transaction boundary:** Single transaction spanning counter increment, assignee lock validation (if present), task insert, and activity log insert.

**Rollback behavior:** Full rollback; counter increment is undone (a sequence gap is acceptable if rollback occurs).

**Concurrency risks and retry handling:**
- `UPDATE projects ... RETURNING` acquires an exclusive row lock on the project row, serializing all task creations for that project and preventing counter race conditions or duplicate identifiers.
- Acquiring `FOR KEY SHARE` on `project_members` before task insertion ensures task creation blocks if a concurrent removal is locking that member, preventing race conditions where a task is assigned to a member whose membership is being deleted.
- UNIQUE `(project_id, identifier)` provides the database-level uniqueness guarantee; any race or duplicate insert fails with `unique_violation`.
- In case of transient deadlock detection (`40P01`) or serialization failure (`40001`) under high concurrency, clients should retry the operation with exponential backoff and jitter (up to 3 retries).

**Constraints:** Composite FK `tasks(project_id, assignee_id)` → `project_members(project_id, user_id)` ON DELETE RESTRICT enforces assignee is a project member.

---

### 8.8 Task Assignment

**Validation:**
- Caller is a project member
- Target assignee (if provided) is a project member of the task's project
- Task exists and belongs to the specified project

**Consistent Lock Protocol & Deadlock Prevention:**
Membership-removal transactions (§8.13, §8.14, §8.15) acquire `FOR UPDATE` locks on `project_members` before acquiring `FOR UPDATE` locks on `tasks`. If a task assignment transaction updates or locks `tasks` before acquiring a lock on `project_members`, a classic AB-BA deadlock cycle can occur (removal holds lock on `project_members` and waits for `tasks`; assignment holds lock on `tasks` and waits for `project_members` during foreign key validation).

To eliminate this deadlock cycle, task assignment enforces a strict lock hierarchy: **`project_members` → `tasks`**.
1. When assigning a task to a member (`$assignee_id` is NOT NULL), the transaction must first acquire a `FOR KEY SHARE` lock on the target `project_members` row. This validates membership and blocks if a concurrent membership-removal transaction is executing (`FOR UPDATE` on `project_members` conflicts with `FOR KEY SHARE`). If the removal commits, the membership is deleted and the assignment immediately aborts without acquiring any task lock.
2. Only after securing the `project_members` lock does the transaction lock and update the `tasks` row.
3. When unassigning a task (`$assignee_id IS NULL`), no `project_members` row is referenced, so the transaction updates the task directly.

**Database operations (in one transaction):**

```sql
BEGIN;

-- 1. If assigning to a user ($assignee_id IS NOT NULL), lock the project_members row first
-- Acquiring FOR KEY SHARE establishes the project_members -> tasks lock hierarchy,
-- serializing against concurrent project/workspace member removal transactions.
SELECT id
FROM project_members
WHERE project_id = $project_id AND user_id = $assignee_id
FOR KEY SHARE;
-- If no row returned: target user is not a project member; ROLLBACK and abort with 400 Bad Request.

-- 2. Lock and update the task
UPDATE tasks
SET assignee_id = $assignee_id, updated_at = now()
WHERE id = $task_id AND project_id = $project_id;
-- If no row updated: task not found or project mismatch; ROLLBACK and abort with 404 Not Found.

-- 3. Record assignment activity log
INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
VALUES (
    gen_random_uuid(),
    $project_id,
    $task_id,
    $actor_id,
    CASE WHEN $assignee_id IS NULL THEN 'task_unassigned' ELSE 'task_assigned' END,
    CASE WHEN $assignee_id IS NULL
         THEN jsonb_build_object('unassigned_by', $actor_id)
         ELSE jsonb_build_object('assignee_id', $assignee_id)
    END,
    now()
);

COMMIT;
```

**Transaction boundary:** Single transaction spanning steps 1–3.

**Rollback behavior:** Full rollback if assignee validation fails, task is not found, foreign key constraint fails, or any statement encounters an error.

**Concurrency risks and retry handling:**
- **Lock ordering:** By locking `project_members` (`FOR KEY SHARE`) prior to updating `tasks` (`FOR UPDATE` implicitly acquired by `UPDATE`), the transaction eliminates the AB-BA deadlock cycle with concurrent membership removals (§8.13, §8.14, §8.15), which always lock `project_members` before `tasks`.
- **Authoritative constraint guarantee:** The database composite foreign key `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id) ON DELETE RESTRICT` remains the final, unconditional integrity guarantee enforced by PostgreSQL at statement execution and commit time.
- **Deadlock and serialization error handling:** Consistent lock ordering eliminates systematic deadlocks between assignment and removal, but cannot eliminate all potential concurrency edge cases in a busy relational database (e.g. concurrent overlapping multi-row operations or serialization anomalies under `REPEATABLE READ` / `SERIALIZABLE` isolation). Applications must handle PostgreSQL error codes `40P01` (`deadlock_detected`) and `40001` (`serialization_failure`) by retrying the entire transaction with exponential backoff and jitter (up to 3 retries recommended).

**Constraints:** Composite FK `tasks(project_id, assignee_id)` → `project_members(project_id, user_id)` ON DELETE RESTRICT; single-column FK `assignee_id → users(id)` ON DELETE SET NULL.

---

### 8.9 Task Status Update and Activity Log Creation

**Validation:**
- Caller is a project member
- New status is a valid domain value

**Database operations:**
1. `UPDATE tasks SET status = $new_status, updated_at = now() WHERE id = $task_id AND deleted_at IS NULL`
2. `INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at) VALUES (..., 'task_status_changed', ...)` with metadata containing old/new status

**Transaction boundary:** Single transaction.

**Rollback behavior:** Full rollback.

**Concurrency risks:** Concurrent status updates — last write wins; activity log captures each change.

**Constraints:** CHECK on status domain; FK `task_id` → `tasks(id)` ON DELETE SET NULL.

---

### 8.10 Task Soft Deletion

**Validation:**
- Caller is a project member with delete permission
- Task exists and is not already deleted

**Database operations:**
1. `UPDATE tasks SET deleted_at = now(), updated_at = now() WHERE id = $task_id AND deleted_at IS NULL`

**Transaction boundary:** Single transaction (single statement).

**Rollback behavior:** Statement-level rollback on failure.

**Concurrency risks:** Concurrent delete — second update affects 0 rows (already deleted).

**Constraints:** `deleted_at` is nullable; default queries filter `WHERE deleted_at IS NULL`. Comments and activity logs are preserved (task is not hard-deleted).

---

### 8.11 Comment Creation and Activity Log Creation

**Validation:**
- Caller is a project member of the task's project
- Comment body is non-empty

**Database operations:**
1. `INSERT INTO comments (id, task_id, author_id, body, created_at, updated_at) VALUES (...)`
2. `INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at) VALUES (..., 'comment_added', ...)`

**Transaction boundary:** Single transaction.

**Rollback behavior:** Full rollback; no comment without activity log.

**Concurrency risks:** None significant.

**Constraints:** FKs to tasks and users.

---

### 8.12 Refresh Token Rotation and Reuse Detection

**Validation:**
- Refresh token cookie is present
- Token hash matches a session with `revoked_at IS NULL AND expires_at > now()`

**Database operations (in one transaction):**
1. `SELECT id, user_id, revoked_at FROM refresh_sessions WHERE token_hash = $1 FOR UPDATE`
2. If `revoked_at IS NOT NULL` (reuse detected): `UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $user_id` (revoke all user sessions); return 401
3. If valid: `UPDATE refresh_sessions SET revoked_at = now() WHERE id = $session_id`
4. `INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (..., new_token_hash, ..., NULL, ...)`

**Transaction boundary:** Single transaction with `FOR UPDATE` row lock.

**Rollback behavior:** Full rollback; no rotation on failure.

**Concurrency risks:** Concurrent refresh with same token — `FOR UPDATE` serializes; second transaction finds session already revoked, triggers revocation of all user sessions.

**Constraints:** UNIQUE `token_hash`; FK `user_id` → `users(id)` ON DELETE CASCADE.

**Revocation terminology:** Revocation operates on **all sessions for a user** (set `revoked_at` on all rows matching `user_id`). There is no distinct `family_id` column grouping related token rotations; the entire set of a user's sessions serves as family-level revocation by approximation.

### 8.13 Workspace Member Removal (with Task Unassignment)

**Validation:**
- Caller is authorized to remove workspace members (workspace Owner or Admin)
- Target user is a workspace member
- If target is the workspace Owner, standalone removal via this section is prohibited; the combined atomic Owner voluntary departure transaction (§8.15) must be used (Decision 3)

**Database operations (in one transaction):**
1. `SELECT * FROM workspace_members WHERE workspace_id = $workspace_id AND user_id = $user_id FOR UPDATE` — lock workspace membership row
2. `SELECT * FROM project_members WHERE workspace_id = $workspace_id AND user_id = $user_id ORDER BY project_id, id FOR UPDATE` — lock all project memberships for this user in this workspace in deterministic order
3. `SELECT t.id, t.project_id FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.workspace_id = $workspace_id AND t.assignee_id = $user_id ORDER BY t.project_id, t.id FOR UPDATE OF t` — find and lock all assigned tasks in this workspace using the project relationship in deterministic order (including soft-deleted tasks; no `deleted_at IS NULL` filter)
4. Set `assignee_id = NULL` on all those tasks (both active and soft-deleted) scoped to the target workspace and insert activity log records atomically using a data-modifying CTE:
   ```sql
   WITH unassigned_tasks AS (
       UPDATE tasks t
       SET assignee_id = NULL, updated_at = now()
       FROM projects p
       WHERE t.project_id = p.id
         AND p.workspace_id = $workspace_id
         AND t.assignee_id = $user_id
       RETURNING t.id, t.project_id
   )
   INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
   SELECT gen_random_uuid(), u.project_id, u.id, $actor_id, 'task_unassigned',
          jsonb_build_object('unassigned_user_id', $user_id), now()
   FROM unassigned_tasks u;
   ```
5. `DELETE FROM workspace_members WHERE workspace_id = $workspace_id AND user_id = $user_id` — remove workspace membership (cascades to `project_members` via ON DELETE CASCADE once tasks are unassigned)

**Transaction boundary:** Single transaction spanning steps 1–5.

**Rollback behavior:** Full rollback; no membership removed, no tasks unassigned, and no activity logs written if any step fails.

**Concrete concurrency-control strategy:**
- **Preventing concurrent member removal:** Step 1 locks the `workspace_members` row with `FOR UPDATE`, serializing concurrent removal or role change attempts for this membership.
- **Preventing concurrent task assignment to the departing member:** Step 2 acquires a `FOR UPDATE` lock on all `project_members` tuples for `$user_id` in this workspace. In PostgreSQL, when a concurrent transaction creates a new task or updates `tasks.assignee_id = $user_id`, PostgreSQL validates the composite foreign key constraint `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id)` by attempting to acquire a `FOR KEY SHARE` lock on the referenced tuple in `project_members`. Because `FOR UPDATE` conflicts with `FOR KEY SHARE`, any concurrent task assignment transaction will block on Step 2. When Step 5 deletes `workspace_members` (cascading to delete all `project_members` for this user in this workspace) and the transaction commits, the waiting task assignment transaction resumes, discovers that the `project_members` row no longer exists, and fails with a foreign key violation (`tasks_assignee_membership_fk`). Thus, concurrent task assignments cannot race with membership removal.
- **Hierarchical and deterministic lock ordering:** Row locks follow the strict hierarchy `workspace_members` → `project_members` → `tasks`. Deterministic sorting is enforced across all multi-row locks (`ORDER BY project_id, id` on `project_members`, and `ORDER BY t.project_id, t.id` on `tasks`). This deterministic ordering eliminates AB-BA deadlocks between concurrent member removals, assignments (§8.8), and creations (§8.7).
- **Preventing concurrent modifications to existing assigned tasks:** Step 3 executes `FOR UPDATE OF t` on all assigned tasks in the target workspace, serializing any concurrent updates to those tasks until unassignment and activity logging complete in Step 4.
- **Atomic unassignment and audit logging:** Step 4 uses an atomic data-modifying CTE (`UPDATE ... RETURNING` combined with `INSERT ... SELECT`) so that every successfully unassigned task generates exactly one corresponding `activity_logs` entry within the same statement and transaction. If the transaction aborts, both the unassignments and activity logs are rolled back completely.
- **Cross-workspace isolation:** Steps 3 and 4 scope affected tasks strictly using the project relationship `JOIN projects p ON t.project_id = p.id WHERE p.workspace_id = $workspace_id`. Tasks belonging to projects in other workspaces are never locked, modified, or unassigned.
- **Handling soft-deleted tasks:** Steps 3 and 4 explicitly omit any `deleted_at IS NULL` filter. PostgreSQL's composite FK `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id) ON DELETE RESTRICT` evaluates across all rows in `tasks`. If soft-deleted tasks were omitted, Step 5 would abort with a RESTRICT violation when cascading to `project_members`.
- **Audit preservation:** Step 4 records a `task_unassigned` activity log for each affected task atomically before membership deletion. Past activity logs created by the user remain intact because `activity_logs.actor_id` references `users(id)`, not `workspace_members`, and activity logs are append-only.

**Constraints:** Composite FK `tasks(project_id, assignee_id) → project_members(project_id, user_id) ON DELETE RESTRICT` blocks step 5 if any task (active or soft-deleted) in the workspace still references the departing member's `project_members` row. Steps 3–4 guarantee those references are cleared first.

**Interaction with `assignee_id → users(id) ON DELETE SET NULL`:** This single-column FK only triggers on user hard-deletion (`DELETE FROM users`), not on workspace member removal. During workspace member removal, `assignee_id` is explicitly set to NULL by step 4 (application-level), not by a FK cascade.

### 8.14 Direct Project Member Removal

**Validation:**
- Caller is authorized to manage project members in the target project
- Target user is an active project member of the specified project

**Database operations (in one transaction):**
1. `SELECT * FROM project_members WHERE project_id = $project_id AND user_id = $user_id FOR UPDATE` — lock the project membership row
2. `SELECT t.id FROM tasks t WHERE t.assignee_id = $user_id AND t.project_id = $project_id ORDER BY t.id FOR UPDATE` — find and lock all assigned tasks in this project in deterministic order (including soft-deleted tasks; no `deleted_at IS NULL` filter)
3. Set `assignee_id = NULL` on all those tasks (both active and soft-deleted) in this project and record activity log entries atomically via a data-modifying CTE:
   ```sql
   WITH unassigned_tasks AS (
       UPDATE tasks
       SET assignee_id = NULL, updated_at = now()
       WHERE project_id = $project_id
         AND assignee_id = $user_id
       RETURNING id, project_id
   )
   INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
   SELECT gen_random_uuid(), u.project_id, u.id, $actor_id, 'task_unassigned',
          jsonb_build_object('unassigned_user_id', $user_id), now()
   FROM unassigned_tasks u;
   ```
4. `DELETE FROM project_members WHERE project_id = $project_id AND user_id = $user_id` — remove project membership

**Transaction boundary:** Single transaction spanning steps 1–4.

**Rollback behavior:** Full rollback; no project membership removed, no tasks unassigned, and no activity logs written if any step fails.

**Concrete concurrency-control strategy:**
- **Preventing concurrent task assignment to the departing member:** Step 1 acquires a `FOR UPDATE` lock on `project_members(project_id, user_id)`. In PostgreSQL, validating the composite FK `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id)` on `INSERT` or `UPDATE` of a task requires acquiring a `FOR KEY SHARE` lock on the referenced tuple in `project_members`. Because `FOR UPDATE` conflicts with `FOR KEY SHARE`, any concurrent transaction attempting to assign a task to `$user_id` in this project will block on Step 1. When Step 4 deletes the membership row and the transaction commits, the waiting assignment wakes up, discovers that the `project_members` row has been deleted, and aborts with a foreign key violation (`tasks_assignee_membership_fk`).
- **Hierarchical and deterministic lock ordering:** Row locks follow the strict hierarchy `project_members` → `tasks`. Step 2 locks task rows in deterministic order (`ORDER BY t.id FOR UPDATE`), preventing intra-statement and cross-transaction deadlocks with concurrent task assignments (§8.8) and task creations (§8.7).
- **Preventing concurrent modifications to existing assigned tasks:** Step 2 locks existing assigned task rows with `FOR UPDATE`, serializing concurrent updates to those tasks until unassignment and activity logging complete in Step 3.
- **Atomic unassignment and audit logging:** Step 3 executes a data-modifying CTE (`UPDATE ... RETURNING` combined with `INSERT ... SELECT`), ensuring that exactly one activity log is written for each unassigned task within the same statement and transaction.
- **Strict single-project scoping:** All statements (steps 1–4) are strictly filtered by `project_id = $project_id`. Tasks, memberships, and assignments in other projects—even within the same workspace—are never locked, altered, or unassigned.
- **Handling soft-deleted tasks:** Steps 2 and 3 do not filter on `deleted_at IS NULL`. In PostgreSQL, foreign keys do not ignore soft-deleted rows; unassigning both active and soft-deleted tasks ensures Step 4 succeeds without violating `tasks_assignee_membership_fk ON DELETE RESTRICT`.
- **Workspace membership untouched:** The departing user remains a member of the workspace and retains access to any other projects to which they belong.
- **Activity log preservation:** Historical logs remain intact; new `task_unassigned` events are recorded before membership deletion.

**Constraints:** Composite FK `tasks(project_id, assignee_id) → project_members(project_id, user_id) ON DELETE RESTRICT` blocks step 4 if any task (active or soft-deleted) still references the membership. Steps 2–3 clear those references first.

**Scope:** This operation removes the user from one project only. The user remains a workspace member and retains access to other projects in the same workspace. Workspace membership is unaffected.

### 8.15 Owner Voluntary Departure Transaction (Combined Transfer, Unassignment, and Removal)

**Scope and Business Context:**
Approved Decision 3 mandates that a workspace Owner cannot leave the workspace while remaining Owner; ownership transfer and the departing Owner's membership removal must occur atomically within a single transaction. This operation combines ownership transfer to an eligible Admin, task unassignment across all projects in the workspace, audit logging, and workspace membership removal. If an Owner merely wishes to step down to an Admin while remaining a member of the workspace, standalone ownership transfer (§8.4) is used instead.

**Validation:**
- Current caller is the authenticated workspace Owner (`workspaces.owner_id = current_user_id` and has `role = 'owner'` in `workspace_members`)
- Target successor is an existing member of this workspace with the **Admin** role (`role = 'admin'` per Decision 3)
- Target successor is distinct from the departing Owner (`successor_user_id != current_user_id`)
- Workspace must never be left without an Owner

**Database Operations and Transaction Sequence (in a single atomic transaction):**

```sql
BEGIN;

-- 1. Lock the workspace row (authoritative root lock)
SELECT id, owner_id
FROM workspaces
WHERE id = $workspace_id AND owner_id = $current_user_id
FOR UPDATE;

-- 2. Lock and validate workspace memberships in deterministic order to prevent deadlocks
SELECT user_id, role
FROM workspace_members
WHERE workspace_id = $workspace_id
  AND user_id IN ($current_user_id, $successor_user_id)
ORDER BY user_id
FOR UPDATE;
-- Application validation:
-- Verify $current_user_id has role = 'owner'
-- Verify $successor_user_id has role = 'admin' (Decision 3 eligibility)
-- If either validation fails, ROLLBACK and abort with 400/403.

-- 3. Lock all project memberships for the departing Owner in this workspace in deterministic order
SELECT id, project_id
FROM project_members
WHERE workspace_id = $workspace_id AND user_id = $current_user_id
ORDER BY project_id, id
FOR UPDATE;

-- 4. Demote departing Owner to Admin
-- Necessary ordered transition to respect the partial unique index
-- workspace_members_owner_partial_key (WHERE role = 'owner')
UPDATE workspace_members
SET role = 'admin'
WHERE workspace_id = $workspace_id AND user_id = $current_user_id;

-- 5. Promote eligible Admin successor to Owner
UPDATE workspace_members
SET role = 'owner'
WHERE workspace_id = $workspace_id AND user_id = $successor_user_id;

-- 6. Update authoritative Owner reference on the workspace
UPDATE workspaces
SET owner_id = $successor_user_id, updated_at = now()
WHERE id = $workspace_id;

-- 7. Find and lock all tasks assigned to the departing Owner in this workspace in deterministic order (including soft-deleted)
-- Joined strictly through projects to isolate to the target workspace.
-- Omits "deleted_at IS NULL" because composite FK tasks(project_id, assignee_id)
-- -> project_members(project_id, user_id) ON DELETE RESTRICT enforces across all tasks.
SELECT t.id, t.project_id
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.workspace_id = $workspace_id
  AND t.assignee_id = $current_user_id
ORDER BY t.project_id, t.id
FOR UPDATE OF t;

-- 8. Unassign all those tasks (both active and soft-deleted) in this workspace and write audit activity log records atomically
WITH unassigned_tasks AS (
    UPDATE tasks t
    SET assignee_id = NULL, updated_at = now()
    FROM projects p
    WHERE t.project_id = p.id
      AND p.workspace_id = $workspace_id
      AND t.assignee_id = $current_user_id
    RETURNING t.id, t.project_id
)
INSERT INTO activity_logs (id, project_id, task_id, actor_id, action, metadata, created_at)
SELECT gen_random_uuid(), u.project_id, u.id, $current_user_id, 'task_unassigned',
       jsonb_build_object('unassigned_user_id', $current_user_id, 'reason', 'owner_departure'), now()
FROM unassigned_tasks u;

-- 9. Delete the departing Owner's workspace membership
DELETE FROM workspace_members
WHERE workspace_id = $workspace_id AND user_id = $current_user_id;
-- Cascades via ON DELETE CASCADE to delete all project_members rows for the departing user in this workspace.
-- Because step 8 cleared assignee_id on all referencing tasks (active and soft-deleted),
-- composite FK tasks(project_id, assignee_id) -> project_members(project_id, user_id) ON DELETE RESTRICT
-- does not block the cascade deletion.

COMMIT;
```

**Transaction Boundary:** Single transaction spanning steps 1–9.

**Rollback Behavior:**
Full rollback (`ROLLBACK`) if any validation fails, any prerequisite is missing, or any SQL statement encounters an error. No partial transition occurs: the departing Owner remains the Owner with all memberships and task assignments intact, and the successor remains an Admin.

**Concurrency Control and Invariant Guarantees:**
- **Deadlock prevention via consistent lock ordering:** Row locks are acquired hierarchically and deterministically:
  1. `workspaces` row locked first (`FOR UPDATE`).
  2. `workspace_members` rows locked in ascending order of `user_id` (`ORDER BY user_id FOR UPDATE`).
  3. `project_members` rows locked in ascending order of `(project_id, id)` (`ORDER BY project_id, id FOR UPDATE`).
  4. Assigned `tasks` rows locked last in ascending order of `(project_id, id)` (`ORDER BY t.project_id, t.id FOR UPDATE OF t`).
  This consistent global hierarchy and deterministic intra-statement row ordering prevents cyclic lock dependencies (AB-BA deadlocks) across concurrent transactions (including member removal, task assignment §8.8, and task creation §8.7).
- **Preventing concurrent task assignments to the departing Owner:** Step 3 acquires `FOR UPDATE` on all `project_members` rows for the departing Owner in this workspace. In PostgreSQL, validating the composite FK `tasks(project_id, assignee_id) REFERENCES project_members(project_id, user_id)` on `INSERT` or `UPDATE` of a task requires acquiring a `FOR KEY SHARE` lock on the referenced tuple in `project_members`. Because `FOR UPDATE` conflicts with `FOR KEY SHARE`, any concurrent transaction attempting to assign a task to `$current_user_id` in this workspace will block on Step 3. When Step 9 deletes `workspace_members` (cascading to delete `project_members`) and the departure transaction commits, the waiting assignment wakes up, discovers that the `project_members` row has been deleted, and aborts with a foreign key violation (`tasks_assignee_membership_fk`).
- **Preventing concurrent project membership additions:** Step 2 locks the departing user's `workspace_members` row. Because creating a `project_members` row checks `(workspace_id, user_id) REFERENCES workspace_members(workspace_id, user_id)` (which acquires `FOR KEY SHARE` on `workspace_members`), concurrent additions of the departing user to new projects in this workspace will block on Step 2 and subsequently fail once the membership is deleted.
- **Exactly-one Owner invariant preservation:**
  - *At most one Owner:* Demoting the departing Owner to Admin (Step 4) before promoting the successor to Owner (Step 5) guarantees that at no intermediate point do two rows have `role = 'owner'`, satisfying the database partial unique index `workspace_members_owner_partial_key`.
  - *Exactly one Owner:* At commit, the successor holds `role = 'owner'` and `workspaces.owner_id` points to the successor. The departing user's membership (now `role = 'admin'`) is deleted in Step 9. The committed workspace has exactly one Owner.
- **Atomic unassignment and audit logging:** Step 8 executes a single data-modifying CTE (`UPDATE ... RETURNING` combined with `INSERT ... SELECT`) that guarantees exactly one activity log record is created for each unassigned task within the same transaction.
- **Cross-workspace isolation:** Steps 1–9 are strictly scoped by `workspace_id = $workspace_id` or join through `projects p WHERE p.workspace_id = $workspace_id`. Tasks, projects, and memberships in other workspaces are never locked, modified, or unassigned.
- **Handling soft-deleted tasks:** Steps 7 and 8 explicitly include soft-deleted tasks (omitting `deleted_at IS NULL`). PostgreSQL foreign key constraints do not ignore soft-deleted rows; unassigning all referencing tasks ensures Step 9's cascade deletion of `project_members` succeeds without violating `tasks_assignee_membership_fk ON DELETE RESTRICT`.
- **Preservation of audit history:** Historical activity logs authored by or referencing the departing Owner are preserved indefinitely (`activity_logs.actor_id` references `users(id)` with `RESTRICT`, and user accounts are not deleted on workspace departure). New `task_unassigned` activity log entries are recorded before membership deletion.

## 9. Soft Deletion and Archival Strategy

- **Tasks**: `deleted_at` soft delete. Default queries exclude deleted tasks. Comments and activity logs preserved (task is not hard-deleted; `task_id` in activity logs is preserved).
- **Workspaces**: `deleted_at` soft delete (archive). Workspace and its resources become inaccessible. Members remain as records.
- **Projects**: `deleted_at` soft delete (archive). Project tasks remain; activity logs preserved.
- **Comments**: `deleted_at` soft delete (author deletes own comment). Comment text preserved; `deleted_at` marks it hidden.
- **Activity logs**: Append-only, no soft delete. `task_id` preserved on task soft-delete; set NULL only on hard delete (not used in normal operation). Project hard-deletion is blocked by `ON DELETE RESTRICT` when activity logs reference the project. Activity logs are never hard-deleted by application users.
- **Refresh sessions**: Hard delete on user deletion (CASCADE) or explicit revocation (mark `revoked_at`).
- **Invitations**: Marked `accepted_at` or `revoked_at`. Expired invitations cleaned up by background job.

**Rationale:** Soft deletion preserves historical activity information as required by the PRD.

## 10. Data Retention Considerations

- **Refresh sessions**: Expired sessions (`expires_at < now()`) cleaned up by background job. Revoked sessions retained for audit (configurable retention).
- **Password reset tokens**: Expired or used tokens cleaned up by background job (e.g. after 24 hours).
- **Invitations**: Expired/revoked/accepted invitations retained for audit; cleanup after configurable period (e.g. 30 days).
- **Activity logs**: Append-only indefinitely; no application-level deletion. Project hard-deletion blocked by `ON DELETE RESTRICT` when activity logs reference the project. Retention policy (archive to cold storage) to be defined post-MVP.
- **Soft-deleted tasks/workspaces/projects/comments**: Retained indefinitely; no automatic hard delete in MVP.

## 11. Dashboard Query Considerations

| Metric | Query Approach | Indexes Used |
|--------|---------------|--------------|
| Total projects | `SELECT COUNT(*) FROM projects WHERE workspace_id = $1 AND deleted_at IS NULL` | `projects_active_idx`, `projects_workspace_id_idx` |
| Total tasks | `SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.workspace_id = $1 AND t.deleted_at IS NULL AND p.deleted_at IS NULL` | `tasks_project_id_idx`, `projects_active_idx` |
| Tasks by status | `SELECT status, COUNT(*) FROM tasks t JOIN projects p ON ... WHERE p.workspace_id = $1 AND t.deleted_at IS NULL GROUP BY status` | `tasks_project_status_idx` (partial) |
| My assigned tasks | `SELECT * FROM tasks WHERE assignee_id = $1 AND deleted_at IS NULL` | `tasks_assignee_id_idx` (partial) |
| Overdue tasks | `SELECT * FROM tasks t JOIN projects p ON ... WHERE p.workspace_id = $1 AND t.due_date < now() AND t.status != 'done' AND t.deleted_at IS NULL` | `tasks_due_date_idx` (partial) |
| Recent activity | `SELECT * FROM activity_logs WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = $1) ORDER BY created_at DESC LIMIT N` | `activity_logs_project_id_idx` |
| Project progress | `SELECT (COUNT(*) FILTER (WHERE status = 'done'))::float / NULLIF(COUNT(*), 0) * 100 FROM tasks WHERE project_id = $1 AND deleted_at IS NULL` | `tasks_project_id_idx` |

**Note:** Progress returns 0 when no tasks exist (`NULLIF(COUNT(*), 0)` yields NULL; coalesce to 0 in application).

## 12. Database-Level vs Application-Level Responsibilities

| Responsibility | Level | Mechanism |
|---------------|-------|-----------|
| Email uniqueness | Database | UNIQUE constraint |
| One membership per user per workspace | Database | UNIQUE `(workspace_id, user_id)` |
| One membership per user per project | Database | UNIQUE `(project_id, user_id)` |
| Role domain (owner/admin/member) | Database | CHECK constraint |
| Task status domain | Database | CHECK constraint |
| Task priority domain | Database | CHECK constraint |
| Task identifier unique per project | Database | UNIQUE `(project_id, identifier)` |
| Project key unique per workspace | Database | UNIQUE `(workspace_id, key)` |
| At most one Owner per workspace | Database | Partial unique index |
| Project belongs to one workspace | Database | FK `projects.workspace_id` |
| Project member workspace matches project | Database | Composite FK |
| Project member is workspace member | Database | Composite FK `project_members(workspace_id, user_id)` → `workspace_members(workspace_id, user_id)` |
| Assignee is project member | Database | Composite FK `tasks(project_id, assignee_id)` → `project_members(project_id, user_id)` ON DELETE RESTRICT |
| Workspace owner is a workspace member with role owner | Application + Transaction | Application inserts both rows atomically; no cross-table FK possible |
| Invitation email matches accepting account | Application | Application validates before marking accepted |
| Workspace Admin ≠ automatic project access | Application | Authorization middleware checks `project_members`, not just `workspace_members` |
| Comment edit/delete by author only | Application | Authorization checks `author_id = current_user` |
| Atomic counter increment | Database + Transaction | `UPDATE ... RETURNING` inside transaction |
| Token reuse detection | Database + Transaction | `revoked_at` check + all-user-session revocation in transaction |
| Authorization for all sensitive operations | Application | Middleware/usecase layer validates on every request |

## 13. SQL Examples (Documentation Only)

### Core tables and foreign keys

```sql
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
```

### Workspace Owner uniqueness

```sql
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
```

### Project membership integrity (composite FKs)

```sql
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
CREATE INDEX projects_active_idx ON projects(id) WHERE deleted_at IS NULL;

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
    -- Note: Direct FK user_id -> users(id) is omitted as redundant;
    -- composite FK to workspace_members(workspace_id, user_id) provides integrity and cascades on user deletion.
);

CREATE UNIQUE INDEX project_members_project_user_key ON project_members(project_id, user_id);
CREATE UNIQUE INDEX project_members_project_workspace_key ON project_members(project_id, workspace_id);
CREATE INDEX project_members_project_id_idx ON project_members(project_id);
CREATE INDEX project_members_user_id_idx ON project_members(user_id);
```

### Task assignee membership integrity

```sql
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
        REFERENCES project_members(project_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tasks_project_identifier_key ON tasks(project_id, identifier);
CREATE INDEX tasks_project_id_idx ON tasks(project_id);
CREATE INDEX tasks_project_status_idx ON tasks(project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX tasks_assignee_id_idx ON tasks(assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_due_date_idx ON tasks(due_date) WHERE deleted_at IS NULL AND status != 'done';

-- Separate single-column FK for user reference (SET NULL on user deletion)
ALTER TABLE tasks
    ADD CONSTRAINT tasks_assignee_user_fk
    FOREIGN KEY (assignee_id)
    REFERENCES users(id) ON DELETE SET NULL;
```

### Atomic task counter increment

```sql
-- Inside a transaction:
UPDATE projects
SET task_counter = task_counter + 1
WHERE id = $1
RETURNING task_counter, key;

-- Format identifier:
-- identifier = key || '-' || LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')
-- Examples: DEV-001, DEV-999, DEV-1000 (minimum 3 digits, never truncated when counter exceeds 999 up to PostgreSQL int limit 2,147,483,647)

-- If assignee_id ($7) is provided, validate and lock membership first (project_members -> tasks lock hierarchy):
-- SELECT id FROM project_members WHERE project_id = $1 AND user_id = $7 FOR KEY SHARE;

-- Then insert task with the returned counter formatted as identifier:
INSERT INTO tasks (id, project_id, identifier, title, status, priority, assignee_id, due_date, created_by, created_at, updated_at)
VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now(), now());
```

### Task identifier uniqueness

```sql
-- Already enforced by: CREATE UNIQUE INDEX tasks_project_identifier_key ON tasks(project_id, identifier);
-- Duplicate identifier insert for same project fails with unique_violation.
```

### Soft-delete-aware task queries

```sql
-- Default task listing (excludes deleted)
SELECT * FROM tasks WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC;

-- Kanban board by status (excludes deleted)
SELECT * FROM tasks WHERE project_id = $1 AND deleted_at IS NULL AND status = $2 ORDER BY created_at DESC;

-- Overdue tasks (exclude completed and deleted)
SELECT t.* FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.workspace_id = $1
  AND t.due_date < now()
  AND t.status != 'done'
  AND t.deleted_at IS NULL
  AND p.deleted_at IS NULL;
```

### Relevant partial indexes (immutable predicates only)

```sql
-- Active sessions only (refresh validation; expiration checked in query)
CREATE INDEX refresh_sessions_active_idx ON refresh_sessions(revoked_at, expires_at)
    WHERE revoked_at IS NULL;

-- Pending invitations only (acceptance validation; expiration checked in query)
CREATE INDEX workspace_invitations_active_idx ON workspace_invitations(accepted_at, revoked_at, expires_at)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Active workspaces
CREATE INDEX workspaces_active_idx ON workspaces(id) WHERE deleted_at IS NULL;

-- Active projects
CREATE INDEX projects_active_idx ON projects(id) WHERE deleted_at IS NULL;

-- Tasks by project and status, excluding deleted (Kanban/dashboard)
CREATE INDEX tasks_project_status_idx ON tasks(project_id, status)
    WHERE deleted_at IS NULL;

-- My assigned tasks, excluding deleted
CREATE INDEX tasks_assignee_id_idx ON tasks(assignee_id)
    WHERE deleted_at IS NULL;

-- Overdue tasks (exclude completed and deleted)
CREATE INDEX tasks_due_date_idx ON tasks(due_date)
    WHERE deleted_at IS NULL AND status != 'done';

-- Comments by task, excluding deleted
CREATE INDEX comments_task_created_idx ON comments(task_id, created_at)
    WHERE deleted_at IS NULL;
```

## 14. Consistency Audit

| Audit Item | Result |
|------------|--------|
| Every ERD entity exists in table specification | PASS — 11 tables in both (10 active for MVP; `password_reset_tokens` deferred to post-MVP) |
| Every FK references an existing PK/unique key | PASS — all FKs reference `id` PKs or composite unique keys |
| Composite FKs have matching referenced unique constraints | PASS — `projects(id, workspace_id)` unique index exists; `project_members(project_id, user_id)` unique index exists; `workspace_members(workspace_id, user_id)` unique index exists |
| No column-list SET NULL on non-null composite FK columns | PASS — composite task assignee FK uses ON DELETE RESTRICT; separate single-column FK `assignee_id → users(id)` uses ON DELETE SET NULL |
| Partial indexes use immutable predicates (no `now()`) | PASS — all predicates are column-condition-only |
| No conflicting relationship definitions | PASS — all relationships documented consistently |
| No authorization rule contradicts approved decisions | PASS — Decision 5 (project members only) reflected in FK and authorization design |
| Task counter generation safe under concurrency | PASS — `UPDATE ... RETURNING` with row lock serializes per-project counter increments |
| Soft deletion preserves historical records | PASS — `deleted_at` on tasks; comments/activity_logs preserved; `task_id` preserved on soft-delete |
| Ownership transfer is atomic | PASS — single transaction with `FOR UPDATE` on workspace and membership rows (§8.4) |
| Owner voluntary departure is atomic | PASS — single transaction combining ownership transfer, task unassignment, and member removal (§8.15) |
| Ownership transfer successor eligibility consistent | PASS — eligible successor must hold Admin role per Decision 3 |
| Task identifier length accommodates counter headroom | PASS — `tasks.identifier varchar(30)` supports 10-char key + hyphen + 10-digit counter with headroom |
| Task counter upper bound explicitly documented | PASS — signed 32-bit integer supporting up to 2,147,483,647 tasks per project without open-ended integer overflow claims |
| Lock ordering prevents deadlocks between removal and assignment | PASS — strict `project_members` → `tasks` hierarchy enforced across operations (§8.7, §8.8, §8.13, §8.14, §8.15) |
| Deterministic lock ordering on multi-row locks | PASS — all multi-row `SELECT ... FOR UPDATE` statements include explicit `ORDER BY` clauses |
| Activity log generation on member removal is valid SQL | PASS — data-modifying CTE (`UPDATE ... RETURNING` + `INSERT ... SELECT`) writes exactly one log per unassigned task atomically |
| Invitation acceptance safe under concurrency | PASS — `FOR UPDATE` row lock + `accepted_at` check-and-set |
| SQL examples valid PostgreSQL syntax | PASS — standard DDL/DML compatible with PostgreSQL 14+ |
| Schema compatible with pgx and sqlc | PASS — UUID, timestamptz, jsonb, varchar all supported |
| Indexes support documented query patterns | PASS — all dashboard, Kanban, listing, and lookup patterns have supporting indexes |
| Project key included in schema and examples | PASS — `projects.key varchar(10) NOT NULL` with UNIQUE `(workspace_id, key)` |
| Project-level roles not over-scoped | PASS — documented as not introducing new PRD permissions |

**No implementation or migration files were created.** This document contains DDL examples for documentation purposes only. Migration files (golang-migrate format) will be created in Sprint 1.
