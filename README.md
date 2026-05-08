# Notes — gRPC Microservices Platform

A production-grade notes application built with a microservice architecture.
Internal services communicate over gRPC; the browser-facing layer is a REST API Gateway.
Authentication uses RS256 JWTs with short-lived access tokens, long-lived refresh tokens, and per-device session management with reuse detection.

---

## Architecture

```
┌─────────────────────────────────────────┐
│            Browser (React)              │
│  Zustand (auth state + in-memory token) │
│  TanStack Query (server state)          │
└───────────────┬─────────────────────────┘
                │ HTTPS / REST
┌───────────────▼─────────────────────────┐
│           API Gateway (Express)         │
│  • Zod request validation               │
│  • RS256 JWT verification               │
│  • Session ID extraction (JWT sid claim)│
│  • gRPC client fan-out                  │
└──────────┬────────────────┬─────────────┘
           │ gRPC            │ gRPC
┌──────────▼──────┐  ┌──────▼──────────────┐
│  Auth Service   │  │   Notes Service      │
│                 │  │                      │
│  • Signup/Login │  │  • CRUD notes        │
│  • RS256 keys   │  │  • TEXT / LIST types │
│  • Sessions     │  │  • Soft delete       │
│  • Refresh tkns │  │  • Ownership checks  │
│  • Reuse detect │  │                      │
└──────────┬──────┘  └──────┬───────────────┘
           │                │
    ┌──────▼──────┐  ┌──────▼──────┐
    │   Auth DB   │  │   Notes DB  │
    │ (Postgres)  │  │ (Postgres)  │
    └─────────────┘  └─────────────┘
```

Each service owns its own database — no shared DB across service boundaries.

---

## Tech Stack

### Backend

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript 5+ | Full type safety across all services |
| Runtime | Node.js 24 (LTS) | Active LTS, native ESM |
| gRPC transport | `@grpc/grpc-js` | Official Node gRPC implementation |
| Proto loading | `@grpc/proto-loader` | Dynamic proto loading at runtime |
| HTTP framework | Express 5 (gateway only) | Minimal surface area at the edge |
| ORM | Prisma | Type-safe DB access + migrations |
| Database | PostgreSQL 16 | Per-service databases |
| Validation | Zod | Runtime schema validation with TS inference |
| Password hashing | bcrypt (cost 12) | Industry standard; tunable cost factor |
| JWT | `jsonwebtoken` | RS256 signing and verification |
| Logging | Pino | Structured JSON; low overhead |
| Monorepo | pnpm workspaces | Shared packages with zero-install setup |
| Test runner | Vitest | Fast, native TypeScript |

### Frontend

| Concern | Choice | Reason |
|---|---|---|
| Framework | React 19 + TypeScript | Component model + type safety |
| Build tool | Vite | Fast dev server + ESM-native bundler |
| UI library | Material UI (MUI) v7 | Production-grade component system |
| Client state | Zustand | Minimal boilerplate; access token lives in memory here |
| Server state | TanStack Query v5 | Stale-while-revalidate, background refetch, mutation state |
| Routing | TanStack Router | Type-safe routes with built-in route guards |
| HTTP client | Axios | Interceptor-based silent token refresh on 401 |

---

## Project Structure

```
notes_grpc/
├── apps/
│   ├── gateway/           # Express API Gateway — public REST surface
│   ├── auth-service/      # gRPC Auth service
│   ├── notes-service/     # gRPC Notes service
│   └── web/               # React frontend
├── packages/
│   ├── proto/             # .proto contract definitions (source of truth)
│   ├── grpc-clients/      # Shared gRPC client factories
│   └── shared-types/      # Canonical error codes + HTTP envelope types
├── infra/
│   ├── docker-compose.yml # Local Postgres databases
│   └── k8s/              # Local Kubernetes manifests (Deployments, HPA, Ingress)
├── tests/
│   └── load/             # k6 stress test scripts
├── docs/
│   ├── implementation-plan.md
│   ├── runbook.md
│   └── k8.md
└── README.md
```

---

## Prerequisites

