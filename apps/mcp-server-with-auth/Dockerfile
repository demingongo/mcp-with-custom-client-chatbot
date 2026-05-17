# --- Stage 1: Dependencies ---
FROM node:lts-alpine AS deps
WORKDIR /app

# Copy root config and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy app package.json
COPY apps/mcp-server-with-auth/package.json ./apps/mcp-server-with-auth/

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm install

# --- Stage 2: Builder ---
FROM node:lts-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/apps/mcp-server-with-auth/node_modules ./apps/mcp-server-with-auth/node_modules
COPY --from=deps /app/apps/mcp-server-with-auth/package.json ./apps/mcp-server-with-auth/package.json

# Copy all source code
COPY tsconfig.base.json ./
COPY apps/mcp-server-with-auth/tsconfig.json ./apps/mcp-server-with-auth/tsconfig.json
COPY apps/mcp-server-with-auth/src ./apps/mcp-server-with-auth/src

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm --filter mcp-server-with-auth build

# --- Stage 3: Runner ---
FROM node:lts-alpine AS runner
WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/mcp-server-with-auth/node_modules ./apps/mcp-server-with-auth/node_modules
COPY --from=builder /app/apps/mcp-server-with-auth/dist ./apps/mcp-server-with-auth/dist
COPY --from=builder /app/apps/mcp-server-with-auth/package.json ./apps/mcp-server-with-auth/package.json

WORKDIR /app/apps/mcp-server-with-auth

ENV SERVER_BIND_ADDRESS=0.0.0.0
ENV PORT=3000

ENV LOG_LEVEL=info

USER node
EXPOSE 3000

ENTRYPOINT ["npm", "run", "start"]