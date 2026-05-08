FROM docker.io/node:lts-alpine AS builder
WORKDIR /app

COPY src ./src
COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

RUN npm install

RUN npm run build

FROM docker.io/node:lts-alpine AS runner
WORKDIR /app

ENV PORT=3000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

RUN npm install --omit=dev

EXPOSE 3000
CMD [ "npm", "start" ]
