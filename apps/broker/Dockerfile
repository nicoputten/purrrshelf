# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/broker/Dockerfile .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @purrshelf/broker... \
 && pnpm --filter @purrshelf/broker... run build \
 && pnpm --filter @purrshelf/broker deploy --prod --legacy /out

FROM node:22-bookworm-slim AS runtime
ARG BROKER_VERSION=0.0.0-dev
ENV NODE_ENV=production BROKER_VERSION=${BROKER_VERSION} PORT=8080
LABEL org.opencontainers.image.title="purrshelf-broker" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${BROKER_VERSION}"
WORKDIR /app
COPY --from=build --chown=node:node /out /app
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
