import { logger } from '$lib/server/logger';
import type { AutomationEvent, AutomationProvider } from '../automation-provider';

export const consoleAutomationProvider: AutomationProvider = {
	async send(event: AutomationEvent) {
		logger.info('automation event', {
			provider: 'console',
			event: event.event,
			version: event.version,
			occurred_at: event.occurred_at,
			dataKeys: Object.keys(event.data),
		});

		return { ok: true, provider: 'console', delivered: true };
	},
};
