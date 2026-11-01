# DevFlow Documentation

This directory contains the Sprint 0 engineering specification for DevFlow, a project management and team collaboration platform.

Sprint 0 is a design-only phase. No application source code, database migrations, or deployments are produced here.

## Structure

```
docs/
└── sprint-0/
    ├── README.md              # This file
    ├── PRD.md                 # Product Requirements Document
    ├── OPEN_DECISIONS.md      # Product decisions (all APPROVED)
    ├── USER_STORIES.md        # User stories per module
    ├── ACCEPTANCE_CRITERIA.md # Acceptance criteria per story
    ├── SYSTEM_ARCHITECTURE.md # Frontend + backend architecture + Mermaid diagrams
    ├── DATABASE_SPECIFICATION.md # Schema, indexes, transactions, constraints
    ├── ERD.md                 # Entity-relationship diagram (Mermaid)
    ├── API_SPECIFICATION.md   # REST endpoint contracts
    ├── openapi.yaml           # OpenAPI 3.x draft
    ├── AUTHENTICATION_SECURITY.md # Auth flows, tokens, CSRF, CORS, cookies
    ├── THREAT_MODEL.md        # Threats, impact, mitigations
    ├── ENGINEERING_STANDARDS.md # Go + TypeScript + general standards
    ├── TESTING_STRATEGY.md    # Test pyramid, coverage, CI
    ├── DEPLOYMENT_STRATEGY.md # Environments, secrets, migrations, rollback
    ├── PERFORMANCE_RELIABILITY.md # Performance targets, query efficiency
    ├── RISKS_AND_MITIGATIONS.md # Identified risks
    └── SPRINT_ROADMAP.md      # Sprint 0–7 roadmap
```

## Status

Sprint 0: documentation complete pending product-owner review and approval. All six core architectural decisions APPROVED (binding). Password reset runtime and migrations deferred to POST-MVP.

## Technology Stack (fixed)

| Layer | Choice |
|-------|--------|
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| State | TanStack Query, React Hook Form, Zod |
| Drag-and-drop | dnd-kit |
| Frontend tests | Vitest, React Testing Library, Playwright |
| Backend | Go, Gin, pgx, sqlc, golang-migrate |
| Backend tests | Go testing, testify, httptest |
| Database | Managed PostgreSQL (14+) |
| Auth | JWT access token, rotating refresh token, HttpOnly cookie, Argon2id |
| Frontend deploy | Vercel |
| Backend deploy | Docker on VPS/Cloud |
| CI/CD | GitHub Actions |
