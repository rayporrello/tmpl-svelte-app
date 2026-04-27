/**
 * Console email provider — the default.
 *
 * Logs the email payload to stdout via the structured logger. Useful during
 * development and in any environment where real email delivery is not needed.
 *
 * To activate a real provider, replace this import in your route action with
 * postmark.example.ts (after renaming it) or your own EmailProvider.
 */

import { logger } from '$lib/server/logger';
import type { EmailPayload, EmailProvider } from '../email-provider';

export const consoleProvider: EmailProvider = {
	async send(payload: EmailPayload): Promise<void> {
		logger.info('contact form submission', {
			provider: 'console',
			to: payload.to,
			from: payload.from,
			subject: payload.subject,
			replyTo: payload.replyTo,
			textLength: payload.text.length
		});
	}
};
