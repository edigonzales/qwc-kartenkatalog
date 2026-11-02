# Compile platform-independent web assets natively; only the runtime targets each platform.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build:remote

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
ARG VERSION=local
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/edigonzales/qwc-kartenkatalog" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="MIT AND BSD-2-Clause"
ENV NODE_ENV=production PORT=8080 CATALOG_API_ORIGIN=http://kartenkatalog:8080
WORKDIR /app
COPY --from=build --chown=node:node /build/prod/ ./prod/
COPY --chown=node:node frontend/server/server.cjs frontend/server/remote.cjs ./server/
COPY LICENSE ./LICENSE
COPY frontend/LICENSE ./LICENSE.qwc
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/server.cjs"]
