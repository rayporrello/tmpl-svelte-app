import type { AutomationProvider } from '../automation-provider';

export const noopAutomationProvider: AutomationProvider = {
	async send() {
		return {
			ok: true,
			provider: 'noop',
			delivered: false,
			skipped: true,
			reason: 'disabled',
		};
	},
};
