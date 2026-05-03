import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('$lib/server/logger', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { consoleAutomationProvider } from '$lib/server/automation/providers/console';
import { emitLeadCreated } from '$lib/server/automation/events';
import { buildLeadCreatedEvent } from '$lib/server/automation/envelopes';
import { makeN8nProvider } from '$lib/server/automation/providers/n8n';
import { noopAutomationProvider } from '$lib/server/automation/providers/noop';
import { resolveAutomationProvider } from '$lib/server/automation/providers';
import { makeWebhookProvider } from '$lib/server/automation/providers/webhook';
import { WEBHOOK_SIGNATURE_HEADER, signWebhookPayload } from '$lib/server/automation/signing';
import type { AutomationEvent } from '$lib/server/automation/automation-provider';
import type { LeadCreatedPayload } from '$lib/server/automation/events';

const envKeys = [
	'AUTOMATION_PROVIDER',
	'AUTOMATION_WEBHOOK_URL',
	'AUTOMATION_WEBHOOK_SECRET',
	'N8N_WEBHOOK_URL',
	'N8N_WEBHOOK_SECRET',
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
		expect(n8nInit.headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
			signWebhookPayload(originalEnvelope, 'secret')
		);
		expect(webhookInit.headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
			n8nInit.headers[WEBHOOK_SIGNATURE_HEADER]
		);
		expect(JSON.stringify(event)).toBe(originalEnvelope);
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
