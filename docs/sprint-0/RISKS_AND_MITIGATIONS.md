# DevFlow — Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|------------|-------|
| Unresolved decisions before Sprint 1 | Low | High | All six core decisions in OPEN_DECISIONS.md are formally APPROVED; future scope changes classified as proposed | Product/Architecture |
| Cross-origin cookie issues (separate domains) | Medium | Medium | Explicit cookie domain/SameSite/CORS config; test in staging early | Backend |
| Authorization bypass (frontend-only checks) | Low | High | Backend validates every sensitive op; authorization test matrix | Backend |
| Migration auto-start concurrency | Low | High | Separate migration step; never run at startup | DevOps |
| Refresh token theft via client compromise | Medium | Medium | HttpOnly cookie, rotation, reuse detection, short access TTL | Backend |
| No email provider for invitations | Medium | Medium | Invitation token generated; email delivery TBD; can send token manually in dev | Backend |
| Scope creep (file attachments, real-time, SSO) | Medium | Medium | Explicitly out of scope for MVP; revisit post-launch | Product |
| Performance degradation at scale | Low | Medium | Indexes, pagination, pgxpool, measured targets; Redis only if measured need | Backend |
| Single VPS backend failure | Low | Medium | Health checks, rolling deploy, managed PostgreSQL with backups | DevOps |

## Risk Review Cadence
Reviewed at the start of each sprint; new risks added as they emerge.
