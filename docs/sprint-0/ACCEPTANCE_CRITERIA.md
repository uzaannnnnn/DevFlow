# DevFlow — Acceptance Criteria

Format: Story AC-N: Given / When / Then.

## Module A — Authentication

AC-A1 (register): Given a unique email and valid password, when registering, then a user account is created with Argon2id-hashed password and a 201 response.
AC-A1-b: Given an existing email, when registering, then a 409 conflict error is returned.
AC-A2 (login): Given valid credentials, when logging in, then a short-lived JWT access token is returned in the response body and a rotating refresh token is set in an HttpOnly cookie.
AC-A2-b: Given invalid credentials, when logging in, then a 401 error is returned and no tokens are issued.
AC-A3 (logout): Given an authenticated session, when logging out, then the refresh session is revoked and the cookie is cleared.
AC-A4 (refresh): Given a valid non-revoked refresh token cookie, when refreshing, then a new access token and a new rotated refresh token cookie are issued; the old refresh session is marked revoked.
AC-A4-b: Given a reused (already rotated) refresh token, when refreshing, then the entire session family is revoked and a 401 is returned (reuse detection).
AC-A5 (sessions): Given an authenticated user, when listing sessions, then all active refresh sessions are returned; when revoking a session, then that session is revoked and no longer usable.
AC-A6 (profile): Given an authenticated user, when fetching /users/me, then the profile is returned; when patching valid fields, then the profile is updated.
AC-A7 (password reset): [POST-MVP / Deferred] Architectural design documented in Sprint 0; **no endpoint required for MVP**; password reset endpoints and runtime implementation are deferred to POST-MVP; the `password_reset_tokens` table is excluded from initial MVP migrations.

## Module B — Workspace

AC-B1 (create): Given an authenticated user, when creating a workspace, then the workspace is created and the user is added as Owner.
AC-B2 (list): Given an authenticated user, when listing workspaces, then only workspaces where the user is a member are returned.
AC-B3 (update): Given a workspace Owner/Admin, when updating workspace info, then it is updated; given a Member, then a 403 is returned.
AC-B4 (invite): Given a workspace Owner/Admin, when inviting an email, then an invitation with a unique token is created and the invitee receives an email (design).
AC-B5 (accept/decline): Given an invitee with a valid token, when accepting, then the user is added as a workspace Member; when declining, then the invitation is declined.
AC-B6 (revoke): Given a workspace Owner/Admin, when revoking a pending invitation, then it cannot be accepted.
AC-B7 (roles): Given a workspace Owner/Admin, when changing a member's role, then the role is updated; an Owner cannot demote themselves to below Owner unless ownership is transferred.
AC-B8 (remove): Given a workspace Owner/Admin, when removing a member, then the member loses workspace access; an Owner cannot remove themselves unless ownership is transferred.
AC-B9 (archive): Given a workspace Owner, when archiving, then the workspace is archived and its resources are inaccessible.

## Module C — Project

AC-C1 (create): Given a workspace member with project-creation permission, when creating a project in a workspace, then the project belongs to that workspace and the creator is added as a project member.
AC-C2 (list): Given an authenticated user, when listing projects in a workspace, then only projects where the user is a project member are returned.
AC-C3 (view): Given a project member, when viewing project details, then the project and its membership are returned; given a non-member, then a 403/404 is returned.
AC-C4 (update): Given a project member with write permission, when updating project info, then it is updated.
AC-C5 (archive): Given a project Owner/Admin, when archiving, then the project is archived.
AC-C6 (members): Given a project member authorized to manage membership, when adding/removing project members, then membership is updated; added members must be workspace members.
AC-C7 (search/filter): Given a user, when searching/filtering projects, then results respect project membership authorization.

## Module D — Task

AC-D1 (create): Given a project member, when creating a task in a project, then the task is created with the next project-specific identifier and the creator as created_by.
AC-D2 (view): Given a project member, when viewing a task, then its full details are returned.
AC-D3 (update): Given a project member with write permission, when updating a task, then the change is persisted and an activity log is written.
AC-D4 (delete): Given a project member with delete permission, when deleting a task, then the task is soft-deleted and activity history is preserved.
AC-D5 (assign): Given a project member, when assigning a task to another project member, then the assignment is valid; assigning a non-project-member returns a 400/422.
AC-D6 (priority): Given a project member, when changing priority, then it is updated to one of Low/Medium/High/Urgent.
AC-D7 (status): Given a project member, when changing status, then it is updated to one of Todo/In Progress/Review/Done and an activity is logged.
AC-D8 (due date): Given a project member, when setting a due date, then it is stored as a timestamp.
AC-D9 (search/filter/sort): Given a project member, when searching/filtering/sorting tasks, then results respect project membership.
AC-D10 (identifier): Given tasks created in a project, then each receives a unique project-scoped identifier (e.g. DEV-001).

## Module E — Kanban & Collaboration

AC-E1 (drag): Given a project member, when dragging a task between Kanban columns, then the task status is updated optimistically and persisted.
AC-E2 (persist): Given a successful drag, when the board reloads, then the new status is reflected.
AC-E3 (rollback): Given a failed drag update, when the error returns, then the UI reverts to the previous status.
AC-E4 (activity): Given a task status change, when persisted, then an activity log entry records actor, task, old status, new status.
AC-E5 (comment create): Given a project member, when creating a comment on a task, then the comment is linked to the task and author.
AC-E6 (comment edit/delete): Given a comment author, when editing/deleting their own comment, then it is updated/removed; editing another user's comment returns 403.
AC-E7 (comment view): Given a project member, when viewing task comments, then all non-deleted comments are returned.

## Module F — Dashboard

AC-F1 (totals): Given a workspace member, when viewing the workspace dashboard, then total projects and total tasks reflect authorized data only.
AC-F2 (distribution): Given a workspace member, when viewing task distribution, then counts per status are returned.
AC-F3 (my tasks): Given a user, when viewing my assigned tasks, then only tasks assigned to the user and accessible to them are returned.
AC-F4 (overdue): Given a user, when viewing overdue tasks, then tasks with a past due date and status != Done are returned; completed tasks are excluded.
AC-F5 (recent activities): Given a workspace member, when viewing recent activities, then activity logs for accessible projects are returned.
AC-F6 (progress): Given a project member, when viewing project progress, then Completed/Total × 100% is returned; zero when no tasks exist.

## Authorization Boundaries (cross-module)

AC-Z1: Given a workspace member who is NOT a project member, when accessing that project's tasks, then a 403 is returned.
AC-Z2: Given a workspace Admin, when accessing a project they are not a member of, then a 403 is returned (Admin does not imply project access).
AC-Z3: Given a non-member, when accessing any workspace resource, then a 401/403 is returned.
AC-Z4: Given a deleted/revoked refresh token, when refreshing, then a 401 is returned.
