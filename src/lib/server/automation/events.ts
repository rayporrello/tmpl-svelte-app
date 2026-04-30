import { db as defaultDb } from '$lib/server/db';
import { automationDeadLetters, automationEvents } from '$lib/server/db/schema';
import { logger } from '$lib/server/logger';
import { resolveAutomationProvider } from './providers';
import type { AutomationEvent, LeadCreatedAutomationData } from './automation-provider';

export interface LeadCreatedPayload {
	submissionId: string;
	name: string;
	email: string;
	sourcePath?: string | null;
	requestId?: string | null;
}

interface StoredLeadCreatedPayload {
	submission_id: string;
	source_path?: string | null;
	request_id?: string | null;
}

function toStoredLeadCreatedPayload(payload: LeadCreatedPayload): StoredLeadCreatedPayload {
	return {
		submission_id: payload.submissionId,
		source_path: payload.sourcePath,
		request_id: payload.requestId,
	};
}

function toLeadCreatedData(payload: LeadCreatedPayload): LeadCreatedAutomationData {
	return {
		submission_id: payload.submissionId,
		name: payload.name,
		email: payload.email,
		source_path: payload.sourcePath,
		request_id: payload.requestId,
	};
}

/**
 * Emit a `lead.created` event to the configured automation provider.
 *
 * Guarantees:
 * - If the provider is not configured or disabled: returns immediately.
 * - If delivery fails: writes a dead-letter record to the DB and logs
 *   the error. The caller always gets a resolved promise.
 *
 * The `dbOverride` parameter is injectable for unit tests. In production the
 * global `db` singleton is used.
 */
export async function emitLeadCreated(
	payload: LeadCreatedPayload,
	dbOverride?: typeof defaultDb
): Promise<void> {
	const eventId = crypto.randomUUID();
	const event: AutomationEvent<'lead.created'> = {
		event: 'lead.created',
		version: 1,
		occurred_at: new Date().toISOString(),
		data: toLeadCreatedData(payload),
	};

	const result = await resolveAutomationProvider().send(event);
	if (result.ok && !result.delivered) return;

	const client = dbOverride ?? defaultDb;
	let persistedEventId: string | null = null;

	try {
		await client.insert(automationEvents).values({
			id: eventId,
			eventType: event.event,
			payload: toStoredLeadCreatedPayload(payload) as unknown,
			status: result.ok ? 'completed' : 'failed',
			attemptCount: 1,
			lastError: result.ok ? null : result.error,
		});
		persistedEventId = eventId;
	} catch (err) {
		logger.error('automation event insert failed', { eventId, error: String(err) });
	}

	if (result.ok) {
		logger.info('automation event delivered', {
			eventId,
			event: event.event,
			provider: result.provider,
		});
		return;
	}

	logger.error('automation event delivery failed — writing dead-letter', {
		eventId,
		event: event.event,
		provider: result.provider,
		error: result.error,
	});
	try {
		await client.insert(automationDeadLetters).values({
			eventId: persistedEventId,
			eventType: event.event,
			error: result.error,
		});
	} catch (dlErr) {
		logger.error('dead-letter insert failed', { eventId, error: String(dlErr) });
	}
}
