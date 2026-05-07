import * as crypto from 'node:crypto';
import { json, type RequestEvent } from '@sveltejs/kit';
import { and, eq, lt, sql } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { contactSchema } from '$lib/forms/contact.schema';
import { enqueueLeadCreated } from '$lib/server/automation/events';
import { leadCreatedIdempotencyKey } from '$lib/server/automation/envelopes';
import { db as defaultDb } from '$lib/server/db';
import { automationEvents, contactSubmissions } from '$lib/server/db/schema';
import { privateEnv } from '$lib/server/env';
import { checkSmokeRateLimit } from '$lib/server/forms/rate-limit';
import { resolveEmailProvider } from '$lib/server/forms/providers/index';
import { logger as defaultLogger } from '$lib/server/logger';
import type { EmailProvider, EmailSendResult } from './email-provider';

export const SMOKE_TEST_HEADER = 'x-smoke-test';
export const SMOKE_RETENTION_HOURS = 24;

type ContactData = {
	name: string;
	email: string;
	message: string;
	website?: string;
};

type ContactSubmissionContext = {
	sourcePath: string;
	userAgent: string | null;
	requestId?: string;
	isSmokeTest: boolean;
};

type ContactActionDeps = {
	db?: typeof defaultDb;
	emailProvider?: EmailProvider;
	logger?: typeof defaultLogger;
};

type SmokeConfig = {
	secret: string;
	rateLimitPerHour: number;
	backlogThreshold: number;
};

function smokeConfigFromEnv(): SmokeConfig | null {
	const secret = process.env.SMOKE_TEST_SECRET?.trim();
	if (!secret) return null;
	return {
		secret,
		rateLimitPerHour: Number(process.env.SMOKE_TEST_RATE_LIMIT_PER_HOUR ?? 60),
		backlogThreshold: Number(process.env.SMOKE_TEST_BACKLOG_THRESHOLD ?? 100),
	};
}

function lengthEqualizedBuffer(value: string, length: number): Buffer {
	const source = Buffer.from(value);
	const target = Buffer.alloc(length);
	source.copy(target, 0, 0, Math.min(source.length, length));
	return target;
}

export function smokeSecretMatches(headerValue: string, secret: string | undefined): boolean {
	const configuredSecret = secret ?? '';
	const compareLength = Math.max(
		Buffer.byteLength(headerValue),
		Buffer.byteLength(configuredSecret),
		32
	);
	const supplied = lengthEqualizedBuffer(headerValue, compareLength);
	const expected = lengthEqualizedBuffer(configuredSecret, compareLength);
	const buffersMatch = crypto.timingSafeEqual(supplied, expected);
	return (
		buffersMatch &&
		configuredSecret.length > 0 &&
		Buffer.byteLength(headerValue) === Buffer.byteLength(configuredSecret)
	);
}

export function smokeRateLimitKey(secret: string): string {
	return `smoke:${crypto.createHash('sha256').update(secret).digest('hex')}`;
}

function smokeCutoff(): Date {
	return new Date(Date.now() - SMOKE_RETENTION_HOURS * 60 * 60 * 1000);
}

async function countExpiredSmokeRows(client: typeof defaultDb): Promise<number> {
	const [row] = await client
		.select({ count: sql<number>`count(*)::int` })
		.from(contactSubmissions)
		.where(
			and(eq(contactSubmissions.isSmokeTest, true), lt(contactSubmissions.createdAt, smokeCutoff()))
		);
	return Number((row as { count?: unknown } | undefined)?.count ?? 0);
}

async function insertContactAndOutbox(
	data: ContactData,
	context: ContactSubmissionContext,
	client: typeof defaultDb
): Promise<string> {
	return await client.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(contactSubmissions)
			.values({
				name: data.name,
				email: data.email,
				message: data.message,
				sourcePath: context.sourcePath,
				userAgent: context.userAgent,
				requestId: context.requestId,
				isSmokeTest: context.isSmokeTest,
			})
			.returning({ id: contactSubmissions.id });

		await enqueueLeadCreated(
			{
				submissionId: inserted.id,
				sourcePath: context.sourcePath,
				requestId: context.requestId,
			},
			tx
		);

		return inserted.id;
	});
}

async function annotateSmokeEmailResult(
	submissionId: string,
	sendResult: void | EmailSendResult,
	client: typeof defaultDb
): Promise<void> {
	if (!sendResult?.testTokenUsed) return;
	await client
		.update(automationEvents)
		.set({
			payload: sql`${automationEvents.payload} || ${JSON.stringify({
				postmark_test_token_used: true,
				...(sendResult.metadata ?? {}),
			})}::jsonb`,
		})
		.where(eq(automationEvents.idempotencyKey, leadCreatedIdempotencyKey(submissionId)));
}

export async function submitContact(
	data: ContactData,
	context: ContactSubmissionContext,
	deps: ContactActionDeps = {}
): Promise<string> {
	const client = deps.db ?? defaultDb;
	const activeLogger = deps.logger ?? defaultLogger;
	const submissionId = await insertContactAndOutbox(data, context, client);

	const to = privateEnv.CONTACT_TO_EMAIL ?? 'hello@example.com';
	const from = privateEnv.CONTACT_FROM_EMAIL ?? 'noreply@example.com';
	try {
		const result = await (deps.emailProvider ?? resolveEmailProvider()).send(
			{
				to,
				from,
				subject: `Contact form: ${data.name}`,
				text: `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`,
				replyTo: data.email,
			},
			context.isSmokeTest ? { useTestToken: true } : undefined
		);
		if (context.isSmokeTest) await annotateSmokeEmailResult(submissionId, result, client);
	} catch (err) {
		activeLogger.error('Contact form email failed', {
			error: String(err),
			submissionId,
			requestId: context.requestId,
			smokeTest: context.isSmokeTest,
		});
	}

	return submissionId;
}

export function contactRequestContext(
	event: RequestEvent
): Omit<ContactSubmissionContext, 'isSmokeTest'> {
	let sourcePath: string;
	try {
		const referer = event.request.headers.get('referer');
		sourcePath = referer ? new URL(referer).pathname : event.url.pathname;
	} catch {
		sourcePath = event.url.pathname;
	}

	return {
		sourcePath,
		userAgent: event.request.headers.get('user-agent'),
		requestId: event.locals.requestId,
	};
}

export async function handleSmokeContactRequest(
	event: RequestEvent,
	deps: ContactActionDeps = {}
): Promise<Response | null> {
	if (event.request.method !== 'POST' || event.url.pathname !== '/contact') return null;

	const headerValue = event.request.headers.get(SMOKE_TEST_HEADER);
	if (headerValue === null) return null;

	const config = smokeConfigFromEnv();
	if (!smokeSecretMatches(headerValue, config?.secret)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const client = deps.db ?? defaultDb;
	const expiredSmokeRows = await countExpiredSmokeRows(client);
	if (expiredSmokeRows > config!.backlogThreshold) {
		return json({ error: 'smoke-backlog-exceeded', count: expiredSmokeRows }, { status: 503 });
	}

	if (!checkSmokeRateLimit(smokeRateLimitKey(config!.secret), config!.rateLimitPerHour)) {
		return json({ error: 'rate-limited' }, { status: 429 });
	}

	const form = await superValidate(event.request, valibot(contactSchema));
	if (!form.valid) return json({ error: 'invalid-form' }, { status: 400 });

	const submissionId = await submitContact(
		form.data,
		{ ...contactRequestContext(event), isSmokeTest: true },
		deps
	);

	return json({ ok: true, contact_id: submissionId, smoke_test: true });
}
