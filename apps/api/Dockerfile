# syntax=docker/dockerfile:1

# Multi-stage production Dockerfile for the Lets Chat API.
# Build context must be the repository root so pnpm workspace metadata is available.

# ------------------------------------------------------------------------------
# Builder stage
# ------------------------------------------------------------------------------
FROM node:22-slim AS builder

# Enable Corepack and activate the pnpm version declared in package.json.
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate && \
    apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace metadata first for a reproducible, cacheable install.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install dependencies using the frozen lockfile. This layer is cached until
# package files or the lockfile change.
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code.
COPY . .

# Build workspace packages and the API. Prisma Client is generated during the
# database package build pipeline.
RUN pnpm --filter @lets-chat/shared build && \
    pnpm --filter @lets-chat/database generate && \
    pnpm --filter @lets-chat/database build && \
    pnpm --filter api build

# Remove source maps from the production image to avoid exposing source code.
RUN find apps/api/dist -name '*.map' -type f -delete

# ------------------------------------------------------------------------------
# Runtime stage
# ------------------------------------------------------------------------------
FROM node:22-slim AS runtime

# Install dumb-init so Node runs as PID 1 and forwards SIGTERM correctly.
# OpenSSL is required by Prisma Client at runtime.
RUN apt-get update && \
    apt-get install -y --no-install-recommends dumb-init openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Copy the built artifacts, workspace package dependencies, and workspace metadata.
# pnpm installs per-package node_modules in addition to the root node_modules,
# so all three dependency trees must be copied.
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/packages/database ./packages/database
COPY --from=builder --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/packages/shared ./packages/shared
COPY --from=builder --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Remove source maps from our own build and from dependencies to avoid exposing
# source code and reduce image size. This is performed as root before dropping
# privileges.
RUN find /app -name '*.map' -type f -delete

# The application is configured entirely through environment variables. No
# secrets, .env files, or development configs are baked into the image.

# Run as the unprivileged node user provided by the base image.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/api/dist/src/main.js"]
