# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# CreditOS — production image (Dokploy / any Docker host)
# Single container: Nuxt 4 (Nitro node-server) + in-process job worker.
# PostgreSQL is external; set DATABASE_URL at runtime.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm nuxt prepare && pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    MIGRATIONS_DIR=/app/server/db/migrations
WORKDIR /app

RUN addgroup -S creditos && adduser -S creditos -G creditos \
  && mkdir -p /data && chown -R creditos:creditos /data /app

COPY --from=build --chown=creditos:creditos /app/.output ./.output
COPY --from=build --chown=creditos:creditos /app/server/db/migrations ./server/db/migrations
COPY --from=build --chown=creditos:creditos /app/package.json ./package.json

USER creditos
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
