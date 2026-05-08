#!/bin/sh
set -eu

# Required shared config
: "${JWT_ISSUER:?JWT_ISSUER is required}"
: "${JWT_AUDIENCE:?JWT_AUDIENCE is required}"
: "${JWT_ACCESS_TTL:?JWT_ACCESS_TTL is required}"
: "${JWT_REFRESH_TTL_DAYS:?JWT_REFRESH_TTL_DAYS is required}"
: "${CORS_ORIGIN:?CORS_ORIGIN is required}"

# Required per-service database URLs
: "${AUTH_DATABASE_URL:?AUTH_DATABASE_URL is required}"
: "${AUTH_DIRECT_URL:?AUTH_DIRECT_URL is required}"
: "${NOTES_DATABASE_URL:?NOTES_DATABASE_URL is required}"
: "${NOTES_DIRECT_URL:?NOTES_DIRECT_URL is required}"

PORT="${PORT:-3000}"
LOG_LEVEL="${LOG_LEVEL:-info}"
COOKIE_SECURE="${COOKIE_SECURE:-true}"
COOKIE_SAME_SITE="${COOKIE_SAME_SITE:-none}"
GRPC_TLS_ENABLED="${GRPC_TLS_ENABLED:-false}"
NODE_ENV="${NODE_ENV:-production}"

if [ "${RUN_MIGRATIONS_ON_BOOT:-false}" = "true" ]; then
  echo "[bootstrap] running auth-service migrations"
  DATABASE_URL="$AUTH_DIRECT_URL" DIRECT_URL="$AUTH_DIRECT_URL" pnpm --filter @notes/auth-service exec prisma migrate deploy

  echo "[bootstrap] running notes-service migrations"
  DATABASE_URL="$NOTES_DIRECT_URL" DIRECT_URL="$NOTES_DIRECT_URL" pnpm --filter @notes/notes-service exec prisma migrate deploy
fi

# Start auth-service
NODE_ENV="$NODE_ENV" \
LOG_LEVEL="$LOG_LEVEL" \
GRPC_TLS_ENABLED="$GRPC_TLS_ENABLED" \
GRPC_PORT=50051 \
DATABASE_URL="$AUTH_DATABASE_URL" \
DIRECT_URL="$AUTH_DIRECT_URL" \
JWT_ISSUER="$JWT_ISSUER" \
JWT_AUDIENCE="$JWT_AUDIENCE" \
JWT_ACCESS_TTL="$JWT_ACCESS_TTL" \
JWT_REFRESH_TTL_DAYS="$JWT_REFRESH_TTL_DAYS" \
RSA_PRIVATE_KEY="${RSA_PRIVATE_KEY:-}" \
RSA_PUBLIC_KEY="${RSA_PUBLIC_KEY:-}" \
pnpm --filter @notes/auth-service start &
AUTH_PID=$!

echo "[bootstrap] auth-service started (pid=$AUTH_PID)"

# Start notes-service
NODE_ENV="$NODE_ENV" \
LOG_LEVEL="$LOG_LEVEL" \
GRPC_TLS_ENABLED="$GRPC_TLS_ENABLED" \
GRPC_PORT=50052 \
DATABASE_URL="$NOTES_DATABASE_URL" \
DIRECT_URL="$NOTES_DIRECT_URL" \
pnpm --filter @notes/notes-service start &
NOTES_PID=$!

echo "[bootstrap] notes-service started (pid=$NOTES_PID)"

# Start gateway (public process)
NODE_ENV="$NODE_ENV" \
LOG_LEVEL="$LOG_LEVEL" \
PORT="$PORT" \
AUTH_SERVICE_URL="127.0.0.1:50051" \
NOTES_SERVICE_URL="127.0.0.1:50052" \
JWT_ISSUER="$JWT_ISSUER" \
JWT_AUDIENCE="$JWT_AUDIENCE" \
JWT_REFRESH_TTL_DAYS="$JWT_REFRESH_TTL_DAYS" \
CORS_ORIGIN="$CORS_ORIGIN" \
COOKIE_SECURE="$COOKIE_SECURE" \
COOKIE_SAME_SITE="$COOKIE_SAME_SITE" \
COOKIE_DOMAIN="${COOKIE_DOMAIN:-}" \
pnpm --filter @notes/gateway start &
GATEWAY_PID=$!

echo "[bootstrap] gateway started (pid=$GATEWAY_PID, port=$PORT)"

cleanup() {
  echo "[bootstrap] shutting down all services"
  kill "$AUTH_PID" "$NOTES_PID" "$GATEWAY_PID" 2>/dev/null || true
  wait "$AUTH_PID" "$NOTES_PID" "$GATEWAY_PID" 2>/dev/null || true
}

trap cleanup INT TERM

# Fail container if any child process exits.
while true; do
  for pid in "$AUTH_PID" "$NOTES_PID" "$GATEWAY_PID"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[bootstrap] process exited unexpectedly (pid=$pid), stopping container"
      cleanup
      exit 1
    fi
  done
  sleep 1
done
