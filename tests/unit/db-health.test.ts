import { describe, it, expect } from 'vitest';
import { checkDbHealth } from '$lib/server/db/health';

const makeDb = (executeFn: () => Promise<unknown>) => ({ execute: executeFn });

describe('checkDbHealth()', () => {
	it('returns ok: true with latencyMs when the query succeeds', async () => {
		const db = makeDb(() => Promise.resolve([{ '?column?': 1 }]));
		const result = await checkDbHealth(db);
		expect(result.ok).toBe(true);
		expect(typeof result.latencyMs).toBe('number');
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.error).toBeUndefined();
	});

	it('returns ok: false with error string when the query throws', async () => {
		const db = makeDb(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5432')));
		const result = await checkDbHealth(db);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/ECONNREFUSED/);
		expect(result.latencyMs).toBeUndefined();
	});

	it('captures non-Error thrown values as string', async () => {
		const db = makeDb(() => Promise.reject('timeout'));
		const result = await checkDbHealth(db);
		expect(result.ok).toBe(false);
		expect(result.error).toBe('timeout');
	});
});
