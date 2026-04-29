import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the DB and logger before importing the module under test.
// vi.mock is hoisted before imports by Vitest.
vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('$lib/server/logger', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { emitLeadCreated } from '$lib/server/automation/events';
import type { LeadCreatedPayload } from '$lib/server/automation/events';

const payload: LeadCreatedPayload = {
	submissionId: 'sub-123',
	name: 'Alice',
	email: 'alice@example.com',
	sourcePath: '/contact',
	requestId: 'req-abc',
};

function makeMockDb() {
	const mockValues = vi.fn().mockResolvedValue([]);
	const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
	const mockWhere = vi.fn().mockResolvedValue([]);
	const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
	const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
	return { db: { insert: mockInsert, update: mockUpdate }, mockInsert, mockValues, mockUpdate };
}

describe('emitLeadCreated()', () => {
	beforeEach(() => {
		delete process.env.N8N_WEBHOOK_URL;
		delete process.env.N8N_WEBHOOK_SECRET;
		vi.restoreAllMocks();
	});

	afterEach(() => {
		delete process.env.N8N_WEBHOOK_URL;
		delete process.env.N8N_WEBHOOK_SECRET;
	});

	it('is a no-op when N8N_WEBHOOK_URL is not configured', async () => {
		const fetchSpy = vi.spyOn(global, 'fetch');
		await emitLeadCreated(payload);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('sends a POST to the webhook URL when configured', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

		await emitLeadCreated(payload, makeMockDb().db as never);

		expect(global.fetch).toHaveBeenCalledWith(
			'https://n8n.example.com/webhook/lead',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('includes Content-Type header', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

		await emitLeadCreated(payload, makeMockDb().db as never);

		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(init.headers['Content-Type']).toBe('application/json');
	});

	it('adds HMAC signature header when N8N_WEBHOOK_SECRET is set', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		process.env.N8N_WEBHOOK_SECRET = 'test-secret';
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

		await emitLeadCreated(payload, makeMockDb().db as never);

		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(init.headers['X-Webhook-Signature']).toMatch(/^[0-9a-f]{64}$/);
	});

	it('does not add signature header when N8N_WEBHOOK_SECRET is not set', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

		await emitLeadCreated(payload, makeMockDb().db as never);

		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(init.headers['X-Webhook-Signature']).toBeUndefined();
	});

	it('writes a dead-letter record on webhook fetch failure', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

		const { db, mockInsert, mockValues } = makeMockDb();
		await emitLeadCreated(payload, db as never);

		expect(mockInsert).toHaveBeenCalled();
		const deadLetterValues = mockValues.mock.calls.at(-1)?.[0];
		expect(deadLetterValues).toEqual(
			expect.objectContaining({ eventType: 'lead.created', eventId: expect.any(String) })
		);
		expect(deadLetterValues).not.toHaveProperty('payload');
	});

	it('writes a dead-letter record on non-ok webhook response', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

		const { db, mockInsert } = makeMockDb();
		await emitLeadCreated(payload, db as never);

		expect(mockInsert).toHaveBeenCalled();
	});

	it('resolves without throwing even when both webhook and dead-letter fail', async () => {
		process.env.N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/lead';
		vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

		const brokenDb = {
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockRejectedValue(new Error('db error')),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error('db error')),
				}),
			}),
		};

		await expect(emitLeadCreated(payload, brokenDb as never)).resolves.toBeUndefined();
	});
});
