import {
	BUSINESS_FORM_SUBMITTED_EVENT,
	type AutomationEvent,
	type BusinessFormSubmittedAutomationData,
	type LeadCreatedAutomationData,
} from './automation-provider';

export interface LeadCreatedOutboxPayload {
	submission_id: string;
	source_path?: string | null;
	request_id?: string | null;
}

export interface LeadCreatedContactSnapshot {
	name: string;
	email: string;
}

export interface BusinessFormSubmittedOutboxPayload {
	form_id: string;
	submission_id: string;
	source_table: string;
	source_path?: string | null;
	request_id?: string | null;
}

export function leadCreatedIdempotencyKey(submissionId: string): string {
	return `lead.created:${submissionId}`;
}

export function businessFormSubmittedIdempotencyKey(formId: string, submissionId: string): string {
	return `${BUSINESS_FORM_SUBMITTED_EVENT}:${formId}:${submissionId}`;
}

export function toLeadCreatedOutboxPayload(input: {
	submissionId: string;
	sourcePath?: string | null;
	requestId?: string | null;
}): LeadCreatedOutboxPayload {
	return {
		submission_id: input.submissionId,
		source_path: input.sourcePath,
		request_id: input.requestId,
	};
}

export function toBusinessFormSubmittedOutboxPayload(input: {
	formId: string;
	submissionId: string;
	sourceTable: string;
	sourcePath?: string | null;
	requestId?: string | null;
}): BusinessFormSubmittedOutboxPayload {
	return {
		form_id: input.formId,
		submission_id: input.submissionId,
		source_table: input.sourceTable,
		source_path: input.sourcePath,
		request_id: input.requestId,
	};
}

export function buildLeadCreatedEvent(input: {
	createdAt: Date | string;
	idempotencyKey: string;
	payload: LeadCreatedOutboxPayload;
	contact: LeadCreatedContactSnapshot;
}): AutomationEvent<'lead.created'> {
	const data: LeadCreatedAutomationData = {
		submission_id: input.payload.submission_id,
		name: input.contact.name,
		email: input.contact.email,
		source_path: input.payload.source_path,
		request_id: input.payload.request_id,
	};

	return {
		event: 'lead.created',
		version: 1,
		occurred_at: input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt,
		idempotency_key: input.idempotencyKey,
		data,
	};
}

export function buildBusinessFormSubmittedEvent(input: {
	createdAt: Date | string;
	idempotencyKey: string;
	payload: BusinessFormSubmittedOutboxPayload;
}): AutomationEvent<typeof BUSINESS_FORM_SUBMITTED_EVENT> {
	const data: BusinessFormSubmittedAutomationData = {
		form_id: input.payload.form_id,
		submission_id: input.payload.submission_id,
		source_table: input.payload.source_table,
		source_path: input.payload.source_path,
		request_id: input.payload.request_id,
	};

	return {
		event: BUSINESS_FORM_SUBMITTED_EVENT,
		version: 1,
		occurred_at: input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt,
		idempotency_key: input.idempotencyKey,
		data,
	};
}
