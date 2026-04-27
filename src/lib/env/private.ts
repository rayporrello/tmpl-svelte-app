/**
 * Private (secret) environment variables.
 * Server-only — never import from client-side code or +page.svelte.
 *
 * Imports from $lib/server/env, which is enforced server-only by SvelteKit's
 * bundler — any attempt to use this module in client code will fail at build time.
 */
export { privateEnv, REQUIRED_PRIVATE_ENV_VARS } from '$lib/server/env';
export type { PrivateEnv } from '$lib/server/env';
