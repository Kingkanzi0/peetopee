FROM oven/bun:latest
WORKDIR /app

# Copy only the server directory — no frontend deps needed
COPY server/ ./server/

RUN mkdir -p /app/data

ENV PORT=10000
EXPOSE 10000

CMD ["bun", "run", "server/prod.ts"]
