import { db as defaultDb } from '$lib/server/db';
import { automationEvents } from '$lib/server/db/schema';
import { logger } from '$lib/server/logger';
import {
	leadCreatedIdempotencyKey,
	toLeadCreatedOutboxPayload,
	type LeadCreatedOutboxPayload,
} from './envelopes';

export interface LeadCreatedPayload {
	submissionId: string;
	/**
	 * Kept for backwards-compatible call sites; PII is not persisted in the
	 * outbox. The worker joins back to contact_submissions when delivering.
	 */
	name?: string;
	email?: string;
	sourcePath?: string | null;
	requestId?: string | null;
}

type AutomationEventInsertClient = Pick<typeof defaultDb, 'insert'>;

function outboxPayload(payload: LeadCreatedPayload): LeadCreatedOutboxPayload {
	return toLeadCreatedOutboxPayload({
		submissionId: payload.submissionId,
		sourcePath: payload.sourcePath,
		requestId: payload.requestId,
	});
}

/**
 * Insert a pending `lead.created` outbox event.
 *
 * This is intentionally delivery-free. Call it inside the same transaction as
 * the primary write so a saved lead and its automation event commit together.
 */
export async function enqueueLeadCreated(
	payload: LeadCreatedPayload,
	dbOverride?: AutomationEventInsertClient
): Promise<void> {
	const client = dbOverride ?? defaultDb;
	const idempotencyKey = leadCreatedIdempotencyKey(payload.submissionId);

	await client
		.insert(automationEvents)
		.values({
			eventType: 'lead.created',
			payload: outboxPayload(payload) as unknown,
			status: 'pending',
			attemptCount: 0,
			maxAttempts: 5,
			idempotencyKey,
		})
		.onConflictDoNothing({ target: automationEvents.idempotencyKey });

	logger.info('automation event enqueued', {
		event: 'lead.created',
		submissionId: payload.submissionId,
		idempotencyKey,
	});
}

/**
 * Backwards-compatible name for older call sites. It now enqueues an outbox
 * event instead of attempting provider delivery in the request lifecycle.
 */
export async function emitLeadCreated(
	payload: LeadCreatedPayload,
	dbOverride?: AutomationEventInsertClient
): Promise<void> {
	await enqueueLeadCreated(payload, dbOverride);
}