- **Node.js 24** — use `.nvmrc` / `nvm use`
- **pnpm 9+** — `npm install -g pnpm`
- **Docker Desktop** — for local Postgres instances

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start local databases
docker compose -f infra/docker-compose.yml up -d

# 3. Copy env templates and fill in values
cp apps/auth-service/.env.example  apps/auth-service/.env
cp apps/notes-service/.env.example apps/notes-service/.env
cp apps/gateway/.env.example        apps/gateway/.env
cp apps/web/.env.example            apps/web/.env

# 4. Run database migrations
pnpm --filter @notes/auth-service  exec prisma migrate dev
pnpm --filter @notes/notes-service exec prisma migrate dev

# 5. Start all services in dev mode
pnpm dev
```

---

## Environment Variables

### `apps/auth-service/.env`

```dotenv
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/auth_db"
# Supabase: DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<db>?pgbouncer=true"

# gRPC
GRPC_PORT=50051
GRPC_TLS_ENABLED=false
GRPC_TLS_KEY_PATH=""
GRPC_TLS_CERT_PATH=""

# JWT
# Leave blank to auto-generate on first boot (dev only).
# In production, supply pre-generated RSA PEM strings.
RSA_PRIVATE_KEY=""
RSA_PUBLIC_KEY=""
JWT_ISSUER="notes-auth-service"
JWT_AUDIENCE="notes-api-gateway"
JWT_ACCESS_TTL="15m"

# Refresh tokens
JWT_REFRESH_TTL_DAYS=30
```

### `apps/notes-service/.env`

```dotenv
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/notes_db"
# Supabase: DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<db>?pgbouncer=true"

# gRPC
GRPC_PORT=50052
GRPC_TLS_ENABLED=false
GRPC_TLS_KEY_PATH=""
GRPC_TLS_CERT_PATH=""
```

### `apps/gateway/.env`

```dotenv
PORT=3000
AUTH_SERVICE_URL="localhost:50051"
NOTES_SERVICE_URL="localhost:50052"

JWT_ISSUER="notes-auth-service"
JWT_AUDIENCE="notes-api-gateway"

# gRPC client TLS (gateway -> internal services)
GRPC_TLS_ENABLED=false
GRPC_TLS_CA_PATH=""

# Cookie
COOKIE_SECURE=false          # true in production (requires HTTPS)
COOKIE_SAME_SITE=lax         # strict | lax | none

# CORS
CORS_ORIGIN="http://localhost:5173"
```

### `apps/web/.env`

```dotenv
VITE_API_BASE_URL="http://localhost:3000"
```

---

## REST API Reference

### Auth

| Method | Path | Auth required | Description |
|---|---|---|---|
| `POST` | `/auth/signup` | No | Create account |
| `POST` | `/auth/login` | No | Login; sets HttpOnly refresh token cookie |
| `POST` | `/auth/refresh` | Cookie | Issue new access token |
| `POST` | `/auth/logout` | Bearer | Revoke current session; clear cookie |
| `POST` | `/auth/logout-all` | Bearer | Revoke all sessions; clear cookie |
| `GET` | `/auth/sessions` | Bearer | List active sessions (current device flagged) |
| `DELETE` | `/auth/sessions/:id` | Bearer | Revoke a specific session |
| `GET` | `/auth/public-key` | No | Expose RS256 public key (PEM) |

### Notes

| Method | Path | Auth required | Description |
|---|---|---|---|
| `GET` | `/notes` | Bearer | List all non-deleted notes for user |
| `POST` | `/notes` | Bearer | Create a note (TEXT or LIST type) |
| `PUT` | `/notes/:id` | Bearer | Update title and/or content (content type is immutable) |
| `DELETE` | `/notes/:id` | Bearer | Soft-delete a note |

---

## Note Content Shapes

### TEXT note

```json
{
  "type": "TEXT",
  "title": "Meeting notes",
  "content": { "text": "Discussed Q3 roadmap..." }
}
```

### LIST note

```json
{
  "type": "LIST",
  "title": "Shopping",
  "content": {
    "items": [
      { "text": "Milk",   "checked": false },
      { "text": "Eggs",   "checked": true  }
    ],
    "moveCheckedToEnd": true
  }
}
```

When `moveCheckedToEnd` is enabled in the list editor:
- Checked items are grouped below unchecked items.
- Toggling an unchecked item to checked moves it to the top of the checked section.
- Toggling a checked item to unchecked moves it to the boundary (end of unchecked section).
- If drag-and-drop or new-item edits violate unchecked-first ordering, the toggle is automatically disabled in the editor.

---

## Testing and Operations

### Test Commands

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test
pnpm test:load   # requires k6
```

