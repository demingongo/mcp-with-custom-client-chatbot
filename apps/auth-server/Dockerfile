# --- Stage 1: Dependencies ---
FROM node:lts-alpine AS deps
WORKDIR /app

# Copy root config and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy app package.json
COPY apps/auth-server/package.json ./apps/auth-server/

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm install

# --- Stage 2: Builder ---
FROM node:lts-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/apps/auth-server/node_modules ./apps/auth-server/node_modules
COPY --from=deps /app/apps/auth-server/package.json ./apps/auth-server/package.json

# Copy all source code
COPY tsconfig.base.json ./
COPY apps/auth-server/tsconfig.json ./apps/auth-server/tsconfig.json
COPY apps/auth-server/src ./apps/auth-server/src

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm --filter auth-server build

# --- Stage 3: Runner ---
FROM node:lts-alpine AS runner
WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/auth-server/node_modules ./apps/auth-server/node_modules
COPY --from=builder /app/apps/auth-server/dist ./apps/auth-server/dist
COPY --from=builder /app/apps/auth-server/package.json ./apps/auth-server/package.json

COPY apps/auth-server/views ./apps/auth-server/views

WORKDIR /app/apps/auth-server

ENV SERVER_BIND_ADDRESS=0.0.0.0
ENV PORT=3000

ENV LOG_LEVEL=info

USER node
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]