import { describe, expect, it, vi } from 'vitest';

describe('/healthz route', () => {
	it('returns process liveness when not draining', async () => {
		vi.resetModules();
		const { GET } = await import('../../src/routes/healthz/+server');

		const response = await GET({} as never);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(response.headers.get('connection')).toBeNull();
		expect(body).toMatchObject({
			ok: true,
			service: 'tmpl-svelte-app',
		});
		expect(body).not.toHaveProperty('draining');
	});

	it('fails closed while draining', async () => {
		vi.resetModules();
		const lifecycle = await import('../../src/lib/server/lifecycle');
		const { GET } = await import('../../src/routes/healthz/+server');

		lifecycle.markShuttingDown();
		const response = await GET({} as never);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(503);
		expect(response.headers.get('connection')).toBe('close');
		expect(body).toMatchObject({
			ok: false,
			draining: true,
			service: 'tmpl-svelte-app',
		});
	});
});