### Seed Data

```bash
pnpm seed
```

Seed scripts populate:
- 3 demo users in auth DB
- 25+ notes across users in notes DB
- Long text and long list notes for scroll and pagination validation

### Docker Full Stack

```bash
docker compose -f infra/docker-compose.full.yml up --build
```

### Deployment and Local Kubernetes Guide

For local deployment, Kubernetes rollout, and stress-testing workflow, use:

- [docs/runbook.md](docs/runbook.md)
- [docs/k8.md](docs/k8.md)

Quick command set:

```bash
# Build images into minikube's Docker daemon
minikube docker-env --shell powershell | Invoke-Expression

docker build -f apps/auth-service/Dockerfile  -t notes/auth-service:dev .
docker build -f apps/notes-service/Dockerfile -t notes/notes-service:dev .
docker build -f apps/gateway/Dockerfile       -t notes/gateway:dev .
docker build -f apps/web/Dockerfile           -t notes/web:dev .

# Deploy manifests
kubectl apply -f infra/k8s

# Stress test
k6 run tests/load/stress.js
```

## Security Design

### Token model

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token (JWT RS256) | 15 minutes | Zustand memory only | Authorise every API request |
| Refresh token (opaque) | 30 days | HttpOnly cookie | Obtain a new access token |

Access tokens are **never written to localStorage or sessionStorage** — only held in JavaScript memory so they cannot be read by injected scripts.

### Why RS256?

The Auth Service signs JWTs with its **private key**.  
The API Gateway verifies them using the **public key** fetched once from `GET /auth/public-key` and cached.  
The gateway never sees the private key — this is the core decoupling benefit.

### Session model

Every login creates a `Session` row in the Auth DB. The session ID is embedded in the JWT as the `sid` claim. This enables:

- Listing active logins per user (visible in the UI)
- Identifying the current device client-side (compare `sid` from JWT against session list response)
- Revoking a single session without affecting other devices
- Revoking all sessions simultaneously (global logout)

### Refresh token rotation

Every successful `/auth/refresh` call:
1. Validates the presented refresh token against the stored bcrypt hash
2. Issues a new access token **and** a new refresh token
3. Replaces the stored hash with the new token's hash
4. The old token is immediately invalid

### Token theft / reuse detection

The Auth Service tracks both the current and previous refresh token hash per session. If a client presents a token that matches the **previous** hash (already rotated away), this indicates the token was stolen and replayed.

**Response:** The compromised session is immediately revoked. The legitimate owner is forced to re-login. A structured security event is logged.

### Password and refresh token storage

| Data | Storage | Algorithm |
|---|---|---|
| Passwords | DB | bcrypt, cost 12 |
| Refresh tokens | DB | bcrypt hash only — plaintext never persisted |

---

## Data Models

### Auth Service

```
User
  id          UUID   PK
  email       String UNIQUE
  passwordHash String
  createdAt   DateTime

Session
  id                  UUID     PK
  userId              UUID     FK → User
  refreshTokenHash    String
  previousTokenHash   String?  (for reuse detection)
  userAgent           String?
  ipAddress           String?
  createdAt           DateTime
  lastUsedAt          DateTime
  expiresAt           DateTime
  revokedAt           DateTime?
```

### Notes Service

```
Note
  id        UUID      PK
  userId    UUID      (no FK — cross-service boundary)
  type      Enum      TEXT | LIST
  title     String
  content   Json
  createdAt DateTime
  updatedAt DateTime
  deletedAt DateTime? (soft delete)
```

---

## gRPC Contracts

Defined in `packages/proto/src/`.

### Why gRPC internally?

