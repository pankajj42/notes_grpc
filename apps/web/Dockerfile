FROM node:24-alpine

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY eslint.config.mjs ./

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @notes/shared-types run build
RUN pnpm --filter @notes/web run build

WORKDIR /workspace/apps/web
EXPOSE 5173

CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "5173"]
