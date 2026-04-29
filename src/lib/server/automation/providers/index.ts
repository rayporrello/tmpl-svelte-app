import { consoleAutomationProvider } from './console';
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

function readProviderName(): AutomationProviderName {
	const provider = process.env.AUTOMATION_PROVIDER || 'n8n';

	if (AUTOMATION_PROVIDERS.includes(provider as AutomationProviderName)) {
		return provider as AutomationProviderName;
	}

	throw new Error(
		`[automation] Invalid AUTOMATION_PROVIDER "${provider}". Expected one of: ${AUTOMATION_PROVIDERS.join(', ')}.`
	);
}

export function resolveAutomationProvider(): AutomationProvider {
	const provider = readProviderName();

	switch (provider) {
		case 'n8n':
			return makeN8nProvider(process.env.N8N_WEBHOOK_URL, process.env.N8N_WEBHOOK_SECRET);
		case 'webhook':
			return makeWebhookProvider(
				process.env.AUTOMATION_WEBHOOK_URL,
				process.env.AUTOMATION_WEBHOOK_SECRET
			);
		case 'console':
			return consoleAutomationProvider;
		case 'noop':
			return noopAutomationProvider;
	}
}
