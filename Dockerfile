# syntax=docker/dockerfile:1

FROM node:24.14.1-bookworm-slim AS base
WORKDIR /app
# Prisma CLI (migraciones) necesita openssl para elegir su motor.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack install

FROM base AS deps
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm exec prisma generate && pnpm build

# Paso aparte con el rol dueño de las tablas: la API nunca tiene esa URL.
# También corre los scripts (`node_modules/.bin/tsx scripts/create-admin.ts`).
# Los binarios van directo: pnpm (corepack) quedó instalado para root.
FROM build AS migrate
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:24.14.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT ?? 3001}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Sentry se carga antes que Nest: en ESM tiene que ir primero.
CMD ["node", "--import", "./dist/instrument.js", "dist/main"]
