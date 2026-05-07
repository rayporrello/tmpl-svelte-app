/**
 * Postmark email provider.
 *
 * Activation:
 *   Set POSTMARK_SERVER_TOKEN in your env. resolveEmailProvider() automatically
 *   switches from the console provider to this provider when the token is set.
 *
 * CSP note: if you use Postmark's inbound webhook rather than the SMTP API, widen
 * connect-src in src/lib/server/csp.ts:
 *   'connect-src': ["'self'", 'https://api.postmarkapp.com'],
 * and form-action if you redirect to a Postmark endpoint:
 *   'form-action': ["'self'", 'https://api.postmarkapp.com'],
 *
 * This implementation uses the bare fetch API, so no Postmark SDK dependency is
 * required. If a project wants the official SDK, add it per project.
 */

import type {
	EmailPayload,
	EmailProvider,
	EmailSendOptions,
	EmailSendResult,
} from '../email-provider';

export function makePostmarkProvider(serverToken: string): EmailProvider {
	return {
		async send(payload: EmailPayload, opts: EmailSendOptions = {}): Promise<EmailSendResult> {
			const useTestToken = opts.useTestToken === true;
			const token = useTestToken ? process.env.POSTMARK_API_TEST : serverToken;
			if (!token) {
				throw new Error(
					useTestToken
						? 'Postmark test token is not configured.'
						: 'Postmark server token is not configured.'
				);
			}

			const response = await fetch('https://api.postmarkapp.com/email', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'X-Postmark-Server-Token': token,
				},
				body: JSON.stringify({
					From: payload.from,
					To: payload.to,
					Subject: payload.subject,
					TextBody: payload.text,
					...(payload.html ? { HtmlBody: payload.html } : {}),
					...(payload.replyTo ? { ReplyTo: payload.replyTo } : {}),
				}),
			});

			if (!response.ok) {
				const body = await response.text().catch(() => '(no body)');
				throw new Error(`Postmark send failed: ${response.status} ${body}`);
			}

			return {
				provider: 'postmark',
				testTokenUsed: useTestToken,
				metadata: {
					postmark_test_token_used: useTestToken,
				},
			};
		},
	};
}
