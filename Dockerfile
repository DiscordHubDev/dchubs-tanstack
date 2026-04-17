FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG CDN_ORIGIN
ENV CDN_ORIGIN=$CDN_ORIGIN
RUN bun run build

FROM oven/bun:distroless AS runner

WORKDIR /app

COPY --from=builder /app/.output ./.output

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["./.output/server/index.mjs"]