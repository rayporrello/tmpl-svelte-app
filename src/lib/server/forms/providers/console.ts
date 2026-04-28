/**
 * Console email provider — the default.
 *
 * Logs the email payload to stdout via the structured logger. Useful during
 * development and in any environment where real email delivery is not needed.
 *
 * To activate Postmark, set POSTMARK_SERVER_TOKEN. resolveEmailProvider() will
 * switch automatically. Custom providers can still implement EmailProvider.
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
			textLength: payload.text.length,
		});
	},
};
