/**
 * No-op analytics provider — the default server analytics backend.
 *
 * Does nothing. Safe, free, and correct for the base template. Swap this for a
 * real provider (see ga4-measurement-protocol.example.ts) when a project requires
 * server-side conversion tracking.
 *
 * See docs/analytics/server-conversions.md.
 */

import type { ServerAnalyticsProvider } from './types';

export const noopProvider: ServerAnalyticsProvider = {
	async emit(): Promise<void> {
		// Intentionally empty — no-op until a real provider is configured.
	},
};
