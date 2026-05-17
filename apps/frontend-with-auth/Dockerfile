# --- Stage 1: Dependencies ---
FROM node:lts-alpine AS deps
WORKDIR /app

# Copy root config and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy app package.json
COPY apps/frontend-with-auth/package.json ./apps/frontend-with-auth/

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm install

# --- Stage 2: Builder ---
FROM node:lts-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/apps/frontend-with-auth/node_modules ./apps/frontend-with-auth/node_modules
COPY --from=deps /app/apps/frontend-with-auth/package.json ./apps/frontend-with-auth/package.json

# Copy all source code
COPY tsconfig.base.json ./
COPY apps/frontend-with-auth/tsconfig.json ./apps/frontend-with-auth/tsconfig.json
COPY apps/frontend-with-auth/src ./apps/frontend-with-auth/src

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm --filter frontend-with-auth build

# --- Stage 3: Runner ---
FROM node:lts-alpine AS runner
WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/frontend-with-auth/node_modules ./apps/frontend-with-auth/node_modules
COPY --from=builder /app/apps/frontend-with-auth/dist ./apps/frontend-with-auth/dist
COPY --from=builder /app/apps/frontend-with-auth/package.json ./apps/frontend-with-auth/package.json

COPY apps/frontend-with-auth/public ./apps/frontend-with-auth/public

WORKDIR /app/apps/frontend-with-auth

ENV SERVER_BIND_ADDRESS=0.0.0.0
ENV PORT=8080

USER node
EXPOSE 8080

ENTRYPOINT ["npm", "run", "start"]