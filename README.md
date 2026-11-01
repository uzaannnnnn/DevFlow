# DevFlow

DevFlow is a modern, web-based project management and team collaboration platform designed to make software project coordination simple, transparent, and accessible. Inspired by Linear (interface and speed), Trello (Kanban simplicity), and Jira (structure), DevFlow provides modular workspaces, project-specific task numbering, role-based access control, and real-time activity auditing without enterprise complexity.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18+, Vite, TypeScript (strict), Tailwind CSS, shadcn/ui |
| **Frontend State** | TanStack Query (server state), React Hook Form, Zod |
| **Drag & Drop** | `@dnd-kit` (Kanban board) |
| **Backend** | Go (stable), Gin Web Framework, pgx/v5 (connection pool & transactions) |
| **Data Access** | sqlc (type-safe SQL compiler) |
| **Database** | PostgreSQL 14+ (native UUIDs, partial indexes, composite FKs) |
| **Migrations** | golang-migrate (CLI/CI driven, never auto-run at application startup) |
| **Authentication** | JWT access tokens (short-lived in memory), rotating refresh tokens (HttpOnly cookies, SHA-256 hashed), Argon2id password hashing |
| **DevOps / Deploy** | Docker, Docker Compose, GitHub Actions CI, Vercel (Frontend), VPS/Cloud (Backend) |

---

## Monorepo Layout

```
DevFlow/
├── backend/                  # Go + Gin backend API service
│   ├── cmd/server/           # Application entry point
│   ├── internal/             # Internal application packages (layered architecture)
│   │   ├── config/           # Environment configuration loader
│   │   ├── middleware/       # Auth, CORS, logging, recovery, rate-limiting
│   │   ├── handlers/         # Gin HTTP handlers
│   │   ├── usecases/         # Application business logic & transaction boundaries
│   │   ├── domain/           # Core domain models & business rules (pure Go)
│   │   ├── repository/       # Data access layer (sqlc generated & pgx interfaces)
│   │   ├── auth/             # Token generators, Argon2id hashing, claims
│   │   └── mail/             # Mailer interface
│   ├── api/                  # API contracts & schemas (OpenAPI 3.0)
│   ├── migrations/           # golang-migrate SQL migrations (10 core MVP tables)
│   ├── sqlc.yaml             # sqlc compiler configuration
│   ├── Dockerfile            # Lightweight multi-stage container build
│   └── go.mod                # Go module definition
├── frontend/                 # React + Vite + TypeScript frontend application
│   ├── src/
│   │   ├── app/              # Router, providers, global layout
│   │   ├── features/         # Vertical feature modules (auth, workspace, projects, tasks)
│   │   ├── entities/         # Shared domain models & interfaces
│   │   ├── shared/           # Reusable UI primitives, API client, utilities
│   │   └── pages/            # Page-level compositions
│   ├── public/               # Static assets
│   ├── index.html            # Single-page application root
│   ├── vite.config.ts        # Vite configuration
│   └── package.json          # Frontend dependencies and scripts
├── docs/                     # Specifications and architectural documentation
│   └── sprint-0/             # Sprint 0 design and architectural decisions
│       ├── README.md         # Sprint 0 documentation overview
│       ├── PRD.md            # Product Requirements Document
│       ├── OPEN_DECISIONS.md # Approved core decisions (binding)
│       ├── SYSTEM_ARCHITECTURE.md # Architecture, layers & sequence diagrams
│       ├── DATABASE_SPECIFICATION.md # Database schema, constraints & transactions
│       ├── ERD.md            # Entity-Relationship Diagram (Mermaid)
│       ├── API_SPECIFICATION.md   # REST endpoint specifications
│       ├── openapi.yaml      # OpenAPI 3.0 schema definition
│       ├── AUTHENTICATION_SECURITY.md # Auth flows, token rotation, cookies
│       ├── ENGINEERING_STANDARDS.md  # Go & TypeScript code standards
│       ├── SPRINT_ROADMAP.md # Sprint 0–7 delivery schedule
│       ├── TESTING_STRATEGY.md       # Test pyramid & CI testing strategy
│       └── DEPLOYMENT_STRATEGY.md    # Environments, deployment & rollback
├── .env.example              # Development environment template
├── .gitignore                # Global git ignore configuration
├── docker-compose.yml        # Development PostgreSQL service definition
└── README.md                 # This file
```

---

