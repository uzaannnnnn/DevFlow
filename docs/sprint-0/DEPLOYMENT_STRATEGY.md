# DevFlow — Deployment Strategy

## Environments

| Environment | Frontend | Backend | Database |
|-------------|----------|---------|----------|
| Development | Local (Vite dev) | Local (Go run) | Local PostgreSQL / Docker |
| Testing (CI) | Build + test | Build + test | Ephemeral PostgreSQL (test container) |
| Staging | Vercel preview | Docker on VPS | Managed PostgreSQL (staging) |
| Production | Vercel | Docker on VPS/Cloud | Managed PostgreSQL (production) |

## Environment Variable Strategy

Frontend (Vercel): `VITE_API_BASE_URL`  
Backend: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `JWT_TTL`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `FRONTEND_URL`, `RATE_LIMIT_*`, `LOG_LEVEL`

Secrets never in code; injected via platform secret store (Vercel project settings; VPS secret manager or restricted `.env`).

## Docker Strategy
- Multi-stage Go build (build stage + distroless/scratch runtime).
- Non-root user.
- Health check endpoint `GET /health` (DB connectivity + service up).
- Image tagged with git SHA; immutable tags in production.

## Health Checks
- `GET /health` returns 200 when service + DB reachable.
- Load balancer / platform uses this for readiness/liveness.

## Database Migrations During Deployment
- Migrations managed with golang-migrate.
- **Never run automatically at application startup.** Concurrency and release-safety concerns: multiple replicas starting simultaneously could run conflicting migrations.
- Migration is a separate deployment step (CI job or `migrate` CLI) run before the new backend version rolls out.
- Backward-compatible migrations only (additive changes) to support zero-downtime rolling updates.
- Rollback: `migrate -down 1` or forward-fix migration; no destructive down migrations in production without explicit approval.

## Deployment Order
1. Database migration (backward-compatible).
2. Backend deployment (rolling update).
3. Frontend deployment (Vercel production).
4. Smoke test.

## Smoke Testing
- `GET /health` → 200.
- Auth: login with test user → 200 + cookie.
- CRUD: create workspace/project/task → 201.
- Kanban: PATCH task status → 200.
- Run against production after deploy; fail fast on failure.

## Rollback Strategy
- Backend: revert to previous image tag; re-run only if migration is forward-compatible (do not auto-down).
- Frontend: Vercel instant rollback to previous deployment.
- Database: forward-fix migration (preferred) over down migration.

## Database Backup & Restoration
- Managed PostgreSQL: automated daily backups + point-in-time recovery (provider feature).
- Manual backup before major migrations.
- Restoration tested in staging periodically.

## Monitoring
- Uptime/health check alerts.
- Structured logs shipped to log aggregator.
- Error tracking (e.g. Sentry or similar) — backend errors + frontend unhandled exceptions.

## Structured Logging
- JSON logs; fields: timestamp, level, message, request_id, route, user_id (redacted if sensitive).
- No passwords/tokens/PII.

## Incident Response Basics
- On-call rotation documented.
- Severity levels (SEV1–SEV3).
- Rollback runbook; database restoration runbook.
- Post-incident review for SEV1/SEV2.
