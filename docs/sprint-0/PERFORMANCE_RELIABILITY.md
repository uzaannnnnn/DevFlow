# DevFlow — Performance & Reliability

## Performance Targets

| Metric | Target | Condition |
|--------|--------|-----------|
| Simple CRUD endpoint p95 | < 500 ms | Documented test environment, warm cache, real PostgreSQL |
| Auth login p95 | < 800 ms | Includes Argon2id hash verify |
| Dashboard load p95 | < 800 ms | Aggregated queries |

## Evaluations

### Database Indexes
- FK columns indexed; `tasks(project_id, status)`, `tasks(due_date)`, `tasks(assignee_id)`, `activity_logs(project_id, created_at)`.
- Partial indexes for `WHERE deleted_at IS NULL` where query volume justifies.

### Query Efficiency
- Pagination with `LIMIT/OFFSET` (cursor-based if offset becomes slow at scale).
- Avoid `SELECT *`; select needed columns.
- Task list filtered by project membership via join on `project_members`.

### N+1 Risks
- Task list with assignee/comments count: use joins or aggregate subqueries, not per-row queries.
- Dashboard: aggregate SQL (COUNT grouped by status) rather than fetching all tasks.

### Connection Pooling
- `pgxpool` with bounded `MaxConns` (e.g. 4–8 × CPU cores), `MaxConnLifetime`, `MaxConnIdleTime`.

### Request Timeouts & Context Cancellation
- Middleware sets per-request timeout (e.g. 10s); context passed to DB queries.
- Client-side request timeouts on fetch.

### Payload Sizes
- Task/comment lists paginated (default 20, max 100).
- No large payloads in MVP (no file attachments).

### Frontend Request Duplication
- TanStack Query deduplicates concurrent identical queries.
- Mutations invalidate only related queries.

### Caching
- No Redis in MVP. HTTP caching headers (Cache-Control) for public read assets where appropriate; authenticated API responses not cached by default.

### Database Transaction Boundaries
- Transactions kept short; only the write portion of a usecase inside a tx.
- Reads outside tx where consistency requirements allow.

## Reliability

- Graceful degradation: if refresh fails, redirect to login (not crash).
- Error boundaries in React; fallback UI.
- Backend recovery middleware: panics → 500, logged, connection not leaked.
- Database connection retry on startup (bounded).
- Health check monitors DB connectivity.
