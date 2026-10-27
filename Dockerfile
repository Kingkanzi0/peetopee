FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.1-alpine
WORKDIR /app

# Copy built frontend
COPY --from=builder /app/dist ./dist
# Copy server source
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Hugging Face Spaces run as user 1000
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data
USER 1000

ENV PORT=7860
ENV DB_PATH=/app/data/peetopee.db

EXPOSE 7860

# Start API server on 7860; also serve the built frontend as static files
CMD ["bun", "run", "server/prod.ts"]
