# Runbook: Local Dev, Testing, Docker, and Deployment

This runbook covers:
- Local setup and startup
- Unit, integration, and end-to-end test execution
- Seed data generation
- Dockerized full-stack startup
- Kubernetes local deployment strategy
- Stress testing and autoscaling checks

## 1. Local Setup

### Prerequisites
- Node.js 24+
- pnpm 10+
- Docker Desktop

### Install and bootstrap

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
```

Copy env files:

```bash
cp apps/auth-service/.env.example apps/auth-service/.env
cp apps/notes-service/.env.example apps/notes-service/.env
cp apps/gateway/.env.example apps/gateway/.env
cp apps/web/.env.example apps/web/.env
```

Run migrations and generate Prisma clients:

```bash
pnpm prisma:generate
pnpm prisma:migrate:dev
```

Start all services in dev mode:

```bash
pnpm dev
```

## 2. Seed Data

Seed scripts are available for both databases.

```bash
pnpm seed
```

What gets seeded:
- Auth DB:
  - 3 users (`demo1@example.com`, `demo2@example.com`, `demo3@example.com`)
  - password for all: `Password123!`
  - one active session per user
- Notes DB:
  - 25 notes for user 1 (multi-page coverage)
  - 10 notes for user 2
  - 6 notes for user 3
  - long TEXT notes and long LIST notes (scroll and rendering validation)

## 3. Test Matrix

### Unit tests

```bash
pnpm test:unit
```

Coverage includes:
- Auth service: auth response construction, password hashing/verification, session token validation and lockout logic
- Notes service: CRUD service-layer behavior and pagination transaction logic
- Gateway observability helpers: correlation metadata and request-id behavior

### Integration tests

```bash
pnpm test:integration
```

Coverage includes:
- Gateway auth flows with a mocked gRPC backend
- Signup/login/refresh/logout
- Invalid email/password validation and not-signed-up login
- Authenticated notes CRUD through HTTP boundary

### End-to-end tests (API-level)

```bash
pnpm test:e2e
```

Coverage includes:
- Full user journey: signup -> login -> refresh -> create notes -> pagination checks

Run all tests:

```bash
pnpm test
```

## 4. Full Stack via Docker

A full-stack compose file is provided at [infra/docker-compose.full.yml](infra/docker-compose.full.yml).

Build and run all services:

```bash
docker compose -f infra/docker-compose.full.yml up --build
```

Stop:

```bash
docker compose -f infra/docker-compose.full.yml down
```

## 5. Deployment Guidance

### Recommended production topology
- `auth-service` deployment
- `notes-service` deployment
- `gateway` deployment
- `web` deployment (or static hosting + CDN)
- managed PostgreSQL for auth and notes databases
- secrets managed externally (Kubernetes secrets or cloud secret manager)

### Production checklist
- Set stable RSA key pair through env vars for auth-service
- Enable TLS for public ingress and internal traffic where required
- Set `COOKIE_SECURE=true`
- Configure `CORS_ORIGIN` to trusted frontend origin
- Enforce DB backup and migration workflow (`prisma migrate deploy`)
- Configure log shipping (Pino JSON to ELK/Loki/Datadog)

## 6. Local Kubernetes Plan (Minikube / Kind)

### Step 1: create cluster and metrics

```bash
minikube start --cpus=4 --memory=8192
minikube addons enable metrics-server
```

### Step 2: build images for local cluster

```bash
eval $(minikube docker-env)
docker build -f apps/auth-service/Dockerfile -t notes/auth-service:local .
docker build -f apps/notes-service/Dockerfile -t notes/notes-service:local .
docker build -f apps/gateway/Dockerfile -t notes/gateway:local .
docker build -f apps/web/Dockerfile -t notes/web:local .
```

### Step 3: deploy each service separately
- Create one Deployment + Service per app.
- Inject env vars via ConfigMaps and Secrets.
- Start with replicas:
  - auth-service: 2
  - notes-service: 2
  - gateway: 2
  - web: 1

### Step 4: expose gateway/web
- Use `Ingress` or `NodePort`.
- Keep internal services cluster-only (`ClusterIP`).

### Step 5: autoscaling
- Add HPA for `gateway`, `auth-service`, `notes-service`.
- Example target:
  - min replicas: 2
  - max replicas: 10
  - CPU target: 60%

### Step 6: stress test
Use k6 against gateway endpoints:

```bash
k6 run ./tests/perf/smoke.js
```

During load, check scaling:

```bash
kubectl get hpa -w
kubectl get pods -w
kubectl top pods
```

If load is sustained and resource thresholds are crossed, replica counts should increase.

## 7. Notes on Scope

The e2e tests in this phase are API-level end-to-end tests with mocked internal gRPC clients. For full infrastructure e2e (real gRPC + real DB + gateway + web browser), add a CI stage that boots the full docker-compose stack and runs Playwright browser tests.
