import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { contactSchema } from '$lib/forms/contact.schema';
import { checkRateLimit } from '$lib/server/forms/rate-limit';
import { resolveEmailProvider } from '$lib/server/forms/providers/index';
import { emitLeadCreated } from '$lib/server/automation/events';
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

		// 1. Persist to DB — must succeed before anything else. If this fails,
		//    the submission is lost and we return an error to the user.
		let submissionId: string;
		try {
			const [inserted] = await db
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
			submissionId = inserted.id;
		} catch (err) {
			logger.error('Contact form DB insert failed', { error: String(err), requestId });
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

		// 3. Emit n8n event. Fire-and-forget: errors are dead-lettered internally.
		//    n8n unavailability never makes the contact form fail after the DB save.
		void emitLeadCreated({
			submissionId,
			name: form.data.name,
			email: form.data.email,
			sourcePath,
			requestId,
		});

		return message(form, "Message sent! We'll get back to you soon.");
	},
};
