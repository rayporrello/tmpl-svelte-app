import type {
	AutomationEvent,
	AutomationProviderName,
	AutomationSendResult,
} from '../automation-provider';
import { WEBHOOK_SIGNATURE_HEADER, signWebhookPayload } from '../signing';

const WEBHOOK_TIMEOUT_MS = 5000;

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
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (config.secret) {
		headers[WEBHOOK_SIGNATURE_HEADER] = signWebhookPayload(body, config.secret);
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
