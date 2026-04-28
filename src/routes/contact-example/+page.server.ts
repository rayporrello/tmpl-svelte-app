/**
 * Contact form — example route.
 *
 * This route is intentionally named `contact-example/` so it does not activate
 * automatically. To use it in a project:
 *   1. Rename the directory: mv src/routes/contact-example src/routes/contact
 *   2. Update src/lib/seo/routes.ts: change '/contact-example' → '/contact' and
 *      set indexable: true once the page is production-ready.
 *   3. Set CONTACT_TO_EMAIL and CONTACT_FROM_EMAIL in your env.
 *   4. Optional: swap consoleProvider for a real EmailProvider (see
 *      src/lib/server/forms/providers/postmark.example.ts).
 *   5. Optional: set RATE_LIMIT_ENABLED=true in your env.
 */

import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { contactSchema } from '$lib/forms/contact.schema';
import { consoleProvider } from '$lib/server/forms/providers/console';
import { checkRateLimit } from '$lib/server/forms/rate-limit';
import { privateEnv } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';
// Analytics seam — uncomment when enabling server-side conversion tracking:
// import { emitServerAnalyticsEvent } from '$lib/server/analytics/events';
// import type { AttributionPayload } from '$lib/analytics/attribution.client';

export const load: PageServerLoad = async () => {
	return { form: await superValidate(valibot(contactSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, valibot(contactSchema));
		if (!form.valid) return fail(400, { form });

		// Rate limit — keyed by IP. No-op unless RATE_LIMIT_ENABLED=true.
		let clientKey = 'contact:unknown';
		try {
			clientKey = `contact:${event.getClientAddress()}`;
		} catch {
			// getClientAddress() requires ADDRESS_HEADER in production; falls back to
			// a shared key in local dev. Rate limiting still works as a single bucket.
		}
		if (!checkRateLimit(clientKey)) {
			return message(form, 'Too many requests — please wait a moment before trying again.', {
				status: 429,
			});
		}

		const to = privateEnv.CONTACT_TO_EMAIL ?? 'hello@example.com';
		const from = privateEnv.CONTACT_FROM_EMAIL ?? 'noreply@example.com';

		try {
			await consoleProvider.send({
				to,
				from,
				subject: `Contact form: ${form.data.name}`,
				text: `Name: ${form.data.name}\nEmail: ${form.data.email}\n\n${form.data.message}`,
				replyTo: form.data.email,
			});
		} catch (err) {
			logger.error('Contact form email send failed', { error: String(err) });
			return message(form, 'Something went wrong — please try again later.', { status: 500 });
		}

		// Analytics seam — server-side generate_lead event after success.
		// See docs/analytics/server-conversions.md for the full activation guide.
		//
		// Prerequisites (uncomment imports at the top of this file, then):
		//   ANALYTICS_SERVER_EVENTS_ENABLED=true in env
		//   setAnalyticsProvider(ga4MpProvider) called in hooks.server.ts
		//
		// Attribution flow: captureAttribution() runs client-side (via AnalyticsHead.svelte)
		// and stores UTM params in localStorage. To pass it server-side, add a hidden field
		// to the contact form and read it in the server action:
		//
		//   // In +page.svelte, inside <form>:
		//   <input type="hidden" name="attribution" value={JSON.stringify(getAttributionPayload())} />
		//
		//   // In this server action, before emitServerAnalyticsEvent:
		//   let attribution: AttributionPayload | undefined;
		//   try {
		//     const raw = form.data.attribution as string | undefined;
		//     if (raw) attribution = JSON.parse(raw);
		//   } catch { /* ignore malformed attribution */ }
		//
		// await emitServerAnalyticsEvent({
		//   name: 'generate_lead',
		//   eventId: crypto.randomUUID(),
		//   metadata: { form_name: 'contact' },
		//   attribution,
		//   // Do NOT include form.data.name, form.data.email, or form.data.message.
		// });

		return message(form, "Message sent! We'll get back to you soon.");
	},
};
