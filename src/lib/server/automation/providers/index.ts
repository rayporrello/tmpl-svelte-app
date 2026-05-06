import { consoleAutomationProvider } from './console';
import { DEFAULT_AUTH_HEADER, type WebhookAuthMode } from './http-delivery';
import { makeN8nProvider } from './n8n';
import { noopAutomationProvider } from './noop';
import { makeWebhookProvider } from './webhook';
import type { AutomationProvider, AutomationProviderName } from '../automation-provider';

const AUTOMATION_PROVIDERS: ReadonlyArray<AutomationProviderName> = [
	'n8n',
	'webhook',
	'console',
	'noop',
];

const AUTH_MODES: ReadonlyArray<WebhookAuthMode> = ['header', 'hmac'];

export function readAutomationProviderName(
	env: NodeJS.ProcessEnv = process.env
): AutomationProviderName {
	const provider = (env.AUTOMATION_PROVIDER || 'noop').trim() || 'noop';

	if (AUTOMATION_PROVIDERS.includes(provider as AutomationProviderName)) {
		return provider as AutomationProviderName;
	}

	throw new Error(
		`[automation] Invalid AUTOMATION_PROVIDER "${provider}". Expected one of: ${AUTOMATION_PROVIDERS.join(', ')}.`
	);
}

function readAuthMode(raw: string | undefined): WebhookAuthMode {
	const trimmed = raw?.trim() ?? '';
	if (!trimmed) return 'header';
	if (AUTH_MODES.includes(trimmed as WebhookAuthMode)) return trimmed as WebhookAuthMode;
	throw new Error(
		`[automation] Invalid auth mode "${trimmed}". Expected one of: ${AUTH_MODES.join(', ')}.`
	);
}

function readAuthHeader(raw: string | undefined): string {
	return raw?.trim() || DEFAULT_AUTH_HEADER;
}

/**
 * Pure-config view of the resolved provider and its auth options. Shared by the
 * runtime resolver, the deploy preflight check, the launch blocker, and the
 * worker's startup warning so they can never disagree about what is required.
 */
export type AutomationProviderConfig =
	| {
			provider: 'n8n';
			url: string | undefined;
			secret: string | undefined;
			authMode: WebhookAuthMode;
			authHeader: string;
	  }
	| {
			provider: 'webhook';
			url: string | undefined;
			secret: string | undefined;
			authMode: WebhookAuthMode;
			authHeader: string;
	  }
	| { provider: 'console' }
	| { provider: 'noop' };

export function readAutomationProviderConfig(
	env: NodeJS.ProcessEnv = process.env
): AutomationProviderConfig {
	const provider = readAutomationProviderName(env);

	switch (provider) {
		case 'n8n':
			return {
				provider: 'n8n',
				url: env.N8N_WEBHOOK_URL?.trim() || undefined,
				secret: env.N8N_WEBHOOK_SECRET?.trim() || undefined,
				authMode: readAuthMode(env.N8N_WEBHOOK_AUTH_MODE),
				authHeader: readAuthHeader(env.N8N_WEBHOOK_AUTH_HEADER),
			};
		case 'webhook':
			return {
				provider: 'webhook',
				url: env.AUTOMATION_WEBHOOK_URL?.trim() || undefined,
				secret: env.AUTOMATION_WEBHOOK_SECRET?.trim() || undefined,
				authMode: readAuthMode(env.AUTOMATION_WEBHOOK_AUTH_MODE),
				authHeader: readAuthHeader(env.AUTOMATION_WEBHOOK_AUTH_HEADER),
			};
		case 'console':
			return { provider: 'console' };
		case 'noop':
			return { provider: 'noop' };
	}
}

export type AutomationConfigProblem = {
	field: string;
	message: string;
};

/**
 * Validate that the resolved provider has the config it needs to deliver
 * events. Returns an empty array when configuration is complete.
 *
 * - n8n / webhook: URL and secret must be set; URL must be HTTPS.
 * - console: returns a single problem under the field "AUTOMATION_PROVIDER"
 *   so production gates can flag it. Console mode is intended for dev only.
 * - noop: never has problems — operator has opted out or left automation unset.
 */
export function validateAutomationProviderConfig(
	config: AutomationProviderConfig,
	options: { allowConsoleProvider?: boolean } = {}
): AutomationConfigProblem[] {
	const problems: AutomationConfigProblem[] = [];

	if (config.provider === 'n8n' || config.provider === 'webhook') {
		const urlField = config.provider === 'n8n' ? 'N8N_WEBHOOK_URL' : 'AUTOMATION_WEBHOOK_URL';
		const secretField =
			config.provider === 'n8n' ? 'N8N_WEBHOOK_SECRET' : 'AUTOMATION_WEBHOOK_SECRET';

		if (!config.url) {
			problems.push({ field: urlField, message: `${urlField} is missing.` });
		} else {
			let parsed: URL | null = null;
			try {
				parsed = new URL(config.url);
			} catch {
				problems.push({
					field: urlField,
					message: `${urlField}="${config.url}" is not a valid URL.`,
				});
			}

			if (parsed) {
				if (parsed.protocol !== 'https:') {
					problems.push({
						field: urlField,
						message: `${urlField}="${config.url}" must use https:.`,
					});
				}
			}
		}

		if (!config.secret) {
			problems.push({
				field: secretField,
				message: `${secretField} is missing — required to authenticate the request.`,
			});
		}
	}

	if (config.provider === 'console' && !options.allowConsoleProvider) {
		problems.push({
			field: 'AUTOMATION_PROVIDER',
			message:
				'AUTOMATION_PROVIDER=console is for local development only. Use AUTOMATION_PROVIDER=noop to explicitly disable automation, or set AUTOMATION_PROVIDER=n8n with N8N_WEBHOOK_URL/SECRET configured.',
		});
	}

	return problems;
}

export function resolveAutomationProvider(
	env: NodeJS.ProcessEnv = process.env
): AutomationProvider {
	const config = readAutomationProviderConfig(env);

	switch (config.provider) {
		case 'n8n':
			return makeN8nProvider(config.url, config.secret, {
				authMode: config.authMode,
				authHeader: config.authHeader,
			});
		case 'webhook':
			return makeWebhookProvider(config.url, config.secret, {
				authMode: config.authMode,
				authHeader: config.authHeader,
			});
		case 'console':
			return consoleAutomationProvider;
		case 'noop':
			return noopAutomationProvider;
	}
}
