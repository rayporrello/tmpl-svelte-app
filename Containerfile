# Containerfile — SvelteKit + svelte-adapter-bun production image
#
# Multi-stage build:
#   Stage 1 (builder): installs deps, builds the app
#   Stage 2 (runtime): lean image with only the built output
#
# Environment variable contract (ADR-018):
#   PORT              — port to listen on (default: 3000)
#   HOST              — bind address (default: 0.0.0.0; use 127.0.0.1 behind a proxy)
#   ORIGIN            — full origin URL, e.g. https://example.com (REQUIRED)
#   ADDRESS_HEADER    — header to read client IP from behind a proxy (e.g. True-Client-IP)
#   XFF_DEPTH         — number of trusted proxies for X-Forwarded-For (default: 1)
#   PROTOCOL_HEADER   — alternative to ORIGIN; read protocol from header (e.g. x-forwarded-proto)
#   HOST_HEADER       — alternative to ORIGIN; read host from header (e.g. x-forwarded-host)
#
# Note: BODY_SIZE_LIMIT is NOT supported by svelte-adapter-bun v0.5.2.
#       Handle body size limits at the Caddy layer if required.
#
# Build:  podman build --format docker -f Containerfile -t <image> .
# Run:    podman run --rm -p 127.0.0.1:3000:3000 \
#           -e ORIGIN=https://example.com \
#           -e PUBLIC_SITE_URL=https://example.com \
#           -e DATABASE_URL=postgres://project_app_user:pass@project-postgres:5432/project_app \
#           <image>

ARG BUN_VERSION=1.3.13

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

# Install dependencies first (layer cache: only re-runs when lockfile or the
# local package-manager guard changes)
COPY package.json bun.lock ./
COPY scripts/ensure-bun.ts ./scripts/ensure-bun.ts
COPY scripts/vendor-sveltia.ts ./scripts/vendor-sveltia.ts
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .

RUN bun run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
# IN_CONTAINER lets the app reject DATABASE_URL pointing at 127.0.0.1/localhost
# at boot — containers must reach Postgres via the container hostname (e.g.
# <project>-postgres). DATABASE_DIRECT_URL stays loopback for host-side tooling.
ENV IN_CONTAINER=1

# Non-root user for rootless operation
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app

# Install only production dependencies in the runtime image. Omit optional
# adapter ecosystems and peer build tooling that are not imported by this
# template's generated server. The adapter output reads Git-backed content from
# process.cwd()/content at runtime, so copy that directory explicitly alongside
# build output.
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts --omit optional --omit peer

COPY --from=builder --chown=app:app /app/build ./build
COPY --from=builder --chown=app:app /app/content ./content
COPY --from=builder --chown=app:app /app/serve.js ./

USER app

EXPOSE 3000

# Liveness check — mirrors the Quadlet HealthCmd
# Uses wget (available in alpine) since curl is not installed
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

# serve.js wraps build/index.js with SIGTERM/SIGINT handlers so in-flight
# requests aren't truncated on Quadlet rolling restart. Tune drain window
# with SHUTDOWN_TIMEOUT_MS (default 8000ms).
CMD ["bun", "serve.js"]
