/**
 * Public (non-secret) environment variables.
 * Safe to import from any server-side code: +page.server.ts, API routes, hooks.
 *
 * Do NOT import from +page.svelte or any client-side module — this module
 * re-exports from $lib/server/env which is server-only.
 */
export { publicEnv, REQUIRED_PUBLIC_ENV_VARS } from '$lib/server/env';
export type { PublicEnv } from '$lib/server/env';