## Architectural Decisions (Approved)

All six foundational architecture and schema decisions documented in [`docs/sprint-0/OPEN_DECISIONS.md`](docs/sprint-0/OPEN_DECISIONS.md) are **APPROVED** and binding:
1. **Decision 1 (Task Identifier):** Option A — Project-scoped sequential identifiers (e.g. `DEV-001`, `DEV-1000`) generated from `projects.task_counter` and stored in `tasks.identifier varchar(30)`.
2. **Decision 2 (Task Deletion):** Option A — Soft deletion via `deleted_at timestamptz`. Comments and audit history preserved.
3. **Decision 3 (Workspace Ownership):** Option A — Ownership transfer required before leaving; eligible successor must be an existing Admin; atomic departure transaction combining transfer, task unassignment, and member removal (`DATABASE_SPECIFICATION.md §8.15`).
4. **Decision 4 (Invitations):** Option A — Email-bound, single-use SHA-256 token hashes with expiration.
5. **Decision 5 (Task Visibility):** Option A — Project members only; workspace Admin does not bypass project membership boundaries.
6. **Decision 6 (Project Key):** Option A — Immutable `projects.key varchar(10)` unique per workspace as task prefix.

---

## Local Development Quickstart

### Prerequisites
- macOS (tested on Apple Silicon M1) or Linux / Windows
- Go 1.22+ (Go 1.24+ recommended)
- Node.js 20+ (Node.js 22/25 recommended) & npm 10+
- Docker & Docker Compose (optional, for local PostgreSQL)

### 1. Start Local Database
```bash
# Start PostgreSQL 16 on port 5432
docker compose up -d postgres

# Verify container health
docker compose ps
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Backend Setup & Commands
```bash
cd backend

# Download dependencies
go mod download

# Run database migrations (applies 10 MVP core tables)
go run ./cmd/migrate up

# Run unit and integration tests (including live migration & constraint tests)
go test -v ./...

# Build production binaries
go build -o bin/server ./cmd/server
go build -o bin/migrate ./cmd/migrate

# Run backend server (defaults to port 8080)
go run cmd/server/main.go
```

#### Health and Readiness Verification
Once running, verify HTTP server status and database connectivity:
```bash
# Liveness (HTTP server operational)
curl -i http://localhost:8080/health
# Response: {"success":true,"data":{"status":"healthy","service":"devflow-api","version":"0.1.0","environment":"development"},"meta":null}

# Readiness (Database connectivity verified)
curl -i http://localhost:8080/health/ready
# Response: {"success":true,"data":{"status":"ready","database":"connected","service":"devflow-api","version":"0.1.0","environment":"development"},"meta":null}
```

### 4. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Run TypeScript type check
npm run type-check

# Run production build
npm run build

# Run Vite dev server (port 5173)
npm run dev
```

---

## Backend Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Environment mode (`development`, `test`, `production`). In production, strict secret checks are enforced. |
| `PORT` | `8080` | Port for the HTTP server. |
| `DATABASE_URL` | `postgres://devflow:devflow@localhost:5432/devflow?sslmode=disable` | PostgreSQL connection string. Live connection is not required for HTTP server startup. |
| `JWT_SECRET` | Dev fallback (dev/test only) | Minimum 32-character HMAC signing key. Production requires explicit setting. |
| `JWT_ACCESS_TTL` | `15m` | Lifetime of short-lived JWT access tokens. |
| `REFRESH_TOKEN_TTL` | `168h` | Lifetime of refresh tokens (7 days). |
| `COOKIE_DOMAIN` | `localhost` | Domain scope for the refresh token cookie. |
| `COOKIE_SECURE` | `false` (dev) / `true` (prod) | HTTPS-only flag for authentication cookies. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed origins. Wildcards (`*`) are disallowed in production. |

---

## Project Status

- **Sprint 0 (Design & Specifications):** Complete & Approved.
- **Sprint 1 (Foundation & Infrastructure):**
  - [x] **Phase 1 (Project Initialization & Monorepo Setup):** Complete & Verified.
  - [x] **Phase 2 (Backend Foundation & Health Check):** Complete & Tested.
  - [x] **Phase 3 (Database Foundation & Migrations):** Complete & Verified.
  - [ ] **Phase 4 (Frontend Foundation & API Client):** In Progress.
- **Sprint 2 (Auth & Workspace Management):** Scheduled.

