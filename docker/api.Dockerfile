FROM oven/bun:1-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY packages/shared/ ./shared/

COPY packages/api/package.json bun.lock ./
RUN sed -i 's|workspace:\*|file:./shared|' package.json
RUN bun install --no-save

COPY packages/api/ ./

ENV NODE_ENV=production
ENV API_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]
