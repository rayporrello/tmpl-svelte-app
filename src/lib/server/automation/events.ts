import { eq } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import { automationDeadLetters, automationEvents } from '$lib/server/db/schema';
import { logger } from '$lib/server/logger';
import { signWebhookPayload } from './signing';

export interface LeadCreatedPayload {
	submissionId: string;
	name: string;
	email: string;
	sourcePath?: string | null;
	requestId?: string | null;
}

interface AutomationEvent {
	id: string;
	type: 'lead.created';
	createdAt: string;
	payload: LeadCreatedPayload;
}

interface StoredLeadCreatedPayload {
	submissionId: string;
	sourcePath?: string | null;
	requestId?: string | null;
}

// How long to wait for the n8n webhook before aborting. A timeout prevents a
// slow or unreachable n8n instance from holding up the caller indefinitely.
const WEBHOOK_TIMEOUT_MS = 5000;

function toStoredLeadCreatedPayload(payload: LeadCreatedPayload): StoredLeadCreatedPayload {
	return {
		submissionId: payload.submissionId,
		sourcePath: payload.sourcePath,
		requestId: payload.requestId,
	};
}

async function updateAutomationEventStatus(
	client: typeof defaultDb,
	eventId: string | null,
	values: { status: 'completed' | 'failed'; attemptCount: number; lastError: string | null }
): Promise<void> {
	if (!eventId) return;

	try {
		await client
			.update(automationEvents)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(automationEvents.id, eventId));
	} catch (err) {
		logger.error('automation event status update failed', {
			eventId,
			status: values.status,
			error: String(err),
		});
	}
}

/**
 * Emit a `lead.created` event to n8n if N8N_WEBHOOK_URL is configured.
 *
 * Guarantees:
 * - If N8N_WEBHOOK_URL is not set: returns immediately, no side effects.
 * - If the webhook call fails: writes a dead-letter record to the DB and logs
 *   the error. The caller always gets a resolved promise.
 * - Payload is signed with HMAC-SHA256 if N8N_WEBHOOK_SECRET is set.
 *
 * The `dbOverride` parameter is injectable for unit tests. In production the
 * global `db` singleton is used.
 */
export async function emitLeadCreated(
	payload: LeadCreatedPayload,
	dbOverride?: typeof defaultDb
): Promise<void> {
	const webhookUrl = process.env.N8N_WEBHOOK_URL;
	if (!webhookUrl) return;

	const event: AutomationEvent = {
		id: crypto.randomUUID(),
		type: 'lead.created',
		createdAt: new Date().toISOString(),
		payload,
	};

	const body = JSON.stringify(event);
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
	if (webhookSecret) {
		headers['X-Webhook-Signature'] = signWebhookPayload(body, webhookSecret);
	}

	const client = dbOverride ?? defaultDb;
	let persistedEventId: string | null = null;

	try {
		await client.insert(automationEvents).values({
			id: event.id,
			eventType: event.type,
			payload: toStoredLeadCreatedPayload(payload) as unknown,
			status: 'pending',
		});
		persistedEventId = event.id;
	} catch (err) {
		logger.error('automation event insert failed', { eventId: event.id, error: String(err) });
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

	try {
		const res = await fetch(webhookUrl, {
			method: 'POST',
			headers,
			body,
			signal: controller.signal,
		});
		clearTimeout(timer);
		if (!res.ok) throw new Error(`n8n responded with ${res.status}`);
		await updateAutomationEventStatus(client, persistedEventId, {
			status: 'completed',
			attemptCount: 1,
			lastError: null,
		});
		logger.info('n8n lead.created delivered', { eventId: event.id });
	} catch (err) {
		clearTimeout(timer);
		await updateAutomationEventStatus(client, persistedEventId, {
			status: 'failed',
			attemptCount: 1,
			lastError: String(err),
		});
		logger.error('n8n webhook failed — writing dead-letter', {
			eventId: event.id,
			error: String(err),
		});
		try {
			await client.insert(automationDeadLetters).values({
				eventId: persistedEventId,
				eventType: event.type,
				error: String(err),
			});
		} catch (dlErr) {
			logger.error('dead-letter insert failed', { eventId: event.id, error: String(dlErr) });
		}
	}
}
