import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export interface DbHealthResult {
	ok: boolean;
	latencyMs?: number;
	error?: string;
}

interface DbExecutor {
	execute(query: SQL): Promise<unknown>;
}

/**
 * Probe DB connectivity with a cheap SELECT 1.
 * Accepts an executor so it can be tested without a real connection.
 */
export async function checkDbHealth(db: DbExecutor): Promise<DbHealthResult> {
	const start = Date.now();
	try {
		await db.execute(sql`SELECT 1`);
		return { ok: true, latencyMs: Date.now() - start };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
