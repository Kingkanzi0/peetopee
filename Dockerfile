FROM oven/bun:1.3.14
WORKDIR /app

# Server only — the frontend is built and hosted separately.
COPY server/package.json ./server/
RUN cd server && bun install --production
COPY server/ ./server/

RUN mkdir -p /app/data

ENV PORT=10000
EXPOSE 10000

CMD ["bun", "run", "server/prod.ts"]
