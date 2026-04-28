import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { checkDbHealth } from '$lib/server/db/health';

/**
 * /readyz — app is ready to serve real traffic (all dependencies reachable).
 *
 * Contrast with /healthz:
 *   /healthz — the app process is running (no external checks)
 *   /readyz  — the app and its dependencies (Postgres) are reachable
 *
 * Returns 200 when healthy, 503 when any dependency is unavailable.
 * Caddy health_uri should point to /healthz; /readyz is for orchestration.
 */
export const GET: RequestHandler = async () => {
	const database = await checkDbHealth(db);

	const ok = database.ok;
	const body = {
		ok,
		checks: { database },
		time: new Date().toISOString(),
	};

	return json(body, { status: ok ? 200 : 503 });
};
