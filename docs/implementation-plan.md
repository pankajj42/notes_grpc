# Implementation Plan

Full phased roadmap for the Notes gRPC Microservices project.

## Phase 0 — Foundation

### 0.1 Monorepo bootstrap

- pnpm workspace with `apps/*` and `packages/*` globs
- `pnpm-workspace.yaml`
- All service directories scaffolded
- Root `package.json` with workspace-level `dev`, `build`, `lint`, `typecheck`, `test` scripts
- TypeScript 6 installed at root; `tsc --init` run per service
- `tsconfig.base.json` — shared strict compiler options
- Per-service `tsconfig.json` files extending base
- ESLint flat config (`eslint.config.mjs`) with `typescript-eslint` strict rules + Prettier
- `.prettierrc` — 2-space, trailing commas, LF
- `.gitignore`, `.gitattributes` (LF normalisation), `.nvmrc` (Node 22)
- Vitest workspace config

**Commit**: `chore(repo): initialize monorepo workspace skeleton with TypeScript and tooling baseline`

---

### 0.2 Local infra and env templates

- `infra/docker-compose.yml` — separate `auth-db` (port 5432) and `notes-db` (port 5433) Postgres 16 containers
- `.env.example` in each service with documented variables

**Postgres hosting**: for local development the docker-compose containers are used. For a hosted database (e.g. Supabase), replace `DATABASE_URL` with the Supabase connection string. Supabase supplies two URLs — use the **Transaction** pooler URL (port 6543) with `?pgbouncer=true` for the running app, and the **Direct** connection URL (port 5432) for Prisma migrations (`prisma migrate dev` does not work through PgBouncer). Document both in `.env.example` as `DATABASE_URL` and `DIRECT_URL` respectively.

**Commit**: `chore(infra): add docker compose postgres services and env templates`

---

### 0.3 Project conventions

- `README.md` — architecture overview, stack, quick-start, security summary
- `docs/implementation-plan.md` — this file
- `packages/shared-types/src/errors.ts` — canonical error codes used by all services
- `packages/shared-types/src/http.ts` — standardized HTTP response envelope

**Commit**: `chore(conventions): add project documentation and shared error contracts`

---

## Phase 1 — Contracts and Service Skeletons

> All contracts are defined before any service logic is written so that every service implements to the same specification from the start.

### 1.1 Protobuf contracts

**Files**
- `packages/proto/src/auth.proto`
- `packages/proto/src/notes.proto`

**Auth RPCs**
```
Signup(SignupRequest)                     → AuthTokensResponse
Login(LoginRequest)                       → AuthTokensResponse
RefreshToken(RefreshTokenRequest)         → AuthTokensResponse
LogoutCurrentSession(SessionRequest)      → google.protobuf.Empty
LogoutAllSessions(UserRequest)            → google.protobuf.Empty
ListSessions(UserRequest)                 → ListSessionsResponse
RevokeSession(RevokeSessionRequest)       → google.protobuf.Empty
GetPublicKey(google.protobuf.Empty)       → PublicKeyResponse
```

**Notes RPCs**
```
CreateNote(CreateNoteRequest)   → Note
GetNotes(GetNotesRequest)       → GetNotesResponse
GetNote(GetNoteRequest)         → Note
UpdateNote(UpdateNoteRequest)   → Note
DeleteNote(DeleteNoteRequest)   → google.protobuf.Empty
```

**Proto evolution rules (enforced)**
- Field numbers are stable API surface — never reuse a deleted number
- Deleted fields must be listed under `reserved`
- New fields must be `optional`
- Message names are PascalCase; field names are snake_case

**Commit**: `feat(proto): add v1 auth and notes gRPC contracts`

---

### 1.2 Service boot paths

**Deliverables per service**
- `src/server.ts` — gRPC server startup + graceful shutdown
- `src/config.ts` — env-validated config via Zod (fail-fast on missing required vars)
- Health probe: gRPC `SERVING` status
- Gateway: Express app + `GET /health` returning `{ status: "ok" }`

**Commit**: `feat(services): add gRPC and gateway boot paths with health endpoints`

---

### 1.3 Zod validation layer (gateway)

**Deliverables**
- `apps/gateway/src/validation/` — Zod schemas for every route
- `apps/gateway/src/middleware/validate.ts` — generic Zod validation middleware
- Error response shape on validation failure: `{ code: "VALIDATION_ERROR", message: string, fields: Record<string, string> }`

**Commit**: `feat(gateway): add Zod validation middleware and route schemas`

---

## Phase 2 — Core Auth Vertical

### 2.1 Auth service — signup and login

