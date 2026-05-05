import type { AutomationEvent, AutomationProvider } from '../automation-provider';
import { sendHttpAutomationEvent, type WebhookAuthMode } from './http-delivery';

export interface N8nProviderOptions {
	authMode?: WebhookAuthMode;
	authHeader?: string;
}

export function makeN8nProvider(
	webhookUrl?: string,
	webhookSecret?: string,
	options: N8nProviderOptions = {}
): AutomationProvider {
	return {
		send(event: AutomationEvent) {
			return sendHttpAutomationEvent(
				{
					provider: 'n8n',
					url: webhookUrl,
					secret: webhookSecret,
					authMode: options.authMode,
					authHeader: options.authHeader,
				},
				event
			);
		},
	};
}
