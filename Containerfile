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
# Build:  podman build -f Containerfile -t <image> .
# Run:    podman run --rm -p 3000:3000 \
#           -e ORIGIN=https://example.com \
#           -e PUBLIC_SITE_URL=https://example.com \
#           -e DATABASE_URL=postgres://user:pass@host:5432/db \
#           <image>

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

# Install dependencies first (layer cache: only re-runs when lockfile changes)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .

RUN bun run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# Non-root user for rootless operation
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app

# Re-install with --production from the locked manifest so devDeps (esbuild,
# vite, playwright, etc.) don't ship in the runtime image. esbuild is Go-built
# and pulls Trivy CRITICAL false positives even though it's never invoked at
# runtime ("bun serve.js" doesn't touch it). --frozen-lockfile keeps versions
# pinned — same versions as the builder stage used to produce build/.
#
# cookie / devalue / set-cookie-parser are listed in root dependencies so they
# survive the --production prune (they are SvelteKit runtime requirements that
# would otherwise only exist transitively via @sveltejs/kit, a devDep).
COPY --from=builder --chown=app:app /app/package.json /app/bun.lock ./
RUN bun install --production --frozen-lockfile

COPY --from=builder --chown=app:app /app/build ./build
COPY --from=builder --chown=app:app /app/serve.js ./

USER app

EXPOSE 3000

# Liveness check — mirrors the Quadlet HealthCmd
# Uses wget (available in alpine) since curl is not installed
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

# serve.js wraps build/index.js with SIGTERM/SIGINT handlers so in-flight
# requests aren't truncated on Quadlet rolling restart. Tune drain window
# with SHUTDOWN_TIMEOUT_MS (default 10000ms).
CMD ["bun", "serve.js"]
