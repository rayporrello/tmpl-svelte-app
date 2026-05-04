import type postgres from 'postgres';
import {
	BUSINESS_FORM_SUBMITTED_EVENT,
	type AutomationEvent,
	type AutomationEventName,
} from './automation-provider';
import {
	buildBusinessFormSubmittedEvent,
	buildLeadCreatedEvent,
	type BusinessFormSubmittedOutboxPayload,
	type LeadCreatedContactSnapshot,
	type LeadCreatedOutboxPayload,
} from './envelopes';

export interface AutomationOutboxRow {
	id: string;
	created_at: Date;
	event_type: string;
	payload: unknown;
	idempotency_key: string;
}

export type AutomationEventBuildResult =
	| { ok: true; event: AutomationEvent }
	| { ok: false; error: string };

export interface AutomationEventHandler<TName extends AutomationEventName = AutomationEventName> {
	eventType: TName;
	description: string;
	sourceTable: string;
	buildEvent(sql: postgres.Sql, row: AutomationOutboxRow): Promise<AutomationEventBuildResult>;
}

function asLeadCreatedPayload(value: unknown): LeadCreatedOutboxPayload | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (typeof record.submission_id !== 'string' || record.submission_id.length === 0) return null;
	return {
		submission_id: record.submission_id,
		source_path: typeof record.source_path === 'string' ? record.source_path : null,
		request_id: typeof record.request_id === 'string' ? record.request_id : null,
	};
}

function asBusinessFormSubmittedPayload(value: unknown): BusinessFormSubmittedOutboxPayload | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (typeof record.form_id !== 'string' || record.form_id.length === 0) return null;
	if (typeof record.submission_id !== 'string' || record.submission_id.length === 0) return null;
	if (typeof record.source_table !== 'string' || record.source_table.length === 0) return null;
	return {
		form_id: record.form_id,
		submission_id: record.submission_id,
		source_table: record.source_table,
		source_path: typeof record.source_path === 'string' ? record.source_path : null,
		request_id: typeof record.request_id === 'string' ? record.request_id : null,
	};
}

async function loadContact(
	sql: postgres.Sql,
	submissionId: string
): Promise<LeadCreatedContactSnapshot | null> {
	const rows = await sql`
		select name, email
		from contact_submissions
		where id = ${submissionId}
		limit 1
	`;
	const row = rows[0] as { name?: unknown; email?: unknown } | undefined;
	if (typeof row?.name !== 'string' || typeof row.email !== 'string') return null;
	return { name: row.name, email: row.email };
}

const leadCreatedHandler: AutomationEventHandler<'lead.created'> = {
	eventType: 'lead.created',
	description: 'Contact form submission saved to contact_submissions.',
	sourceTable: 'contact_submissions',
	async buildEvent(sql, row) {
		const payload = asLeadCreatedPayload(row.payload);
		if (!payload) return { ok: false, error: 'Invalid lead.created outbox payload.' };

		const contact = await loadContact(sql, payload.submission_id);
		if (!contact) {
			return {
				ok: false,
				error: `Contact submission not found for ${payload.submission_id}.`,
			};
		}

		return {
			ok: true,
			event: buildLeadCreatedEvent({
				createdAt: row.created_at,
				idempotencyKey: row.idempotency_key,
				payload,
				contact,
			}),
		};
	},
};

const businessFormSubmittedHandler: AutomationEventHandler<typeof BUSINESS_FORM_SUBMITTED_EVENT> = {
	eventType: BUSINESS_FORM_SUBMITTED_EVENT,
	description: 'Generic scaffolded business form submission saved to its source table.',
	sourceTable: 'registered business form source table',
	async buildEvent(_sql, row) {
		const payload = asBusinessFormSubmittedPayload(row.payload);
		if (!payload) return { ok: false, error: 'Invalid business_form.submitted outbox payload.' };

		return {
			ok: true,
			event: buildBusinessFormSubmittedEvent({
				createdAt: row.created_at,
				idempotencyKey: row.idempotency_key,
				payload,
			}),
		};
	},
};

export const automationEventHandlers = {
	'lead.created': leadCreatedHandler,
	[BUSINESS_FORM_SUBMITTED_EVENT]: businessFormSubmittedHandler,
} satisfies Record<AutomationEventName, AutomationEventHandler>;

export const automationEventCatalog = Object.values(automationEventHandlers).map((handler) => ({
	eventType: handler.eventType,
	description: handler.description,
	sourceTable: handler.sourceTable,
}));

export function getAutomationEventHandler(eventType: string): AutomationEventHandler | null {
	if (!Object.hasOwn(automationEventHandlers, eventType)) return null;
	return automationEventHandlers[eventType as AutomationEventName];
}
