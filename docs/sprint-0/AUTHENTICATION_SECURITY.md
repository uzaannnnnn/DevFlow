# DevFlow — Authentication & Security Design

## 1. Token Strategy

### Access Token
- Type: JWT
- Lifetime: ~10–15 minutes (short-lived)
- Storage: Frontend memory only (not localStorage/cookie)
- Transmission: `Authorization: Bearer <token>` header
- Claims: `sub` (user ID), `email`, `iat`, `exp`
- Signing: HMAC SHA-256 with `JWT_SECRET` (rotate periodically)

### Refresh Token
- Type: Rotating opaque token (random high-entropy)
- Storage: HttpOnly cookie, `Secure` in production, `SameSite=Lax` (minimum)
- Cookie name: `refresh_token` (configurable)
- Domain/Path: `Path=/`, `Domain` unset (host-only) unless subdomains are required; set explicitly via `COOKIE_DOMAIN` if needed
- Database: Token SHA-256 hash stored in `refresh_sessions.token_hash`; plaintext never stored
- Rotation: On each `/auth/refresh`, issue new refresh token, mark old session revoked, insert new session
- Expiry: Longer than access token (e.g. 7–30 days), configurable

### Password
- Hashing: Argon2id
- Parameters: configurable (memory, iterations, parallelism) targeting ~0.5s on target hardware
- Minimum length: 8 characters

## 2. Refresh Token Rotation & Reuse Detection

- Each login creates one refresh session (`refresh_sessions` row) with `token_hash`, `expires_at`, `revoked_at = NULL`.
- `/auth/refresh`:
  1. Read `refresh_token` cookie.
  2. Hash plaintext; lookup row by `token_hash`.
  3. If not found, expired, or `revoked_at IS NOT NULL` → 401, revoke all sessions for the user (possible compromise).
  4. If valid: mark current session `revoked_at = now()`, insert new session with new token hash + new cookie, issue new JWT.
- Reuse detection: If a token is presented after it has already been rotated (i.e. `revoked_at IS NOT NULL`), treat as token theft: revoke the entire session family (all sessions for that user/device lineage) and return 401.

### Concurrent Refresh Handling
- Multiple simultaneous `/auth/refresh` calls with the same token: only one succeeds; others fail because the token is now revoked. Clients should serialize refresh requests (single in-flight refresh) to avoid spurious logout.
- Session family revocation: revoking a session revokes that row; revocation of the whole family (reuse detection) marks all user sessions revoked.

## 3. Session Revocation
- `/auth/sessions` (GET): list active sessions for the current user (masked token, device info, last used, expiry).
- `/auth/sessions/:id` (DELETE): revoke a specific session by marking `revoked_at`.
- Logout: revoke current session + clear cookie.

## 4. CSRF Protection
- Cookie-based auth is vulnerable to CSRF. Mitigations:
  - `SameSite=Lax` or `Strict` on refresh cookie.
  - State-changing cookie-backed endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`) require a `X-CSRF-Token` header (double-submit cookie pattern) when the request originates from a different origin than the API.
  - `SameSite=Strict` alone blocks cross-site POST but not same-site; header check adds defense.
- Endpoints using only Bearer JWT (Authorization header) are not CSRF-vulnerable (no cookie sent automatically).

## 5. CORS
- Frontend and backend deployed separately (Vercel vs VPS).
- `CORS_ALLOW_ORIGIN` allowlist: explicit production frontend domain(s) + localhost in dev.
- `Access-Control-Allow-Credentials: true` (required for HttpOnly cookie).
- `Access-Control-Allow-Methods`, `Allow-Headers` restricted.
- No wildcard origin with credentials.

## 6. Rate Limiting & Brute Force
- `/auth/login`: 5 req/min per IP + email.
- `/auth/refresh`: 20 req/min per refresh session (cookie).
- `/auth/register`: 3 req/min per IP.
- General API: 100 req/min per authenticated user.
- Implementation: middleware (in-memory or Redis-free fixed-window/token-bucket; Redis only if measured need).

## 7. Input Validation & Injection Prevention
- All input validated with Zod (frontend) + manual/pgx parameterized queries (backend).
- SQL injection: pgx uses parameterized queries (`$1`, `$2`); no string interpolation of user input into SQL.
- XSS: user-generated content (task descriptions, comments) rendered via React (auto-escapes); shadcn components escape by default. CSP header recommended.
- Password/credentials never logged.

## 8. Security Headers
- `Strict-Transport-Security` (production HTTPS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy` (restrictive, allow self + trusted)
- `Referrer-Policy: strict-origin-when-cross-origin`

## 9. Secrets Management
- `JWT_SECRET`, `DATABASE_URL`, `COOKIE_SECRET`, email provider key via environment variables.
- Never committed to git. Managed via platform secret store (Vercel env for frontend; VPS secret manager or .env with restricted perms for backend).
- Local development: `.env` (gitignored).

## 10. Sensitive Logging Prevention
- Structured logging (JSON).
- Never log: passwords, password hashes, tokens (access/refresh), refresh token plaintext, invitation tokens, PII beyond what's necessary.
- Log redacted placeholders for sensitive fields.
- Error messages to clients generic; internal logs include correlation IDs, not secrets.

## 11. Invitation Token Security
- Token: high-entropy random string, stored hashed in `workspace_invitations.token`.
- Single-use: marked used on accept.
- Expiry: configurable (e.g. 7 days).
- Email-scoped: acceptance binds to invitee email (invitee must register/login with that email).
- Rate limit invitation creation to prevent enumeration/abuse.

## 12. Account Recovery (Password Reset) — POST-MVP / DEFERRED
- Architectural design documented in Sprint 0; runtime endpoints and implementation are deferred to POST-MVP.
- No password reset endpoint is implemented for the MVP; the `password_reset_tokens` table is excluded from initial MVP database migrations.
- When implemented post-MVP: time-limited, single-use reset token emailed to verified address; token hashed in DB; expires after use or short TTL (e.g. 1 hour). No reset via support without email verification.

## 13. Production Domain & Cookie Behavior
- Frontend: `app.devflow.example.com` (Vercel); Backend: `api.devflow.example.com` (VPS).
- If subdomains differ, refresh cookie `Domain=devflow.example.com` may be needed to be sent to API; otherwise host-only cookie works when API and frontend are same registrable domain with proper CORS credentials.
- Configure `SameSite=None; Secure` only if cross-site cookie delivery is required; prefer same-site deployment to avoid this.
- Do not assume cross-origin cookies work without explicit `Credentials: true` (fetch) and `Access-Control-Allow-Credentials`.
