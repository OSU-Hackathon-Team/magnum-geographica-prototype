FROM oven/bun:1-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY packages/api/package.json packages/api/bun.lock* ./
COPY packages/shared/package.json ../shared/
RUN bun install --no-save

COPY packages/api/ ./
COPY packages/shared/ ../shared/

ENV NODE_ENV=production
ENV API_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]
