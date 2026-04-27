# ADR-019 — Security Headers and CSP Baseline

**Status:** Accepted  
**Date:** 2026-04-27  
**Batch:** B

---

## Context

Batch A (ADR-018) established four cheap security headers inline in `src/hooks.server.ts`:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

CSP was explicitly deferred to Batch B to keep A1 scope tight and because CSP requires per-site configuration (analytics hosts, form-action endpoints, external CDNs). This ADR records the CSP decisions and the app-vs-edge ownership split.

---

## Decision

### App vs edge header ownership

| Header | Owner | Reason |
|--------|-------|--------|
| `Content-Security-Policy` | **App** (`hooks.server.ts`) | Per-route variation; needs access to `site.ts` config |
| `X-Content-Type-Options` | **App** | Set in A1; cheap, always appropriate |
| `Referrer-Policy` | **App** | Set in A1 |
| `X-Frame-Options` | **App** | Set in A1 |
| `Permissions-Policy` | **App** | Set in A1 |
| `Strict-Transport-Security` | **Edge (Caddy)** | Requires TLS to be meaningful; set in `Caddyfile.example` |
| Compression (`gzip`, `zstd`) | **Edge (Caddy)** | Caddy handles it; do not duplicate in app |
| Access logs | **Edge (Caddy)** | Journald via Caddy stdout |

The `deploy/Caddyfile.example` comment echoes this: "Caddy owns TLS, HSTS, compression, access logging. The app owns CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy."

### CSP module

`src/lib/server/csp.ts` builds the CSP string from `site.ts` config and the request URL. It is called from `hooks.server.ts` inside the existing `handle` function. **No `sequence()` is introduced** — CSP is set inline alongside the other headers after `resolve()`.

This is the intentional `sequence()` evaluation point from ADR-018 §8. Because CSP fits cleanly inline, `sequence()` is not needed for the base template. Projects that add auth middleware, logging middleware, or other independent handler concerns may introduce `sequence()` at that time.

### Default CSP directives

```
default-src 'self';
img-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'self';
frame-ancestors 'none';
form-action 'self';
base-uri 'self'
```

**`style-src 'unsafe-inline'`** — Required because SvelteKit injects component styles as inline style attributes in SSR output. A nonce upgrade is deferred to Phase 5.

**`frame-ancestors 'none'`** — More robust than `X-Frame-Options: DENY` (applies in more contexts). Both are set; redundancy is intentional.

### `/admin` route CSP override

The CMS admin page (`/admin`) loads Sveltia CMS from `https://unpkg.com`:

```html
<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
```

The default `script-src 'self'` would block this. `csp.ts` detects requests to `/admin` and applies a more permissive policy:

```
script-src 'self' https://unpkg.com 'unsafe-inline' 'unsafe-eval';
connect-src 'self' https://api.github.com https://unpkg.com;
```

This is acceptable because:
- `/admin` is protected by GitHub OAuth (Sveltia CMS backend)
- The admin is not indexed (`noindex`) and not reachable by unauthenticated users in production
- `'unsafe-inline'` and `'unsafe-eval'` are scoped to `/admin` only, not the public-facing site

**Sveltia CDN origin confirmed:** `https://unpkg.com`. Source: `static/admin/index.html` in this repo and Sveltia CMS documentation.

### Extension points

When a project adds a feature that requires wider CSP, extend `csp.ts` at these documented points:

| Feature | Directive | Example value |
|---------|-----------|---------------|
| Analytics (Plausible) | `connect-src`, `script-src` | `https://plausible.io` |
| Analytics (Umami) | `connect-src`, `script-src` | `https://cloud.umami.is` |
| External fonts (self-hosted CDN) | `font-src` | `https://cdn.example.com` |
| CMS media CDN | `img-src` | `https://cdn.example.com` |
| External image CDN | `img-src` | `https://images.example.com` |
| Email form action (Postmark, etc.) | `form-action` | `https://api.postmarkapp.com` |
| n8n webhook endpoint | `connect-src` | `https://n8n.example.com` |
| Embedded videos (YouTube) | `frame-src` | `https://www.youtube.com` |

Extension is intentionally a code change, not a config value — it makes the CSP surface visible in version control rather than buried in environment variables.

---

## Consequences

### Positive

- Public-facing pages have a meaningful CSP from first deploy.
- The admin page works without CSP violations (Sveltia CMS loaded from unpkg is explicitly allowed).
- `style-src 'unsafe-inline'` is a known limitation — the code comment explains why and the nonce upgrade path.
- Extension points are documented; future projects know exactly which directive to widen.

### Accepted tradeoffs

- `'unsafe-inline'` in `style-src` is necessary for SvelteKit SSR. Removing it requires nonce injection, which is a non-trivial change deferred to Phase 5.
- `/admin` CSP is more permissive. This is a deliberate per-route exception, not a blanket weakening.
- CSP report-uri / report-to is not wired — reporting infrastructure is per-project and out of scope for the base template.

---

## Alternatives considered

### `sequence()` introduction for CSP

Rejected for the base template. Adding `sequence()` to compose `requestIdHandle → cspHandle → safeErrorHandle` would be appropriate if:
- CSP needed separate lifecycle (e.g., reading from a database per request)
- A logging handler with its own state was added
- Auth middleware needed to run as an independent concern

For the current use case (setting a header inline after `resolve()`), `sequence()` adds ceremony without benefit. The evaluation point is recorded; future batches may introduce it.

### Caddy-owned CSP

Rejected. CSP needs access to site config (analytics host, CMS CDN, form endpoints), which lives in the app. Caddy cannot vary the CSP per route without complex middleware. App ownership is correct.

### Static CSP string

Rejected. A hard-coded string in `hooks.server.ts` would be opaque and hard to audit. `csp.ts` provides a clear, structured function with per-directive comments.