**Deliverables**
- Prisma schema (`User` model) + initial migration
- `AuthService.Signup` — validate email (Zod), hash password (bcrypt cost 12), create user, sign RS256 access token
- `AuthService.Login` — verify password, sign RS256 access token
- `AuthService.GetPublicKey` — returns public key PEM
- `apps/auth-service/src/keys.ts` — RSA key pair management (env-first, auto-generate if absent in dev)

**Why auto-generate in dev?** Generating at startup avoids the need to pre-create PEM files locally; the key lives only in memory and rotates on each restart. In production, supply stable PEM values via environment variables so the key survives restarts.

**JWT claims**
```jsonc
{
  "sub": "<userId>",      // user UUID
  "sid": "<sessionId>",   // session UUID (added Phase 4)
  "iss": "notes-auth-service",
  "aud": "notes-api-gateway",
  "iat": 1234567890,
  "exp": 1234568790
}
```

**Commit**: `feat(auth): implement signup and login with RS256 access token issuance`

---

### 2.2 Gateway auth routes

**Routes**
```
POST /auth/signup   → AuthService.Signup
POST /auth/login    → AuthService.Login
GET  /auth/public-key
```

- Zod schemas applied
- Access token returned in JSON body
- Refresh token (placeholder in this phase; cookie set in Phase 4)
- gRPC client factory in `packages/grpc-clients`

**Commit**: `feat(gateway): add REST auth routes bridged to gRPC`

---

### 2.3 JWT verification middleware

**Deliverables**
- `apps/gateway/src/middleware/authenticate.ts`
- Fetches public key from `AuthService.GetPublicKey` on first use; caches in-process
- Re-fetches on verification failure (supports future key rotation)
- Attaches `req.user = { userId, sessionId }` on success
- Returns `401` with `{ code: "UNAUTHORIZED" }` on failure

**Commit**: `feat(authz): add JWT verification middleware with public key cache`

---

## Phase 3 — Notes Vertical

### 3.1 Notes service CRUD

**Prisma schema** (`Note` model)
```
Note
  id        UUID        PK
  userId    UUID        NOT NULL  (no FK — cross-service boundary)
  type      Enum        TEXT | LIST
  title     String      NOT NULL
  content   Json        NOT NULL
  createdAt DateTime
  updatedAt DateTime
  deletedAt DateTime?   (soft delete)
```

**Content shapes**
```ts
// TEXT
{ text: string }

// LIST
{ items: Array<{ text: string; checked: boolean }> }
```

**Commit**: `feat(notes): implement note CRUD gRPC service with soft delete`

---

### 3.2 Gateway notes routes

**Routes (all authenticated)**
```
GET    /notes        → NotesService.GetNotes
POST   /notes        → NotesService.CreateNote
PUT    /notes/:id    → NotesService.UpdateNote
DELETE /notes/:id    → NotesService.DeleteNote
```

- `userId` forwarded via gRPC metadata (`x-user-id`)
- Notes service enforces ownership — returns `PERMISSION_DENIED` on mismatch

**Commit**: `feat(gateway): add authenticated notes REST routes`

---

### 3.3 Zod schemas for note content

- Discriminated union schema for TEXT vs LIST content validation
- Validates `items` array structure for LIST notes
- Applied at gateway before forwarding to gRPC

**Commit**: `feat(gateway): add discriminated Zod schemas for note content types`

---

## Phase 4 — Refresh Token Basic Flow

### 4.1 Session persistence

**Prisma schema additions**
```
Session
  id                UUID        PK
  userId            UUID        FK → User.id
  refreshTokenHash  String      NOT NULL  (bcrypt hash)
  userAgent         String?
  ipAddress         String?
  createdAt         DateTime
  lastUsedAt        DateTime
  expiresAt         DateTime
  revokedAt         DateTime?
```

- On login: create session, hash refresh token, return plaintext refresh token to gateway
- Gateway sets refresh token as HttpOnly cookie:
  - `Path=/auth`; `HttpOnly`; `Secure` (env-driven); `SameSite` (env-driven)
- `sessionId` embedded in access JWT (`sid` claim)

**Commit**: `feat(auth): add session persistence and refresh token issuance`

---

### 4.2 Refresh endpoint

**RPC**: `AuthService.RefreshToken`

Validations (all must pass):
1. Session exists and `revokedAt` is null
2. `expiresAt` is in the future
3. bcrypt hash of presented token matches `refreshTokenHash`
4. Updates `lastUsedAt`

Returns new access token.

**Gateway route**: `POST /auth/refresh` — reads cookie, forwards to RPC, returns new access token in body.

**Commit**: `feat(auth): implement refresh token validation and access token renewal`

---

## Phase 5 — Multi-Device Session Management

### 5.1 Session listing

**RPC**: `AuthService.ListSessions`

