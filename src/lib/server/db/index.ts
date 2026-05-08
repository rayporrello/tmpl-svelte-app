import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function readPositiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

// DATABASE_URL is validated by initEnv() in hooks.server.ts before any route
// handler runs. This module is only imported when a route that needs the DB
// is first accessed, so the env var is guaranteed to be set by then.
const client = postgres(process.env.DATABASE_URL!, {
	max: readPositiveIntegerEnv('DATABASE_POOL_MAX', 5),
	idle_timeout: 30,
	connect_timeout: 10,
	onnotice: () => undefined,
	connection: {
		statement_timeout: readPositiveIntegerEnv('DATABASE_STATEMENT_TIMEOUT_MS', 5000),
	},
});

export const db = drizzle(client, { schema });
