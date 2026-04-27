/**
 * Postmark email provider — EXAMPLE FILE, not auto-loaded.
 *
 * Activation:
 *   1. Rename this file to postmark.ts.
 *   2. Set POSTMARK_SERVER_TOKEN in your env (already declared in env.ts privateSchema).
 *   3. In your route action, replace:
 *        import { consoleProvider } from '$lib/server/forms/providers/console';
 *      with:
 *        import { makePostmarkProvider } from '$lib/server/forms/providers/postmark';
 *        import { privateEnv } from '$lib/server/env';
 *        const emailProvider = makePostmarkProvider(privateEnv.POSTMARK_SERVER_TOKEN!);
 *
 * CSP note: if you use Postmark's inbound webhook rather than the SMTP API, widen
 * connect-src in src/lib/server/csp.ts:
 *   'connect-src': ["'self'", 'https://api.postmarkapp.com'],
 * and form-action if you redirect to a Postmark endpoint:
 *   'form-action': ["'self'", 'https://api.postmarkapp.com'],
 *
 * bun add postmark   ← run this to install the official Postmark SDK (optional;
 *                      this example uses the bare fetch API instead).
 */

import type { EmailPayload, EmailProvider } from '../email-provider';

export function makePostmarkProvider(serverToken: string): EmailProvider {
	return {
		async send(payload: EmailPayload): Promise<void> {
			const response = await fetch('https://api.postmarkapp.com/email', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'X-Postmark-Server-Token': serverToken
				},
				body: JSON.stringify({
					From: payload.from,
					To: payload.to,
					Subject: payload.subject,
					TextBody: payload.text,
					...(payload.html ? { HtmlBody: payload.html } : {}),
					...(payload.replyTo ? { ReplyTo: payload.replyTo } : {})
				})
			});

			if (!response.ok) {
				const body = await response.text().catch(() => '(no body)');
				throw new Error(`Postmark send failed: ${response.status} ${body}`);
			}
		}
	};
}
