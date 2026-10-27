FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.1-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create data dir — works without a mounted disk too
RUN mkdir -p /app/data

ENV PORT=10000

EXPOSE 10000

CMD ["bun", "run", "server/prod.ts"]
