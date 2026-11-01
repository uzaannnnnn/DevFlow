# DevFlow — Testing Strategy

## Test Pyramid

```
        /\
       /E2E\      Playwright (critical paths)
      /------\
     /  I/F   \    Frontend: Vitest + RTL (components, forms, queries)
    /----------\
   /  Unit    \   Backend: Go unit tests (usecases, domain)
  /------------\
 /  Repository \ Backend: integration tests (real PostgreSQL)
/--------------\
  Handlers/Middleware: Go httptest
```

## Backend

### Unit Tests
- Usecase logic with mocked repository (business rules, authorization).
- Domain validation (status/priority transitions, identifier generation).
- Password hashing (Argon2id) verify/compare.
- JWT sign/verify, refresh token hash compare.

### Repository Integration Tests
- Against real PostgreSQL (test container or dedicated test DB).
- Each table: insert, select, update, delete, soft-delete.
- Constraint tests: unique email, unique membership, FK violations, check constraints (status/priority/role).
- Composite FK / cross-workspace consistency tests.

### HTTP Handler Tests
- `httptest` with Gin router.
- Every endpoint: 200/201 success, 400 validation, 401 auth, 403 authorization, 404 not found, 422 business rule.
- Authorization boundary tests: non-member accessing project/task → 403.

### Middleware Tests
- Auth middleware (valid/invalid/missing JWT).
- CSRF, CORS, rate limiting, logging, recovery.

### Authorization Tests
- Matrix of role × operation × resource (workspace/project/task/comment).
- Workspace Admin does not imply project access.

### Database Constraint Tests
- Unique email, unique membership per workspace/project, FK cascade, soft delete behavior.

## Frontend

### Component Tests
- Vitest + React Testing Library.
- Feature components render correct states (loading/empty/error/success).
- Kanban drag-and-drop (dnd-kit) with mock backend.
- Forms: validation errors, submission, reset.

### Query & Mutation Tests
- TanStack Query mock: successful fetch, error, refetch on invalidation.
- Mutation success invalidates related queries.

### Route Protection Tests
- Protected route redirects unauthenticated to login.
- Public routes accessible without auth.

## End-to-End (Playwright)

Critical paths:
1. Registration → login → dashboard.
2. Workspace creation → invite member → accept invitation.
3. Project creation → add project member.
4. Task creation → assignment → status change (Kanban drag) → comment.
5. Dashboard metrics (progress, overdue).
6. Authorization boundaries: non-member blocked from project/task.

Run against a deployed preview/staging environment with seeded test data.

## Test Data Strategy
- Backend: schema-only test DB + per-test fixtures (create needed rows in test, cleanup after).
- Frontend: MSW or mocked API client; E2E uses seeded DB.
- No production data in tests.

## Test Database Isolation
- Each backend integration test runs in a transaction rolled back after test, or a dedicated schema per test run.
- Parallel tests use separate connections/schemas where possible.

## CI Execution
- GitHub Actions: lint → backend tests → frontend tests → build → E2E (on preview deploy).
- Fail CI on test failure.

## Coverage Policy
- No arbitrary 100% target.
- Target meaningful coverage: authorization boundaries, auth flows, business rules, critical CRUD.
- Coverage reported but not enforced as a hard gate; code review prioritizes risk coverage.

## Critical Business Rule Coverage
- Assignee must be project member (422 otherwise).
- Project membership required for task/project access.
- Workspace Admin ≠ automatic project access.
- Refresh token reuse → family revocation.
- Progress = 0 when no tasks; overdue excludes completed.
- Soft delete preserves activity history.
