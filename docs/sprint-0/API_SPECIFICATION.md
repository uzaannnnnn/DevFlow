# DevFlow — API Specification

Base path: `/api/v1`  
Protocol: HTTPS  
Content-Type: `application/json`  
Auth: Bearer JWT (access token) + HttpOnly refresh cookie

## 1. Response Envelopes

Success:

```json
{
  "success": true,
  "data": {},
  "meta": null
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

`meta` used for pagination: `{ page, page_size, total }`.

## 2. Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| VALIDATION_ERROR | 400 | Request validation failed |
| UNAUTHORIZED | 401 | Missing/invalid/expired authentication |
| FORBIDDEN | 403 | Authenticated but not authorized |
| NOT_FOUND | 404 | Resource not exists (or withheld for authz) |
| CONFLICT | 409 | Duplicate resource (e.g. email exists) |
| UNPROCESSABLE | 422 | Business rule violation (e.g. assignee not member) |
| TOO_MANY_REQUESTS | 429 | Rate limited |
| INTERNAL_ERROR | 500 | Unexpected server error |

404 may be returned instead of 403 to avoid resource enumeration.

## 3. Pagination

Query params: `page` (default 1), `page_size` (default 20, max 100).  
Response meta: `{ page, page_size, total }`. Cursor-based pagination may replace offset later.

## 4. Sorting / Filtering / Search

- Sort: `sort=field:asc|desc`, multiple allowed.
- Filter: `filter[field]=value` (equality). Status/priority use `in` syntax: `filter[status]=todo,in_progress`.
- Search: `q=...` full-text-ish (ILIKE on title/name).

## 5. Endpoints

### AUTH

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| A1 | POST | /auth/register | No | Register user |
| A2 | POST | /auth/login | No | Login; set refresh cookie + return JWT |
| A3 | POST | /auth/refresh | Cookie | Rotate refresh token; return new JWT |
| A4 | POST | /auth/logout | JWT + cookie | Revoke current refresh session; clear cookie |
| A5 | GET | /auth/sessions | JWT | List user's refresh sessions |
| A6 | DELETE | /auth/sessions/:id | JWT | Revoke a specific session |

### USER

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| U1 | GET | /users/me | JWT | Get own profile |
| U2 | PATCH | /users/me | JWT | Update own profile |

### WORKSPACE

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| W1 | GET | /workspaces | JWT | List accessible workspaces |
| W2 | POST | /workspaces | JWT | Create workspace (creator = Owner) |
| W3 | GET | /workspaces/:id | JWT | Get workspace details (member only) |
| W4 | PATCH | /workspaces/:id | JWT | Update workspace (Owner/Admin) |
| W5 | GET | /workspaces/:id/members | JWT | List workspace members |
| W6 | PATCH | /workspaces/:id/members/:userId | JWT | Update member role (Owner/Admin) |
| W7 | DELETE | /workspaces/:id/members/:userId | JWT | Remove member (Owner/Admin) |

### INVITATIONS

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| I1 | POST | /workspaces/:id/invitations | JWT | Create invitation (Owner/Admin) |
| I2 | GET | /invitations/:token | No | Validate invitation token |
| I3 | POST | /invitations/:token/accept | No | Accept invitation (join workspace) |
| I4 | POST | /invitations/:token/decline | No | Decline invitation |
| I5 | DELETE | /workspaces/:id/invitations/:invitationId | JWT | Revoke pending invitation |

### PROJECTS

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| P1 | GET | /workspaces/:id/projects | JWT | List accessible projects in workspace |
| P2 | POST | /workspaces/:id/projects | JWT | Create project |
| P3 | GET | /projects/:id | JWT | Get project details (member only) |
| P4 | PATCH | /projects/:id | JWT | Update project |
| P5 | DELETE | /projects/:id | JWT | Archive project |
| P6 | GET | /projects/:id/members | JWT | List project members |
| P7 | POST | /projects/:id/members | JWT | Add project member (must be workspace member) |
| P8 | DELETE | /projects/:id/members/:userId | JWT | Remove project member |

### TASKS

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| T1 | GET | /projects/:id/tasks | JWT | List tasks in project |
| T2 | POST | /projects/:id/tasks | JWT | Create task |
| T3 | GET | /tasks/:id | JWT | Get task details |
| T4 | PATCH | /tasks/:id | JWT | Update task (status/priority/assignee/due/title/etc.) |
| T5 | DELETE | /tasks/:id | JWT | Soft-delete task |

### COMMENTS

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| C1 | GET | /tasks/:id/comments | JWT | List comments on task |
| C2 | POST | /tasks/:id/comments | JWT | Create comment |
| C3 | PATCH | /comments/:id | JWT | Edit own comment |
| C4 | DELETE | /comments/:id | JWT | Delete own comment |

### ACTIVITIES

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| AC1 | GET | /projects/:id/activities | JWT | List project activities |

### DASHBOARD

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| D1 | GET | /workspaces/:id/dashboard | JWT | Workspace dashboard |
| D2 | GET | /projects/:id/dashboard | JWT | Project dashboard |

## 6. Authorization Rules (summary)

- Workspace endpoints: caller must be a workspace member. Role-based: Owner/Admin for writes; Member for reads of own resources.
- Project endpoints: caller must be a project member of the target project. Workspace Admin alone is insufficient.
- Task endpoints: caller must be a project member of the task's project.
- Comments: author may edit/delete own comment; any project member may view.
- Sessions: owner may list/revoke own sessions only.

## 7. Rate Limiting

- `/auth/login`: 5 requests/minute per IP+email.
- `/auth/refresh`: 20 requests/minute per refresh session.
- General API: 100 requests/minute per user.

## 8. CSRF

Cookie-backed auth endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`) require CSRF protection via `SameSite=strict/lax` cookies plus a `X-CSRF-Token` header on state-changing requests from the SPA (double-submit or SameSite-based). Cross-origin SPA → backend configured with explicit `CORS allowlist` and `Credentials: true`.

## 9. OpenAPI

Full machine-readable contract in `openapi.yaml`.
