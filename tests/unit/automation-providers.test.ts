import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('$lib/server/logger', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { consoleAutomationProvider } from '$lib/server/automation/providers/console';
import { emitLeadCreated } from '$lib/server/automation/events';
import { buildLeadCreatedEvent } from '$lib/server/automation/envelopes';
import {
	DEFAULT_AUTH_HEADER,
	SITE_EVENT_ID_HEADER,
	SITE_EVENT_TYPE_HEADER,
	SITE_TIMESTAMP_HEADER,
} from '$lib/server/automation/providers/http-delivery';
import { makeN8nProvider } from '$lib/server/automation/providers/n8n';
import { noopAutomationProvider } from '$lib/server/automation/providers/noop';
import {
	readAutomationProviderConfig,
	resolveAutomationProvider,
	validateAutomationProviderConfig,
} from '$lib/server/automation/providers';
import { makeWebhookProvider } from '$lib/server/automation/providers/webhook';
import { WEBHOOK_SIGNATURE_HEADER, signWebhookPayload } from '$lib/server/automation/signing';
import type { AutomationEvent } from '$lib/server/automation/automation-provider';
import type { LeadCreatedPayload } from '$lib/server/automation/events';

const envKeys = [
	'AUTOMATION_PROVIDER',
	'AUTOMATION_WEBHOOK_URL',
	'AUTOMATION_WEBHOOK_SECRET',
	'AUTOMATION_WEBHOOK_AUTH_MODE',
	'AUTOMATION_WEBHOOK_AUTH_HEADER',
	'N8N_WEBHOOK_URL',
	'N8N_WEBHOOK_SECRET',
	'N8N_WEBHOOK_AUTH_MODE',
	'N8N_WEBHOOK_AUTH_HEADER',
];

const event: AutomationEvent<'lead.created'> = {
	event: 'lead.created',
	version: 1,
	occurred_at: '2026-04-29T12:00:00.000Z',
	data: {
		submission_id: 'sub-123',
		name: 'Alice',
		email: 'alice@example.com',
		source_path: '/contact',
		request_id: 'req-abc',
	},
};

const leadPayload: LeadCreatedPayload = {
	submissionId: 'sub-123',
	name: 'Alice',
	email: 'alice@example.com',
	sourcePath: '/contact',
	requestId: 'req-abc',
};

function resetAutomationEnv() {
	for (const key of envKeys) delete process.env[key];
}

function makeMockDb() {
	const mockOnConflictDoNothing = vi.fn().mockResolvedValue([]);
	const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
	const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
	return { db: { insert: mockInsert }, mockInsert, mockValues, mockOnConflictDoNothing };
}

function readFetchInit(
	callIndex = 0
): RequestInit & { headers: Record<string, string>; body: string } {
	return (global.fetch as ReturnType<typeof vi.fn>).mock.calls[callIndex][1];
}

describe('automation providers', () => {
	beforeEach(() => {
		resetAutomationEnv();
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	afterEach(() => {
		resetAutomationEnv();
		vi.useRealTimers();
	});

	it('defaults to the n8n provider when AUTOMATION_PROVIDER is unset', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);

		await resolveAutomationProvider().send(event);

		expect(global.fetch).toHaveBeenCalledWith(
			'https://n8n.example.com/webhook/lead',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('throws a clear error for an unknown AUTOMATION_PROVIDER value', () => {
		process.env.AUTOMATION_PROVIDER = 'not-real';

		expect(() => resolveAutomationProvider()).toThrow(
			/Invalid AUTOMATION_PROVIDER "not-real".*n8n, webhook, console, noop/
		);
	});

	it('sends the same envelope through every provider without mutation', async () => {
		const originalEnvelope = JSON.stringify(event);
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 202 } as Response);

		const n8nResult = await makeN8nProvider('https://receiver.example.com/hook', 'secret').send(
			event
		);
		const webhookResult = await makeWebhookProvider(
			'https://receiver.example.com/hook',
			'secret'
		).send(event);
		const consoleResult = await consoleAutomationProvider.send(event);
		const noopResult = await noopAutomationProvider.send(event);

		const n8nInit = readFetchInit(0);
		const webhookInit = readFetchInit(1);

		expect(n8nResult).toEqual({ ok: true, provider: 'n8n', delivered: true, status: 202 });
		expect(webhookResult).toEqual({ ok: true, provider: 'webhook', delivered: true, status: 202 });
		expect(consoleResult).toEqual({ ok: true, provider: 'console', delivered: true });
		expect(noopResult).toEqual({
			ok: true,
			provider: 'noop',
			delivered: false,
			skipped: true,
			reason: 'disabled',
		});

		expect(n8nInit.body).toBe(originalEnvelope);
		expect(webhookInit.body).toBe(originalEnvelope);
		expect(webhookInit.body).toBe(n8nInit.body);
		expect(JSON.stringify(event)).toBe(originalEnvelope);
	});

	it('defaults to header auth and sends the secret as X-Site-Auth, not HMAC', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);

		await makeN8nProvider('https://receiver.example.com/hook', 'shared-secret').send(event);
		const init = readFetchInit(0);

		expect(init.headers[DEFAULT_AUTH_HEADER]).toBe('shared-secret');
		expect(init.headers[WEBHOOK_SIGNATURE_HEADER]).toBeUndefined();
	});

	it('uses a custom header name when authHeader is provided', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);

		await makeN8nProvider('https://receiver.example.com/hook', 'shared-secret', {
			authMode: 'header',
			authHeader: 'X-Custom-Auth',
		}).send(event);
		const init = readFetchInit(0);

		expect(init.headers['X-Custom-Auth']).toBe('shared-secret');
		expect(init.headers[DEFAULT_AUTH_HEADER]).toBeUndefined();
	});

	it('signs the body with HMAC when authMode is set to hmac', async () => {
		const originalEnvelope = JSON.stringify(event);
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);

		await makeN8nProvider('https://receiver.example.com/hook', 'shared-secret', {
			authMode: 'hmac',
		}).send(event);
		const init = readFetchInit(0);

		expect(init.headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
			signWebhookPayload(originalEnvelope, 'shared-secret')
		);
		expect(init.headers[DEFAULT_AUTH_HEADER]).toBeUndefined();
	});

	it('always sends observability headers (event id, type, timestamp)', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);

		const eventWithKey: AutomationEvent<'lead.created'> = {
			...event,
			idempotency_key: 'lead.created:sub-123',
		};
		await makeN8nProvider('https://receiver.example.com/hook', 'shared-secret').send(eventWithKey);
		const init = readFetchInit(0);

		expect(init.headers[SITE_EVENT_ID_HEADER]).toBe('lead.created:sub-123');
		expect(init.headers[SITE_EVENT_TYPE_HEADER]).toBe('lead.created');
		expect(init.headers[SITE_TIMESTAMP_HEADER]).toBe(eventWithKey.occurred_at);
	});

	it('maps missing HTTP provider config to not_configured', async () => {
		await expect(makeN8nProvider('', 'secret').send(event)).resolves.toEqual({
			ok: true,
			provider: 'n8n',
			delivered: false,
			skipped: true,
			reason: 'not_configured',
		});
		await expect(makeWebhookProvider(undefined, 'secret').send(event)).resolves.toEqual({
			ok: true,
			provider: 'webhook',
			delivered: false,
			skipped: true,
			reason: 'not_configured',
		});
	});

	it('maps malformed HTTP provider config to configuration failure', async () => {
		await expect(makeWebhookProvider('not a url', 'secret').send(event)).resolves.toEqual(
			expect.objectContaining({
				ok: false,
				provider: 'webhook',
				failure: 'configuration',
			})
		);
	});

	it('maps non-2xx HTTP responses to http failure', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

		await expect(
			makeWebhookProvider('https://receiver.example.com/hook').send(event)
		).resolves.toEqual({
			ok: false,
			provider: 'webhook',
			failure: 'http',
			error: 'HTTP 503',
			status: 503,
		});
	});

	it('maps rejected fetches to network failure', async () => {
		vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

		await expect(
			makeWebhookProvider('https://receiver.example.com/hook').send(event)
		).resolves.toEqual({
			ok: false,
			provider: 'webhook',
			failure: 'network',
			error: 'Error: ECONNREFUSED',
		});
	});

	describe('validateAutomationProviderConfig', () => {
		it('flags missing URL and secret for n8n provider', () => {
			const config = readAutomationProviderConfig({} as NodeJS.ProcessEnv);
			const problems = validateAutomationProviderConfig(config);

			expect(config.provider).toBe('n8n');
			const fields = problems.map((p) => p.field);
			expect(fields).toContain('N8N_WEBHOOK_URL');
			expect(fields).toContain('N8N_WEBHOOK_SECRET');
		});

		it('flags non-HTTPS n8n URL', () => {
			const config = readAutomationProviderConfig({
				AUTOMATION_PROVIDER: 'n8n',
				N8N_WEBHOOK_URL: 'http://insecure.example/webhook',
				N8N_WEBHOOK_SECRET: 'secret',
			} as unknown as NodeJS.ProcessEnv);
			const problems = validateAutomationProviderConfig(config);

			expect(problems).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						field: 'N8N_WEBHOOK_URL',
						message: expect.stringMatching(/https:/u),
					}),
				])
			);
		});

		it('rejects console provider in production by default', () => {
			const config = readAutomationProviderConfig({
				AUTOMATION_PROVIDER: 'console',
			} as unknown as NodeJS.ProcessEnv);
			const problems = validateAutomationProviderConfig(config);

			expect(problems).toEqual(
				expect.arrayContaining([expect.objectContaining({ field: 'AUTOMATION_PROVIDER' })])
			);
		});

		it('allows console provider when explicitly opted in (worker dev mode)', () => {
			const config = readAutomationProviderConfig({
				AUTOMATION_PROVIDER: 'console',
			} as unknown as NodeJS.ProcessEnv);
			const problems = validateAutomationProviderConfig(config, { allowConsoleProvider: true });

			expect(problems).toEqual([]);
		});

		it('passes for explicit noop with no other config', () => {
			const config = readAutomationProviderConfig({
				AUTOMATION_PROVIDER: 'noop',
			} as unknown as NodeJS.ProcessEnv);
			const problems = validateAutomationProviderConfig(config);

			expect(problems).toEqual([]);
		});

		it('passes for fully configured n8n header auth', () => {
			const config = readAutomationProviderConfig({
				AUTOMATION_PROVIDER: 'n8n',
				N8N_WEBHOOK_URL: 'https://n8n.example/webhook/lead',
				N8N_WEBHOOK_SECRET: 'shared-secret',
			} as unknown as NodeJS.ProcessEnv);
			const problems = validateAutomationProviderConfig(config);

			expect(config.provider).toBe('n8n');
			if (config.provider === 'n8n') {
				expect(config.authMode).toBe('header');
				expect(config.authHeader).toBe(DEFAULT_AUTH_HEADER);
			}
			expect(problems).toEqual([]);
		});
	});

	it('maps aborted fetches to timeout failure', async () => {
		vi.useFakeTimers();
		vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
			return new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					const err = new Error('aborted');
					err.name = 'AbortError';
					reject(err);
				});
			});
		});

		const result = makeWebhookProvider('https://receiver.example.com/hook').send(event);
		await vi.advanceTimersByTimeAsync(5000);

		await expect(result).resolves.toEqual({
			ok: false,
			provider: 'webhook',
			failure: 'timeout',
			error: 'AbortError: aborted',
		});
	});
});

