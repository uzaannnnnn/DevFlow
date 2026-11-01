# DevFlow — User Stories

Format: As a [role], I want to [action], so that [benefit]. Acceptance criteria live in ACCEPTANCE_CRITERIA.md.

## Module A — Authentication & Account Management

A1. As a new user, I want to register with email and password so I can create an account.
A2. As a registered user, I want to log in with email and password so I can access my workspaces.
A3. As a logged-in user, I want to log out so my session is terminated.
A4. As a user, I want my access token refreshed automatically so I stay authenticated without re-entering credentials.
A5. As a user, I want to view and manage my active sessions so I can revoke suspicious ones.
A6. As a user, I want to retrieve and update my profile so my account information stays current.
A7. [POST-MVP / Future Scope] As a user, I want to reset my password so I can recover access if I forget it. *(Deferred to POST-MVP: architectural design is documented in Sprint 0, but runtime endpoints and implementation are excluded from MVP scope)*

## Module B — Workspace Management

B1. As a user, I want to create a workspace so I can organize my projects.
B2. As a workspace member, I want to list workspaces I have access to so I can switch between them.
B3. As a workspace member, I want to update workspace information so details stay current.
B4. As a workspace Owner/Admin, I want to invite members by email so they can join.
B5. As an invited user, I want to accept or reject an invitation so I control my membership.
B6. As a workspace Owner/Admin, I want to revoke a pending invitation so it cannot be accepted.
B7. As a workspace Owner/Admin, I want to manage member roles so responsibilities are clear.
B8. As a workspace Owner/Admin, I want to remove a member so they lose access when appropriate.
B9. As a workspace Owner, I want to archive a workspace so inactive work is hidden.

## Module C — Project Management

C1. As a workspace member, I want to create a project so I can organize work.
C2. As a workspace member, I want to list projects I have access to so I can find my work.
C3. As a project member, I want to view project details so I understand its scope and members.
C4. As a project member, I want to update project information so details stay current.
C5. As a project Owner/Admin, I want to archive a project when it is complete.
C6. As a project member, I want to manage project members so the right people have access.
C7. As a user, I want to search and filter projects so I can find them quickly.

## Module D — Task Management

D1. As a project member, I want to create a task so I can track work.
D2. As a project member, I want to view task details so I know what to do.
D3. As a task assignee or project member, I want to update a task so progress is reflected.
D4. As a project member, I want to delete a task when it is no longer needed.
D5. As a project member, I want to assign a task to a project member so ownership is clear.
D6. As a project member, I want to change task priority so important work is surfaced.
D7. As a project member, I want to change task status so the Kanban board reflects progress.
D8. As a project member, I want to set a due date so deadlines are tracked.
D9. As a user, I want to search, filter, and sort tasks so I can find relevant work.
D10. As a user, I want tasks to have stable identifiers so I can reference them.

## Module E — Kanban & Collaboration

E1. As a user, I want to drag tasks between status columns on a Kanban board so I can update progress visually.
E2. As a user, I want task movements to persist to the backend so the board stays in sync.
E3. As a user, I want optimistic updates so the UI feels instant.
E4. As a user, I want failed updates to roll back so the board remains accurate.
E5. As a user, I want to view activity history so I know what changed and when.
E6. As a project member, I want to create comments on a task so I can discuss it.
E7. As a comment author, I want to edit or delete my own comments so I can correct mistakes.
E8. As a project member, I want to view comments on a task so I can follow the discussion.

## Module F — Dashboard

F1. As a workspace member, I want to see total projects and total tasks so I understand scale.
F2. As a user, I want to see task distribution by status so I know work state.
F3. As a user, I want to see my assigned tasks so I know what I should work on.
F4. As a user, I want to see overdue tasks so I can prioritize late work.
F5. As a user, I want to see recent activities so I stay informed.
F6. As a project member, I want to see project progress so I know completion level.
