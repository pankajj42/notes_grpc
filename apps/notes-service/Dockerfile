FROM node:24-alpine

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY eslint.config.mjs ./

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @notes/shared-types run build
RUN pnpm --filter @notes/notes-service run prisma:generate
RUN pnpm --filter @notes/notes-service run build

WORKDIR /workspace/apps/notes-service
EXPOSE 50052

CMD ["pnpm", "start"]
