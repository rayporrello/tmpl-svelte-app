import type {
	AutomationEvent,
	AutomationProviderName,
	AutomationSendResult,
} from '../automation-provider';
import { WEBHOOK_SIGNATURE_HEADER, signWebhookPayload } from '../signing';

const WEBHOOK_TIMEOUT_MS = 5000;

export const DEFAULT_AUTH_HEADER = 'X-Site-Auth';
export const SITE_EVENT_ID_HEADER = 'X-Site-Event-Id';
export const SITE_EVENT_TYPE_HEADER = 'X-Site-Event-Type';
export const SITE_TIMESTAMP_HEADER = 'X-Site-Timestamp';

export type WebhookAuthMode = 'header' | 'hmac';

function isAbortError(err: unknown): boolean {
	return (
		(err instanceof Error && err.name === 'AbortError') ||
		(typeof err === 'object' &&
			err !== null &&
			'name' in err &&
			(err as { name?: unknown }).name === 'AbortError')
	);
}

interface HttpAutomationProviderConfig {
	provider: Extract<AutomationProviderName, 'n8n' | 'webhook'>;
	url?: string;
	secret?: string;
	/** `header` (default) sends `<authHeader>: <secret>`; `hmac` sends `X-Webhook-Signature: <hmac-of-body>`. */
	authMode?: WebhookAuthMode;
	/** Header name used in `header` mode. Defaults to `X-Site-Auth`. */
	authHeader?: string;
}

export async function sendHttpAutomationEvent(
	config: HttpAutomationProviderConfig,
	event: AutomationEvent
): Promise<AutomationSendResult> {
	if (!config.url) {
		return {
			ok: true,
			provider: config.provider,
			delivered: false,
			skipped: true,
			reason: 'not_configured',
		};
	}

	try {
		new URL(config.url);
	} catch (err) {
		return {
			ok: false,
			provider: config.provider,
			failure: 'configuration',
			error: String(err),
		};
	}

	const body = JSON.stringify(event);
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		[SITE_EVENT_ID_HEADER]: event.idempotency_key ?? '',
		[SITE_EVENT_TYPE_HEADER]: event.event,
		[SITE_TIMESTAMP_HEADER]: event.occurred_at,
	};

	if (config.secret) {
		const mode: WebhookAuthMode = config.authMode ?? 'header';
		if (mode === 'hmac') {
			headers[WEBHOOK_SIGNATURE_HEADER] = signWebhookPayload(body, config.secret);
		} else {
			const headerName = config.authHeader?.trim() || DEFAULT_AUTH_HEADER;
			headers[headerName] = config.secret;
		}
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

	try {
		const response = await fetch(config.url, {
			method: 'POST',
			headers,
			body,
			signal: controller.signal,
		});

		if (!response.ok) {
			return {
				ok: false,
				provider: config.provider,
				failure: 'http',
				error: `HTTP ${response.status}`,
				status: response.status,
			};
		}

		return { ok: true, provider: config.provider, delivered: true, status: response.status };
	} catch (err) {
		if (isAbortError(err)) {
			return {
				ok: false,
				provider: config.provider,
				failure: 'timeout',
				error: String(err),
			};
		}

		return {
			ok: false,
			provider: config.provider,
			failure: 'network',
			error: String(err),
		};
	} finally {
		clearTimeout(timer);
	}
}
