import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { contactSchema } from '$lib/forms/contact.schema';
import { contactRequestContext, submitContact } from '$lib/server/forms/contact-action';
import { checkRateLimit } from '$lib/server/forms/rate-limit';
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

		// Persist the lead and outbox event together, then attempt email.
		// If the DB transaction fails, no automation event can drift from it.
		try {
			await submitContact(form.data, {
				...contactRequestContext(event),
				isSmokeTest: false,
			});
		} catch (err) {
			logger.error('Contact form DB/outbox transaction failed', {
				error: String(err),
				requestId: event.locals.requestId,
			});
			return message(form, 'Something went wrong — please try again later.', { status: 500 });
		}

		return message(form, "Message sent! We'll get back to you soon.");
	},
};
