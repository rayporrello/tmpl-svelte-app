import type { AutomationEvent, AutomationProvider } from '../automation-provider';
import { sendHttpAutomationEvent } from './http-delivery';

export function makeN8nProvider(webhookUrl?: string, webhookSecret?: string): AutomationProvider {
	return {
		send(event: AutomationEvent) {
			return sendHttpAutomationEvent(
				{ provider: 'n8n', url: webhookUrl, secret: webhookSecret },
				event
			);
		},
	};
}
