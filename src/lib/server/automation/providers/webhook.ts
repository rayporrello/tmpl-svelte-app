import type { AutomationEvent, AutomationProvider } from '../automation-provider';
import { sendHttpAutomationEvent, type WebhookAuthMode } from './http-delivery';

export interface WebhookProviderOptions {
	authMode?: WebhookAuthMode;
	authHeader?: string;
}

export function makeWebhookProvider(
	webhookUrl?: string,
	webhookSecret?: string,
	options: WebhookProviderOptions = {}
): AutomationProvider {
	return {
		send(event: AutomationEvent) {
			return sendHttpAutomationEvent(
				{
					provider: 'webhook',
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