describe('automation outbox', () => {
	beforeEach(() => {
		resetAutomationEnv();
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	afterEach(() => {
		resetAutomationEnv();
	});

	it('enqueues a minimized lead.created payload without provider delivery', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 202 } as Response);
		const { db, mockValues, mockOnConflictDoNothing } = makeMockDb();

		await emitLeadCreated(leadPayload, db as never);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: 'lead.created',
				status: 'pending',
				attemptCount: 0,
				maxAttempts: 5,
				idempotencyKey: 'lead.created:sub-123',
				payload: {
					submission_id: 'sub-123',
					source_path: '/contact',
					request_id: 'req-abc',
				},
			})
		);
		expect(mockValues.mock.calls[0][0].payload).not.toHaveProperty('name');
		expect(mockValues.mock.calls[0][0].payload).not.toHaveProperty('email');
		expect(mockOnConflictDoNothing).toHaveBeenCalled();
	});

	it('builds the provider envelope at worker time from source data', () => {
		const envelope = buildLeadCreatedEvent({
			createdAt: '2026-04-29T12:00:00.000Z',
			idempotencyKey: 'lead.created:sub-123',
			payload: {
				submission_id: 'sub-123',
				source_path: '/contact',
				request_id: 'req-abc',
			},
			contact: {
				name: 'Alice',
				email: 'alice@example.com',
			},
		});

		expect(envelope).toEqual({
			event: 'lead.created',
			version: 1,
			occurred_at: '2026-04-29T12:00:00.000Z',
			idempotency_key: 'lead.created:sub-123',
			data: {
				submission_id: 'sub-123',
				name: 'Alice',
				email: 'alice@example.com',
				source_path: '/contact',
				request_id: 'req-abc',
			},
		});
	});
});