Returns active (non-revoked, non-expired) sessions with:
- `id`, `userAgent`, `ipAddress`, `createdAt`, `lastUsedAt`
- `isCurrent: boolean` — determined by matching `sessionId` from JWT `sid` claim

**Gateway route**: `GET /auth/sessions`

**Commit**: `feat(session): add session listing with current device identification`

---

### 5.2 Session revocation

**RPCs**
- `AuthService.LogoutCurrentSession` — sets `revokedAt` on session from JWT `sid`
- `AuthService.RevokeSession` — sets `revokedAt` on target session (ownership check: same userId)
- `AuthService.LogoutAllSessions` — sets `revokedAt` on all non-revoked sessions for user

**Gateway routes**
```
POST   /auth/logout              → LogoutCurrentSession (clears cookie)
DELETE /auth/sessions/:id        → RevokeSession
POST   /auth/logout-all          → LogoutAllSessions (clears cookie)
```

**Commit**: `feat(session): add current, per-device, and global session revocation`

---

## Phase 6 — Security Hardening

### 6.1 Refresh token rotation

On every successful `RefreshToken` call:
1. Generate new refresh token
2. bcrypt hash it
3. Replace `refreshTokenHash` on session record
4. Return new token to gateway → update cookie

Old token is invalid immediately after rotation.

**Commit**: `feat(security): add refresh token rotation on every refresh`

---

### 6.2 Reuse detection (token theft detection)

**Why this matters**
With rotation, every refresh token is single-use. If an attacker steals a refresh token and uses it *after* the legitimate client has already rotated it, the Auth Service receives a token that no longer matches the stored hash. This is detectable — and the correct response is to treat it as a breach signal.

**Mechanism**
- Add `previousTokenHash String?` column alongside `refreshTokenHash` on the `Session` row
- Prisma migration: add nullable `previousTokenHash` to `Session`
- After each rotation:
  - `previousTokenHash = old refreshTokenHash`
  - `refreshTokenHash = new token hash`
- On incoming refresh request:
  1. Hash the presented token and compare against `refreshTokenHash`
  2. If match → valid; rotate as normal
  3. If **no match** → compare against `previousTokenHash`
  4. If match against `previousTokenHash` → **reuse detected** (the rotated-away token was replayed)
  5. If no match at all → invalid/expired token (standard 401)

