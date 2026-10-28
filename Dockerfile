# Peetopee — one container that serves the web app AND the API on the same address.

# ── 1. Build the web app ─────────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS web
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bunx vite build

# ── 2. Server dependencies ───────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS api
WORKDIR /app/server
COPY server/package.json ./
RUN bun install --production

# ── 3. Runtime ───────────────────────────────────────────────────────────────
FROM oven/bun:1.3.14
WORKDIR /app
COPY --from=api /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=web /app/dist ./dist
RUN mkdir -p /app/data

ENV PORT=10000
EXPOSE 10000
CMD ["bun", "run", "server/prod.ts"]
