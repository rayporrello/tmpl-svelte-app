import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { contactSchema } from '$lib/forms/contact.schema';
import { checkRateLimit } from '$lib/server/forms/rate-limit';
import { resolveEmailProvider } from '$lib/server/forms/providers/index';
import { enqueueLeadCreated } from '$lib/server/automation/events';
import { db } from '$lib/server/db';
import { contactSubmissions } from '$lib/server/db/schema';
import { privateEnv } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { form: await superValidate(valibot(contactSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, valibot(contactSchema));
		if (!form.valid) return fail(400, { form });

		// Honeypot — bots fill `website`; real users can't see it. Silent
		// success keeps bots from learning they've been caught.
		if (form.data.website && form.data.website.length > 0) {
			logger.info('Contact form honeypot trip', { requestId: event.locals.requestId });
			return message(form, "Message sent! We'll get back to you soon.");
		}

		// Rate limit — keyed by IP. No-op unless RATE_LIMIT_ENABLED=true.
		// Single-node guard; buckets reset on restart. See rate-limit.ts.
		let clientKey = 'contact:unknown';
		try {
			clientKey = `contact:${event.getClientAddress()}`;
		} catch {
			// getClientAddress() requires ADDRESS_HEADER in production; falls back to
			// a shared bucket in local dev. Rate limiting still works.
		}
		if (!checkRateLimit(clientKey)) {
			return message(form, 'Too many requests — please wait a moment before trying again.', {
				status: 429,
			});
		}

		// Collect safe operational metadata
		const requestId = event.locals.requestId;
		let sourcePath: string;
		try {
			const referer = event.request.headers.get('referer');
			sourcePath = referer ? new URL(referer).pathname : event.url.pathname;
		} catch {
			sourcePath = event.url.pathname;
		}
		const userAgent = event.request.headers.get('user-agent');

		// 1. Persist the lead and outbox event together. If this fails, the
		//    submission is not saved and no automation event can drift from it.
		let submissionId: string;
		try {
			submissionId = await db.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(contactSubmissions)
					.values({
						name: form.data.name,
						email: form.data.email,
						message: form.data.message,
						sourcePath,
						userAgent,
						requestId,
					})
					.returning({ id: contactSubmissions.id });

				await enqueueLeadCreated(
					{
						submissionId: inserted.id,
						sourcePath,
						requestId,
					},
					tx
				);

				return inserted.id;
			});
		} catch (err) {
			logger.error('Contact form DB/outbox transaction failed', { error: String(err), requestId });
			return message(form, 'Something went wrong — please try again later.', { status: 500 });
		}

		// 2. Attempt email notification. Failure does NOT prevent a success response
		//    because the submission is already saved. The lead is not lost.
		const to = privateEnv.CONTACT_TO_EMAIL ?? 'hello@example.com';
		const from = privateEnv.CONTACT_FROM_EMAIL ?? 'noreply@example.com';
		try {
			await resolveEmailProvider().send({
				to,
				from,
				subject: `Contact form: ${form.data.name}`,
				text: `Name: ${form.data.name}\nEmail: ${form.data.email}\n\n${form.data.message}`,
				replyTo: form.data.email,
			});
		} catch (err) {
			logger.error('Contact form email failed', { error: String(err), submissionId, requestId });
			// Submission is saved — continue to success response
		}

		return message(form, "Message sent! We'll get back to you soon.");
	},
};
