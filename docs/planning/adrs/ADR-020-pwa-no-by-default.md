# ADR-020 — PWA / Service Worker: Not a Default

**Status:** Accepted  
**Date:** 2026-04-28

---

## Context

SvelteKit has first-class service worker support via `src/service-worker.ts`. A service worker can enable offline capability, background sync, and push notifications — capabilities associated with Progressive Web Apps (PWAs).

The template already ships:

- `static/site.webmanifest` — app name, icons, display mode, `theme-color`
- `static/favicon.svg`, `static/favicon-32.png`, `static/apple-touch-icon.png` — standard icon set
- `theme-color` meta tag in `src/app.html`

These satisfy the basic installability prerequisites without a service worker. The question is whether a service worker should be included by default.

---

## Decision

**No service worker by default.**

The web manifest, icons, and `theme-color` remain in the template. A service worker is added only when a specific project requires offline capability and has a documented cache strategy.

---

## Reasons

### 1. Cache complexity is not free

A service worker introduces a caching layer between the browser and the server. This layer must be deliberately designed:

- **Stale content risk.** Users on slow connections may see cached content that is days or weeks old. Marketing sites with time-sensitive content (prices, offers, events, hero images) are especially vulnerable. A site that looks "live" but serves stale prices is worse than no cache.
- **Cache invalidation UX.** When a new version ships, users with an installed service worker do not automatically receive it. The browser must download a new worker, check if it differs, and activate it on the next load or after a forced reload. This requires an update prompt or forced-reload UX to be designed and QA'd.
- **Debugging overhead.** The service worker lifecycle (install → waiting → activate → fetch intercept) is unintuitive. Hard-to-reproduce bugs that only affect certain users on certain networks are a real cost.

### 2. Small websites do not need offline capability

The primary use cases for this template are marketing sites, content sites, landing pages, and product marketing sites. These are:

- Visited from a search result or a shared link — always online at first access
- Not expected to work when the device has no connectivity
- Not used daily from a home screen icon in regular practice

A user who visits a marketing site while offline has no action to take. Offline capability does not add value for this audience.

### 3. The manifest without a service worker is not broken

Browsers treat the web manifest as advisory. A site with a manifest but no service worker is not installable as a PWA — it simply does not offer home-screen installation. For most marketing sites, this is the correct behavior. The manifest is kept because it provides `theme-color`, `display`, and the icon declarations that browsers use for tab presentation.

### 4. Per-project activation is low friction

SvelteKit's service worker support is a single well-documented file (`src/service-worker.ts`). Adding it when a project genuinely needs it is a deliberate, one-afternoon decision. Including it in the base template adds maintenance cost to every project that does not need it.

---

## When to add a service worker (per project)

Add a service worker when **all** of the following are true for a specific project:

1. The project is an app-like experience where offline or installable behavior delivers real user value (e.g., a tool used daily, a field app with unreliable connectivity, a high-return-rate dashboard).
2. A cache strategy is defined: what is cached, for how long, and how stale content is surfaced.
3. An update UX is designed: how users learn that a new version is available and how to get it.
4. QA covers stale-content scenarios, especially for content that changes frequently.

**Good fits:** progressive web apps, dashboards, field tools, installable utilities.  
**Poor fits:** marketing sites, landing pages, content blogs, documentation sites, product marketing pages.

---

## Activation (when a project requires it)

1. Create `src/service-worker.ts` — SvelteKit auto-registers it on build.
2. Choose a cache strategy. Common options:
   - **Stale-while-revalidate** — good for content/images (serve from cache, refresh in background)
   - **Network-first** — good for API/dynamic data (try network, fall back to cache)
   - **Cache-first** — good for static assets with long lifetimes (fonts, versioned JS/CSS)
3. Use SvelteKit's `$service-worker` module for the build asset manifest.
4. Add an update detection + prompt component (listen for the `controllerchange` event).
5. Test offline behavior with Chrome DevTools → Application → Service Workers → check "Offline".
6. Test the update flow: deploy a change, verify the update prompt appears, verify users receive the new version.

See: [kit.svelte.dev/docs/service-workers](https://kit.svelte.dev/docs/service-workers)

---

## Consequences

- Every site built from this template has manifest + icons ready without cache risk.
- Projects that need offline capability add `src/service-worker.ts` per project, with an explicit cache strategy.
- The `bun run validate` pipeline does not need to account for service worker behavior.
- The template does not ship a `src/service-worker.ts` file — the absence is intentional.

---

## Revisit Triggers

- If a majority of projects spawned from this template need offline capability, reconsider adding a conservative default worker (static assets only, stale-while-revalidate for content).
- If SvelteKit ships built-in safe cache defaults that remove the design burden, reconsider.
- If the template's primary use case shifts from marketing/content sites to app-like tools, reconsider.
