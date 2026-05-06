import { consoleProvider } from './console';
import { makePostmarkProvider } from './postmark';
import type { EmailProvider } from '../email-provider';

/**
 * Returns the active email provider based on environment configuration.
 *
 * - POSTMARK_SERVER_TOKEN set → Postmark provider (sends real email).
 * - Otherwise → console provider (logs to stdout; local/dev fallback only).
 *
 * Call per-request inside a server action. Do not call at module load time
 * because process.env is not frozen and may change in tests.
 */
export function resolveEmailProvider(): EmailProvider {
	const token = process.env.POSTMARK_SERVER_TOKEN;
	if (token) return makePostmarkProvider(token);
	return consoleProvider;
}