**Reuse response**
1. Set `revokedAt = now` on the compromised session only (product decision: don't wipe all sessions — the user still has other devices logged in)
2. Emit a structured Pino log entry with `event: "security"`, `type: "refresh_token_reuse"`, `sessionId`, `userId`, `ipAddress`
3. Return `401 UNAUTHENTICATED` → client must re-login for this session

**Attack timeline example**
```
t=0  User logs in           → RT₁ issued, stored as hash(RT₁)
t=1  Attacker steals RT₁
t=2  Legit user refreshes   → RT₁ rotated to RT₂
                               previousHash = hash(RT₁), currentHash = hash(RT₂)
t=3  Attacker uses RT₁     → hash(RT₁) matches previousTokenHash
                               ⚠ Reuse detected → session revoked
t=4  Legit user next call  → 401, forced to re-login
```

**Commit**: `feat(security): add refresh token reuse detection and session revocation`

**Commit**: `feat(security): add refresh token reuse detection and session revocation`

---

### 6.3 Abuse controls

- Rate limiting on `POST /auth/refresh` per session (token bucket: 10 req/min)
- Increment failed-attempt counter on invalid refresh; lock session after 5 consecutive failures
- Audit log entries for: login, logout, refresh, reuse detection event

**Commit**: `feat(security): add refresh rate limiting and audit logging`

---

## Phase 7 — React Frontend

### 7.1 Auth and notes flows

**Stack**
- React 19 + TypeScript + Vite
- MUI v7 (component library + theming; `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`)
- Zustand v5 (auth state: `userId`, in-memory `accessToken`, `sessionId`)
- TanStack Query v5 — `@tanstack/react-query` (server state for notes and sessions; stale-while-revalidate, background refetch, mutation state)
- TanStack Router v1 — `@tanstack/react-router` (type-safe file-based routing; route guards via `beforeLoad`)
- Axios (HTTP client; request interceptor attaches `Authorization: Bearer <token>`; response interceptor triggers silent refresh on 401, then retries original request once)
- Zod — validate all API response shapes at the client boundary

**Deliverables**
- Login, signup screens
- Protected route layout (redirect to login if no token)
- Notes list, create, edit, delete (TEXT and LIST editors)
- Silent refresh: Axios interceptor retries with new token on 401
- Access token stored in Zustand memory only — never localStorage

**Commit**: `feat(web): add React app with auth flows, notes CRUD, and silent refresh`

---

### 7.2 Session management UI

**Deliverables**
- Sessions page: table of active devices with `userAgent`, `ipAddress`, `lastUsedAt`
- Current session visually marked (badge / bold row)
- "Logout this device" button per row
- "Logout all devices" button

**Commit**: `feat(web): add session management UI with current device identification`

---

## Phase 8 — Quality and Observability

### 8.1 Tests

**Coverage targets**
- Auth service: unit tests for token signing, password hashing, session creation
- Gateway: integration tests for login → refresh → logout flow
- Notes service: unit tests for CRUD and ownership enforcement
- Security: rotation correctness, reuse detection trigger, session revocation

**Commit**: `test(core): add auth, notes, and session management critical-path tests`

---

### 8.2 Observability

- Pino structured JSON logging in all backend services
- Correlation ID generated at gateway; forwarded as gRPC metadata (`x-request-id`)
- Log fields on every request: `requestId`, `userId` (if authenticated), `method`, `path`, `durationMs`, `statusCode`
- Log security events with `event: "security"` tag

**Commit**: `feat(obs): add structured Pino logging and correlation ID propagation`

---

## Security Controls Timeline

| Phase | Control |
|---|---|
| 2.1 | RS256 JWT signing; bcrypt password hashing (cost 12) |
| 2.3 | Gateway JWT signature verification with public key cache |
| 3.2 | Per-user note ownership enforcement via gRPC metadata |
| 4.1 | Refresh tokens hashed before DB storage; HttpOnly cookie |
| 4.2 | Session validity checks (not revoked, not expired, hash match) |
| 5.2 | Per-device and global session revocation |
| 6.1 | Refresh token rotation — old token invalidated on use |
| 6.2 | Reuse detection — compromised session revoked on replay |
| 6.3 | Refresh rate limiting; failed-attempt lockout |
| 8.1 | Validated inputs via Zod at all gateway boundaries |

---

## gRPC Design Reference

### Why gRPC internally

- Binary Protobuf framing — smaller payloads than JSON
- HTTP/2 multiplexing — multiple in-flight calls over a single connection
- Strong contracts — breaking changes caught at compile time
- Unary calls for all RPCs in this project (streaming not needed)

### Node.js loading strategy

```ts
import * as protoLoader from "@grpc/proto-loader";
import * as grpc from "@grpc/grpc-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packageDef = protoLoader.loadSync(
  path.resolve(__dirname, "../../../packages/proto/src/auth.proto"),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const proto = grpc.loadPackageDefinition(packageDef) as any;
```

### gRPC status → HTTP status mapping

| gRPC status | HTTP status |
|---|---|
| OK | 200 |
| INVALID_ARGUMENT | 400 |
| UNAUTHENTICATED | 401 |
| PERMISSION_DENIED | 403 |
| NOT_FOUND | 404 |
| ALREADY_EXISTS | 409 |
| INTERNAL | 500 |

---

## Request Lifecycle Reference

### Login

```
Client → POST /auth/login
Gateway: Zod validate → gRPC AuthService.Login
AuthService: verify password → create session → sign JWT (RS256) → hash RT → store in DB
Gateway: set HttpOnly RT cookie → return { accessToken } in body
Client: store accessToken in memory
```

### Authenticated notes request

```
Client → GET /notes (Authorization: Bearer <accessToken>)
Gateway: verify JWT RS256 (cached public key) → extract userId, sessionId
Gateway → gRPC NotesService.GetNotes (metadata: x-user-id = userId)
NotesService: filter by userId → return notes
Gateway: map to REST response
```

### Token refresh

```
Client → POST /auth/refresh (cookie: refreshToken)
Gateway → gRPC AuthService.RefreshToken({ refreshToken })
AuthService: validate session (not revoked, not expired, hash match) → update lastUsedAt
  Phase 6+: rotate refresh token, detect reuse
AuthService: sign new accessToken
Gateway: update RT cookie (Phase 6+) → return { accessToken }
Client: update in-memory accessToken
```

### Logout (current session)

```
Client → POST /auth/logout (Authorization: Bearer <accessToken>)
Gateway: extract sessionId from JWT claims
Gateway → gRPC AuthService.LogoutCurrentSession({ sessionId })
AuthService: set revokedAt on session
Gateway: clear RT cookie → 204
```

---

## Commit Convention

Format: `<type>(<scope>): <summary>`

| Type | Use |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `chore` | Tooling, config, scaffolding |
| `test` | Tests added or updated |
| `docs` | Documentation only |
| `refactor` | Restructure without behavior change |
| `perf` | Performance improvement |
| `security` | Security-only fix |

Examples:
```
feat(auth): implement signup and login with RS256 JWT
chore(repo): initialize monorepo workspace skeleton
security(auth): add refresh token reuse detection
```