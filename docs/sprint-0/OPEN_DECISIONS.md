# DevFlow — Open Decisions

## Decision Governance

DevFlow enforces a strict distinction between **APPROVED architectural decisions** and **PROPOSED future recommendations**:
- **Decisions 1 through 6:** Formally **APPROVED** and binding for Sprint 0 through MVP implementation. They establish the architectural standard and must not be silently reversed or altered.
- **Future Enhancements & Deferred Scope:** Any architectural or feature recommendations outside these six approved decisions (such as post-MVP runtime password reset) remain **PROPOSED** and require explicit Product Owner approval before implementation.

---

## Decision 1 — Task Identifier (APPROVED)

### Decision

**Option A (Project-specific identifier, e.g. DEV-001).** Each project has its own sequential task counter stored on the `projects` table (`task_counter`). The counter is incremented atomically inside the task-creation transaction. The identifier column (`tasks.identifier varchar(30)`) is separate from the UUID primary key. The identifier is formatted with a minimum width of three digits without truncating larger values using `LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')`, ensuring `DEV-001`, `DEV-999`, and `DEV-1000` remain distinct, valid, and untruncated up to the PostgreSQL int maximum (2,147,483,647 tasks per project).

### Alternatives Considered

| Option | Description |
|--------|-------------|
| A. Project-specific identifier | `DEV-001`, scoped per project, resets per project |
| B. Global identifier | `TASK-000001`, globally unique across the system |

### Technical Implications

- **A:** Requires a per-project counter (`task_counter` column on `projects`). Identifier generation must be atomic within a transaction to avoid gaps/duplicates under concurrency. Querying tasks by identifier requires `project_id + identifier` lookup. Uses `UPDATE projects SET task_counter = task_counter + 1 RETURNING task_counter` inside the task creation transaction. Formatted as `"{key}-{LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')}"` to guarantee minimum 3-digit zero-padding without truncating identifiers when the counter exceeds 999 (safely supporting up to the PostgreSQL int limit 2,147,483,647).
- **B:** Single global sequence or UUID-derived short ID. Simpler generation; lookup by identifier alone. No cross-project coordination needed.

### Security Implications

- Neither option exposes sensitive data. Identifiers are public labels. No authorization difference.

### Migration / Future-Change Implications

- Switching from A to B later requires backfilling global identifiers and updating all references (API paths, URLs, comments, activities). Changing identifier format is a breaking change for clients using identifiers in deep links. Keep identifier column separate from the UUID primary key so the internal key never changes.

---

## Decision 2 — Task Deletion (APPROVED)

### Decision

**Option A (Soft deletion).** Tasks use `deleted_at` nullable `timestamptz`. Default task queries must exclude deleted tasks (`WHERE deleted_at IS NULL`). Associated comments and activity history are preserved.

### Alternatives Considered

| Option | Description |
|--------|-------------|
| A. Soft deletion | `deleted_at` timestamp; tasks excluded from default queries; restorable |
| B. Hard deletion | Row removed from `tasks` table |

### Technical Implications

- **A:** All task queries must add `WHERE deleted_at IS NULL` (or use a view/soft-delete wrapper). Foreign keys from `comments` and `activity_logs` remain valid. Slightly more complex queries.
- **B:** Simple queries. Orphaned `comments`/`activity_logs` references must be handled (cascade delete or restrict). Historical activity referencing a deleted task would dangle unless activities are also archived.

### Security Implications

- **A:** Deleted tasks must still be excluded from unauthorized access; soft-delete flag is not an access control. Authorization checks apply regardless of `deleted_at`.
- **B:** Immediate removal reduces data exposure surface but destroys history.

### Migration / Future-Change Implications

- Adding `deleted_at` is additive and safe. Moving to hard deletion later requires deciding the fate of dependent comments/activities first.

---

## Decision 3 — Workspace Ownership (APPROVED)

### Decision

**Option A (Ownership transfer required before leaving).** A workspace Owner must transfer ownership to another member (with role Owner or Admin) before leaving the workspace. The Owner cannot leave while still Owner.

### Alternatives Considered

| Option | Description |
|--------|-------------|
| A. Ownership transfer required before leaving | An Owner must transfer ownership to another member before leaving the workspace |
| B. Owner cannot leave until workspace deletion | Owner is permanently bound; leaving = deleting the workspace |

### Technical Implications

- **A:** Leave operation for an Owner validates that another Owner/Admin exists and performs ownership transfer. Adds a validation step to member removal/leave. Must be atomic (transfer + leave in one transaction). *(Technical Interpretation & Successor Eligibility):* Because DevFlow strictly enforces at most one Owner per workspace at any time (`workspace_members_owner_partial_key`), no other member can hold the role `owner`. Therefore, in technical implementation, the eligible successor must be an existing workspace member with the **Admin** role (`role = 'admin'`). An ordinary Member (`role = 'member'`) cannot directly receive ownership without prior promotion to Admin. Furthermore, as explicitly mandated here, ownership transfer, task unassignment across all projects in the workspace, and the departing Owner's membership removal must execute atomically within a single database transaction (specified in `DATABASE_SPECIFICATION.md §8.15`).
- **B:** Simpler leave logic; Owner cannot invoke "leave," only "delete workspace." Less flexible for users.

### Security Implications

- **A:** Ensures a workspace never becomes ownerless, which could complicate billing/administration and recovery.
- **B:** Guarantees at least one owner until deletion; no risk of orphaned workspace.

