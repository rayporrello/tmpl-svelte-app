import type { AutomationEvent, AutomationProvider } from '../automation-provider';
import { sendHttpAutomationEvent } from './http-delivery';

export function makeWebhookProvider(
	webhookUrl?: string,
	webhookSecret?: string
): AutomationProvider {
	return {
		send(event: AutomationEvent) {
			return sendHttpAutomationEvent(
				{ provider: 'webhook', url: webhookUrl, secret: webhookSecret },
				event
			);
		},
	};
}
