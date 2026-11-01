# DevFlow — Threat Model

| # | Threat | Attack Surface | Impact | Mitigation | Residual Risk |
|---|--------|--------------|--------|------------|---------------|
| T1 | Credential stuffing / brute force | `/auth/login`, `/auth/register` | Account takeover | Argon2id, rate limiting (5/min login), account lockout after failures, strong password policy | Low (mitigated by rate limiting + hashing) |
| T2 | Refresh token theft | Refresh cookie, `/auth/refresh` | Session hijacking | HttpOnly + Secure + SameSite cookie, token rotation, reuse detection → family revocation, short access-token TTL | Medium (XSS can't read cookie, but token theft via malware/network possible) |
| T3 | Refresh token reuse (replay) | `/auth/refresh` replay of old token | Session hijacking | Reuse detection revokes entire family on reused token | Low |
| T4 | CSRF on cookie endpoints | `/auth/login`, `/auth/refresh`, `/auth/logout` | Unauthorized state change | SameSite=Lax/Strict, `X-CSRF-Token` double-submit, explicit CORS allowlist + credentials | Low |
| T5 | IDOR / unauthorized data access | Task/project/workspace endpoints | Data exposure across tenants | Authorization check in every backend handler (not frontend-only), project membership enforced, 403/404 on non-member | Low |
| T6 | SQL injection | All query parameters | Data breach/modification | pgx parameterized queries, no string interpolation | Low |
| T7 | XSS | Comments, task descriptions, profiles | Session/data theft | React auto-escaping, CSP, HttpOnly cookie (JS can't read refresh token) | Low |
| T8 | Token leakage via logs | Application logs | Session compromise | No secrets/tokens/PII in logs; redacted logging | Low |
| T9 | Privilege escalation (role) | Workspace/project member role changes | Unauthorized admin actions | Server-side role validation; Owner-only for sensitive ops; workspace Admin ≠ project access | Low |
| T10 | Invitation token abuse | `/invitations/:token` | Unauthorized workspace join | Hashed token, single-use, expiry, email-scoped acceptance, rate limiting | Low |
| T11 | Cross-workspace data leak | project_members, tasks | Data visible across workspaces | Composite FK + denormalized workspace_id, project-scoped authorization | Low |
| T12 | Denial of service | Public endpoints | Service unavailability | Rate limiting, request timeouts, bounded connection pool | Medium (no WAF/CDN rate limit at edge in MVP) |
| T13 | Sensitive data in URL/query | Search/filter params | Log exposure of query terms | Avoid logging raw query params; use POST for sensitive search if needed | Low |

## Assumptions
- Frontend and backend are on separate domains; cookie cross-origin behavior explicitly configured.
- No SSO/social login in MVP (email/password only).
- Email delivery provider not yet selected; invitation tokens are the security boundary for invites.

## Residual Risk Summary
All high-impact threats (credential stuffing, token theft, IDOR, injection, XSS) are mitigated to low residual risk. Medium risks (refresh token theft via client compromise, DoS) are accepted for MVP with monitoring in place.