### Migration / Future-Change Implications

- Moving from B to A later requires adding transfer logic. Moving from A to B removes flexibility but is backward-compatible for existing workspaces (they already have an owner).

---

## Decision 4 — Invitations (APPROVED)

### Decision

**Option A (Email invitation with unique token).** Invitations are bound to a specific email address and workspace. Store a token hash (`token_hash`), never the raw token. Tokens are single-use and expire. Revoked, expired, or accepted invitations cannot be accepted again. The accepting account's email must match the invitation email.

### Alternatives Considered

| Option | Description |
|--------|-------------|
| A. Email invitation with unique token | Invitation created with email + single-use token; sent via email; accepted via `/invitations/:token` |
| B. Shareable invitation links | Link with token anyone can use to join, optionally role-scoped |

### Technical Implications

- **A:** Requires an email delivery mechanism (provider TBD for MVP). Token hash stored; expiry enforced; one-time use. Acceptance binds the invitee's account to the workspace. Concurrent acceptance attempts: only one succeeds (single-use enforcement via `accepted_at`/`revoked_at` check-and-set in a transaction).
- **B:** No email dependency; link can be forwarded. Higher risk of unintended joining. Needs stronger expiry and possibly email confirmation on accept.

### Security Implications

- **A:** Token tied to a specific email; only that email can complete acceptance (ideally after email verification). Lower risk of link forwarding abuse. Token hash prevents token leakage from DB compromise.
- **B:** Link possession = join capability. Must be short-lived and ideally paired with post-accept email confirmation.

### Migration / Future-Change Implications

- Adding B later requires a new invitation type/link table or a `link` flag. A's `invitations` table supports both via an optional `invitee_email` nullability change.

---

## Decision 5 — Task Visibility (APPROVED)

### Decision

**Option A (Project members only).** Tasks are visible only to members of their project. Workspace Admin does not automatically receive unrestricted access to every project.

### Alternatives Considered

| Option | Description |
|--------|-------------|
| A. Project members only | Task visible only to members of its project |
| B. All workspace members | Task visible to any member of the parent workspace |

### Technical Implications

- **A:** Authorization checks task access via `project_members`. Cleaner separation; project is the access boundary.
- **B:** Authorization checks workspace membership first, then project. Broader visibility; queries may need workspace-level joins.

### Security Implications

- **A:** Stronger isolation; matches "Project members must belong to the associated workspace" invariant and "Do not assume workspace Admin grants unrestricted access to every project."
- **B:** Weaker isolation; workspace members could see tasks in projects they aren't members of, contradicting project membership controls.

### Migration / Future-Change Implications

- Moving A → B later broadens access and requires re-auditing all task endpoints. Moving B → A restricts access but is safer. Recommendation is A to match documented access rules.

---

## Decision 6 — Project Key / Identifier Prefix (APPROVED)

### Decision

**Add an immutable `key` column (`varchar(10)`, NOT NULL) to `projects`, unique within a workspace (`unique(workspace_id, key)`), used as the prefix for task identifiers.** The key is set during project creation and cannot be changed afterward. The full task identifier is formatted as `"{key}-{LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')}"` (e.g. `DEV-001`, `DEV-999`, `DEV-1000`). Explicitly casting the counter to text and applying `GREATEST(3, LENGTH(counter::text))` guarantees a minimum width of three digits for identifiers under 1000 while preventing truncation when the counter reaches 1000 and above, up to the maximum positive value of PostgreSQL int (2,147,483,647 tasks per project).

### Alternatives Considered

| Option | Description |
|--------|-------------|
| A. Immutable project key | `key` column on projects, unique per workspace, used as identifier prefix |
| B. Workspace-scoped prefix | Use workspace slug or name as the prefix; no separate project key |
| C. No prefix, counter only | Identifier is just the counter value (e.g. `001`) |

### Technical Implications

- **A:** Requires `key` column on `projects`. Unique constraint `(workspace_id, key)`. Identifier generation formats `"{key}-{LPAD(counter::text, GREATEST(3, LENGTH(counter::text)), '0')}"` into `tasks.identifier` (`varchar(30)`). Minimum 3-digit padding is preserved without truncating values exceeding 999, safely supporting counters up to the PostgreSQL int limit (2,147,483,647). Immutable key means no UPDATE on `key` after creation. Requires UNIQUE `(id, workspace_id)` on `projects` to support composite FK references.
- **B:** Derives prefix from workspace; less flexible if workspace is renamed. No additional column.
- **C:** Simpler but less readable; loses project context in identifier.

### Security Implications

- None significant. Identifier prefix is a public label.

### Migration / Future-Change Implications

- Making the key mutable later would require updating all task identifiers referencing it (breaking change). Treat as immutable to avoid this.
- The key column is additive to the schema; existing projects created before this decision would need a backfill migration to assign a key.

### Blocks Sprint 1?

**No.** The `key` column can be added in Sprint 1 migrations. Task identifier generation (Sprint 4) depends on it being present.

---

## Approval Status

| Decision | Status |
|----------|--------|
| 1. Task identifier | APPROVED (Option A) |
| 2. Task deletion | APPROVED (Option A) |
| 3. Workspace ownership | APPROVED (Option A) |
| 4. Invitations | APPROVED (Option A) |
| 5. Task visibility | APPROVED (Option A) |
| 6. Project key / identifier prefix | APPROVED (Option A — immutable `key` column on `projects`) |
