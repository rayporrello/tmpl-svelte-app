import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makePostmarkProvider } from '../../src/lib/server/forms/providers/postmark';

const originalEnv = { ...process.env };

describe('Postmark provider smoke token routing', () => {
	beforeEach(() => {
		process.env.POSTMARK_API_TEST = 'POSTMARK_TEST_TOKEN';
	});

	afterEach(() => {
		vi.restoreAllMocks();
		process.env = { ...originalEnv };
	});

	it('uses POSTMARK_API_TEST when useTestToken is true', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await makePostmarkProvider('LIVE_TOKEN').send(
			{
				to: 'to@example.com',
				from: 'from@example.com',
				subject: 'Smoke',
				text: 'Smoke body',
			},
			{ useTestToken: true }
		);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.postmarkapp.com/email',
			expect.objectContaining({
				headers: expect.objectContaining({ 'X-Postmark-Server-Token': 'POSTMARK_TEST_TOKEN' }),
			})
		);
		expect(result).toMatchObject({ provider: 'postmark', testTokenUsed: true });
	});

	it('uses the live server token by default and keeps the same endpoint', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await makePostmarkProvider('LIVE_TOKEN').send({
			to: 'to@example.com',
			from: 'from@example.com',
			subject: 'Real',
			text: 'Real body',
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.postmarkapp.com/email',
			expect.objectContaining({
				headers: expect.objectContaining({ 'X-Postmark-Server-Token': 'LIVE_TOKEN' }),
			})
		);
	});
});
