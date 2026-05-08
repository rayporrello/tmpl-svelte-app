# ADR-027 — Website Bundle Excludes n8n

Status: Accepted, updated by ADR-031  
Date: 2026-05-08

## Decision

The website bundle excludes n8n and every other production automation runtime.

This repo may contain provider envelope builders and a local one-shot worker for
development, but production provider config and delivery are platform-owned.

## Current Shape

- Website actions write source rows and outbox rows.
- The platform fleet worker reads per-client provider config from platform
  secrets.
- n8n may be n8n.cloud, a shared self-hosted instance, or another operator-run
  workflow tool, but it is not bundled in website clones.

## Quadlet Set

The website Quadlet set is:

```ts
export const ALL_QUADLETS = ['web.container'] as const;
export const ROLLBACK_QUADLETS = ['web.container'] as const;
```

No n8n, worker, Postgres, or network Quadlet is shipped here.