- **Binary Protobuf framing** — smaller payload than JSON
- **HTTP/2 multiplexing** — multiple in-flight calls over a single TCP connection; no head-of-line blocking
- **Strongly typed contracts** — `.proto` files are the single source of truth; breaking changes surface at compile time, not at runtime
- **Performance** — serialisation/deserialisation is an order of magnitude faster than JSON

### gRPC status → HTTP status mapping

| gRPC | HTTP | Scenario |
|---|---|---|
| `OK` | 200 / 204 | Success |
| `INVALID_ARGUMENT` | 400 | Bad input |
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `PERMISSION_DENIED` | 403 | Ownership violation |
| `NOT_FOUND` | 404 | Resource absent |
| `ALREADY_EXISTS` | 409 | Duplicate email |
| `INTERNAL` | 500 | Unexpected server error |


---

## Implementation Phases

See [docs/implementation-plan.md](docs/implementation-plan.md) for the full incremental phase-by-phase breakdown with exact deliverables and commit messages for every sub-phase.

| Phase | Summary |
|---|---|
| 0 | Monorepo bootstrap, tooling, local infra |
| 1 | Protobuf contracts + service boot paths |
| 2 | Core auth — signup, login, access token |
| 3 | Notes CRUD |
| 4 | Refresh tokens — basic flow |
| 5 | Multi-device session management |
| 6 | Security hardening — rotation, reuse detection, rate limiting |
| 7 | React frontend |
| 8 | Testing and observability |
| 9 | Kubernetes deployment + load testing |

---

## Further Improvements

The following areas are candidates for future iteration, roughly ordered by impact.

### Authentication & Identity
- **OTP-based email verification** — require users to confirm their address with a one-time code before account activation, blocking disposable-email abuse.
- **Forgot-password / reset flow** — time-limited signed reset tokens delivered via email (e.g. via Resend or SendGrid).
- **OAuth 2.0 / social login** — add Google and GitHub providers (Passport.js or a dedicated lib like `arctic`) so users can sign in without a password.

### Mobile
- **React Native client** — share validation schemas and API contracts from `packages/shared-types`; reuse the same gateway REST API with no backend changes.

### Real-time & Collaboration
- **WebSocket / SSE sync** — push note change events to connected clients so multiple tabs or devices stay in sync without polling.
- **Note sharing & collaboration** — per-note ACL (owner / editor / viewer) with conflict-free merging (e.g. using CRDTs or operational transforms).

### Data & Search
- **Full-text search** — add a `tsvector` GIN index in Postgres and expose a `/notes/search` endpoint; later migrate to Elasticsearch or Typesense if the corpus grows.
- **Note tagging / labels** — many-to-many tag model with filtered list endpoint.
- **Archive & trash** — soft-delete with a recycle-bin TTL before permanent removal.
- **Import / export** — bulk Markdown export and import (zip bundle or single-file), making it easy to migrate data.

### Security
- **End-to-end encryption** — encrypt note bodies client-side (e.g. AES-GCM with a key derived from the user's password) so the server never sees plaintext content.
- **Audit log** — append-only event log (user created, note deleted, login from new device, etc.) for compliance and abuse investigation.

### Operations & Infrastructure
- **CI/CD pipeline** — GitHub Actions workflow: lint → unit tests → integration tests → build images → push to registry → rolling deploy to staging.
- **Helm charts** — package the K8s manifests as a Helm chart with a `values.yaml` for environment-specific overrides (image tags, replica counts, resource limits).
- **Prometheus + Grafana observability** — instrument the gateway and gRPC services with `prom-client`; deploy a Prometheus scrape config and a pre-built Grafana dashboard for RPS, latency, and error rate.
- **Horizontal pod autoscaling** — HPA objects for gateway, auth-service, and notes-service based on CPU and custom RPS metrics.

### Frontend (Web)
- **Dark mode** — system-preference-aware `prefers-color-scheme` toggle persisted to `localStorage`.
- **PWA / offline support** — service-worker caching for the app shell and a local IndexedDB queue that replays mutations when connectivity returns.
- **Internationalization (i18n)** — `react-i18next` with locale files; auto-detect browser language with a manual override.
- **Admin dashboard** — internal-only route (behind a role check) showing active sessions, registered users, and aggregate note counts.
