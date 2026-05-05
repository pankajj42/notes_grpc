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
│   └── docker-compose.yml # Local Postgres databases
├── docs/
│   └── implementation-plan.md
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
    ]
  }
}
```

---

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
