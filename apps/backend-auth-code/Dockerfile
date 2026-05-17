# --- Stage 1: Dependencies ---
FROM node:lts-alpine AS deps
WORKDIR /app

# Copy root config and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy app package.json
COPY apps/backend-auth-code/package.json ./apps/backend-auth-code/

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm install

# --- Stage 2: Builder ---
FROM node:lts-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/apps/backend-auth-code/node_modules ./apps/backend-auth-code/node_modules
COPY --from=deps /app/apps/backend-auth-code/package.json ./apps/backend-auth-code/package.json

# Copy all source code
COPY tsconfig.base.json ./
COPY apps/backend-auth-code/tsconfig.json ./apps/backend-auth-code/tsconfig.json
COPY apps/backend-auth-code/src ./apps/backend-auth-code/src

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm --filter backend-auth-code build

# --- Stage 3: Runner ---
FROM node:lts-alpine AS runner
WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend-auth-code/node_modules ./apps/backend-auth-code/node_modules
COPY --from=builder /app/apps/backend-auth-code/dist ./apps/backend-auth-code/dist
COPY --from=builder /app/apps/backend-auth-code/package.json ./apps/backend-auth-code/package.json

WORKDIR /app/apps/backend-auth-code

ENV SERVER_BIND_ADDRESS=0.0.0.0
ENV PORT=3000

ENV LOG_LEVEL=info

USER node
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]