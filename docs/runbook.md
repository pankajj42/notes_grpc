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

## 6. Local Kubernetes Plan (Minikube)

Concrete manifests are provided under `infra/k8s`:
- namespace, configmap, secrets
- auth-db + notes-db StatefulSets
- auth-service + notes-service + gateway Deployments/Services/HPAs
- web Deployment/Service
- ingress for `notes.local` with `/api` routed to gateway

### Step 1: start cluster and addons

```bash
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable metrics-server
minikube addons enable ingress
```

### Step 2: build images in minikube docker daemon

```bash
minikube docker-env --shell powershell | Invoke-Expression

docker build -f apps/auth-service/Dockerfile  -t notes/auth-service:dev .
docker build -f apps/notes-service/Dockerfile -t notes/notes-service:dev .
docker build -f apps/gateway/Dockerfile       -t notes/gateway:dev .
docker build -f apps/web/Dockerfile           -t notes/web:dev .
```

### Step 3: configure host + secrets

```bash
# Windows + minikube docker driver: map notes.local to localhost
# Run PowerShell as Administrator
Add-Content -Path "C:\\Windows\\System32\\drivers\\etc\\hosts" -Value "127.0.0.1  notes.local"

# Keep this running in a separate terminal while testing
minikube tunnel
```

Edit `infra/k8s/secrets.yaml` and replace placeholder RSA keys / DB values.

### Step 4: deploy

```bash
pnpm k8:apply
kubectl get pods -n notes -w
```

### Step 5: stress and verify autoscaling

```bash
k6 run tests/load/stress.js
```

In parallel:

```bash
kubectl get hpa -n notes -w
kubectl get pods -n notes -w
kubectl top pods -n notes
```

Expected behavior:
- replica counts increase as CPU crosses HPA target (60%)
- pods scale down after sustained lower utilization

### Troubleshooting load-test failures

- Symptom: `lookup notes.local: no such host`
  - Fix: add `127.0.0.1 notes.local` to the hosts file.

- Symptom: `list 200` / `create 201` checks fail with ~44% failure rate; k6 shows `request timeout` errors; timeouts start around the 100 VU mark
  - Cause: gateway was creating a new gRPC client (full TCP/HTTP2 connection) on every HTTP request and closing it immediately. Under high concurrency this creates hundreds of short-lived connections per second, exhausting the event loop and the backend services.
  - Fix: `createNotesServiceClient` and `createAuthServiceClient` are now module-level singletons in `apps/gateway/src/routes/notes.ts` and `auth.ts`. The `close()` parameter was removed from `grpcUnaryCall` — clients must be long-lived. This change requires rebuilding and redeploying the gateway image.

- Symptom: HPA scales gateway to 7+ pods but several stay `Pending`; `kubectl describe pod` shows `Insufficient cpu`
  - Cause: minikube single-node cluster has 2 CPUs. With 100m CPU requests per pod, 7 gateway + 2 auth + 3 notes + 2 DB pods = ~1400m plus system overhead hits the 2000m ceiling.
  - Fix: CPU requests for `gateway`, `auth-service`, and `notes-service` are lowered to `50m` in their K8s manifests. Set HPA `maxReplicas` to `4` for this 2-CPU minikube profile, then run:
    ```bash
    pnpm k8:apply
    kubectl scale deployment/auth-service deployment/notes-service deployment/gateway -n notes --replicas=2
    ```

- Symptom: `dial tcp 192.168.49.2:80 ... failed to respond`
  - Cause: with minikube Docker driver on Windows, the minikube VM IP is not directly reachable from host.
  - Fix: keep `minikube tunnel` running and keep hosts entry as `127.0.0.1 notes.local`.

- Symptom: `public-key` or `signup` fails with `Unable to connect to the remote server`, and `Test-NetConnection notes.local -Port 80` is false
  - Cause: stale or dead minikube tunnel process.
  - Fix: stop stale tunnel process and start a fresh tunnel:
    ```bash
    Get-Process minikube -ErrorAction SilentlyContinue | Stop-Process -Force
    minikube tunnel
    ```

- Symptom: setup fails with `status=500` and message `secretOrPrivateKey must be an asymmetric key when using RS256`
  - Cause: `notes-secrets` contains placeholder/invalid JWT key values (often overwritten by `infra/k8s/secrets.yaml`).
  - Fix: patch `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` in the `notes-secrets` secret with a valid RSA keypair, then restart auth + gateway.

- Symptom: k6 shows all checks failed for `signup 201`, with low latency and non-zero data transfer
  - Common cause: gateway signup rate limiter (`20/hour`) returns `429` under repeated signup loops.
  - Fix: use the current `tests/load/stress.js` flow (signup once in `setup()`, then note create/list in VUs).
  - If a prior run exhausted limiter state, reset it with:
    ```bash
    kubectl rollout restart deployment/gateway -n notes
    kubectl rollout status deployment/gateway -n notes
    ```

- Symptom: signup fails with server errors and auth logs include `The table public.users does not exist`
  - Cause: migrations not applied in cluster.
  - Fix now (one-off):
    ```bash
    kubectl exec -n notes deployment/auth-service -- sh -c "cd /workspace/apps/auth-service && pnpm exec prisma migrate deploy"
    kubectl exec -n notes deployment/notes-service -- sh -c "cd /workspace/apps/notes-service && pnpm exec prisma migrate deploy"
    ```
  - Preventative: `auth-service` and `notes-service` manifests include migration init containers.

## 7. Notes on Scope

The e2e tests in this phase are API-level end-to-end tests with mocked internal gRPC clients. For full infrastructure e2e (real gRPC + real DB + gateway + web browser), add a CI stage that boots the full docker-compose stack and runs Playwright browser tests.
