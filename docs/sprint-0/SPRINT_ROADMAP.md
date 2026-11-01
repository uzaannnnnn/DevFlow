# DevFlow — Sprint Roadmap

## Sprint 0 — Product Discovery & Engineering Design (Current)
**Objectives:** Produce complete, internally consistent engineering specification.  
**Scope:** All docs/sprint-0 deliverables (PRD, open decisions, architecture, database, API, security, testing, deployment, roadmap).  
**Dependencies:** None.  
**Deliverables:** docs/sprint-0/*.  
**Acceptance Criteria:** All required documents created; consistency review passed; all six core architectural decisions APPROVED (binding); future scope classified as proposed; no source code written.  
**Testing Requirements:** N/A (design phase).  
**Definition of Done:** User approves Sprint 0 specification.

---

## Sprint 1 — Foundation & Infrastructure
**Objectives:** Repo setup, CI/CD, database schema, base backend/frontend scaffolding.  
**Scope:**
- Git repo, branch strategy, CI (GitHub Actions) running lint + tests.
- Go module, Gin server, `GET /health`, structured logging, config loader.
- PostgreSQL (managed/dev), golang-migrate migrations (10 core MVP tables, excludes deferred password_reset_tokens).
- Seed data script for local dev.
- Vite + React + TS + Tailwind + shadcn base; router; API client; TanStack Query provider.
- Dockerfile for backend; Vercel project for frontend.
**Dependencies:** Sprint 0 approved (schema, openapi).  
**Deliverables:** Skeleton repo, CI green, migrations (not auto-run), health check, local dev environment.  
**Acceptance Criteria:** `go test ./...` passes; `npm run test` passes; `GET /health` returns 200; migrations apply cleanly to dev DB.  
**Testing Requirements:** Unit + repo integration tests for foundation code.  
**Definition of Done:** CI pipeline green; local dev environment reproducible; no application business logic yet.

---

## Sprint 2 — Authentication & Workspace Management
**Objectives:** Auth module (A) and workspace module (B).  
**Scope:**
- Register, login, refresh, logout, sessions, profile (Module A; password reset runtime deferred to POST-MVP).
- Argon2id, JWT, rotating refresh cookie, rate limiting, CSRF.
- Workspace CRUD, members, roles, invitations (Module B).
- Authorization middleware; workspace membership enforcement.
**Dependencies:** Sprint 1.  
**Deliverables:** Auth + workspace backend endpoints + frontend pages; OpenAPI updated.  
**Acceptance Criteria:** All Module A/B acceptance criteria pass; authorization tests pass; refresh rotation + reuse detection tested.  
**Testing Requirements:** Auth unit/integration, handler, middleware, authorization tests; frontend component + route-protection tests.  
**Definition of Done:** End-to-end register → login → create workspace → invite → accept works.

---

## Sprint 3 — Project Management
**Objectives:** Project module (C).  
**Scope:**
- Project CRUD, archive, members, search/filter.
- Project membership explicit; workspace Admin ≠ project access.
**Dependencies:** Sprint 2 (workspaces, users).  
**Deliverables:** Project endpoints + frontend pages.  
**Acceptance Criteria:** All Module C acceptance criteria pass; cross-workspace/project authorization enforced.  
**Testing Requirements:** Project handler + authorization tests; frontend component tests.  
**Definition of Done:** Create project → add members → view/edit/archive works with correct authorization.

---

## Sprint 4 — Task Management & Kanban
**Objectives:** Task module (D) + Kanban view (E).  
**Scope:**
- Task CRUD, assign, priority, status, due date, identifiers (Module D).
- Kanban board with 4 columns, drag-and-drop, optimistic UI, rollback (Module E).
- Backend persistence + activity logging for status changes.
**Dependencies:** Sprint 3 (projects).  
**Deliverables:** Task endpoints + Kanban board frontend.  
**Acceptance Criteria:** All Module D/E acceptance criteria pass; optimistic update rollback verified.  
**Testing Requirements:** Task tests; Kanban drag-and-drop component tests; E2E drag task.  
**Definition of Done:** Create task → assign → drag across columns → status persists → activity logged.

---

## Sprint 5 — Collaboration & Dashboard
**Objectives:** Comments + dashboard (E/F remainder).  
**Scope:**
- Comments CRUD (own edit/delete) (Module E).
- Activity tracking append-only.
- Dashboard: totals, distribution, my tasks, overdue, recent activities, progress (Module F).
**Dependencies:** Sprint 4 (tasks).  
**Deliverables:** Comment endpoints + dashboard pages.  
**Acceptance Criteria:** All Module E/F acceptance criteria pass; progress = 0 when no tasks; overdue excludes completed.  
**Testing Requirements:** Comment tests; dashboard query tests; E2E comment + dashboard.  
**Definition of Done:** Comment on task → view dashboard with progress/metrics.

---

## Sprint 6 — QA & Production Hardening
**Objectives:** Stabilize, security review, performance validation.  
**Scope:**
- Full test suite run; coverage review of critical rules.
- Penetration-style review of authz boundaries.
- Performance load test of CRUD endpoints vs p95 targets.
- Error tracking + structured logging verification.
- Rate limiting tuned.
**Dependencies:** Sprints 2–5 complete.  
**Deliverables:** Hardened app; test report; security review notes.  
**Acceptance Criteria:** p95 CRUD < 500ms in test env; no authz bypasses; CI green.  
**Testing Requirements:** E2E suite green; load test results; security review sign-off.  
**Definition of Done:** Release candidate ready.

---

## Sprint 7 — Deployment & Release
**Objectives:** Deploy to production; smoke test; release.  
**Scope:**
- Staging deploy; smoke tests.
- Production deploy (backend Docker, frontend Vercel).
- Database migration applied (manual step).
- Post-release monitoring.
**Dependencies:** Sprint 6 sign-off.  
**Deliverables:** Live production application.  
**Acceptance Criteria:** Production smoke tests pass; monitoring/alerting active.  
**Testing Requirements:** Smoke test suite against production.  
**Definition of Done:** DevFlow live and accessible to target users.

## Notes
- Do not begin Sprint 1 implementation until Sprint 0 is approved.
- Open decisions (Section 5 / OPEN_DECISIONS.md) must be resolved before affected sprints (identifiers in Sprint 4, deletion in Sprint 4, ownership in Sprint 2, invitations in Sprint 2, visibility in Sprint 3/4).
