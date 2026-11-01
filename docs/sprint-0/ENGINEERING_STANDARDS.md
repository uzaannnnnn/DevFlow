# DevFlow — Engineering Standards

## Go (Backend)

- Idiomatic Go (current stable). Explicit error handling; no error silencing (`_ = err` forbidden unless intentional and commented).
- `context.Context` propagated from HTTP handler → usecase → repository; request timeouts enforced at middleware.
- Dependency injection via constructor functions (`NewUsecase(repo)`), no DI frameworks.
- SQL queries organized in `queries.sql` and compiled with sqlc; custom repository layer only where sqlc is insufficient.
- Transactions: single `pgx.Tx` per multi-repository usecase; commit on success, rollback on error.
- Structured logging (JSON); no secrets/PII/tokens in logs.
- Input validation at handler boundary; business rules in usecases/domain.
- Clear package boundaries: `handlers` → `usecases` → `domain`; `repository` → sqlc/pgx. No handler imports repository directly.
- RESTful route design with Gin; versioned `/api/v1`.
- Tests: Go testing + testify + httptest. Repository tests against real PostgreSQL (test container or dev DB).
- No mock data in production workflows. No unused imports/dead code.

## TypeScript (Frontend)

- Strict TypeScript (`strict: true`). Avoid `any`; use `unknown` + type guards.
- Feature-based organization under `src/features/`; shared types under `src/entities/`; UI primitives under `src/shared/ui/`.
- Typed API contracts: request/response types derived from Zod schemas; OpenAPI used as reference.
- Consistent TanStack Query keys per feature.
- Explicit server/client state separation: server state via TanStack Query; client UI state via React state only.
- Every async state has explicit loading, empty, success, and error handling.
- Form validation: React Hook Form + Zod.
- No business logic inside UI components; components receive props + callbacks.
- Reusable components only when genuinely shared; avoid unnecessary custom hooks.
- No dead code; no `// TODO` left unreviewed.

## General

- No duplicated business logic (single source in backend usecases; frontend only presents).
- No hardcoded secrets (env vars only).
- No silent error swallowing.
- No authorization decisions based solely on frontend state.
- No microservices; modular monolith.
- No unnecessary abstractions; prefer simple, readable code.
- Naming consistent with database (snake_case DB, camelCase JSON/API, PascalCase Go/TS types).
