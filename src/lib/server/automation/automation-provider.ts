export type AutomationProviderName = 'n8n' | 'webhook' | 'console' | 'noop';

export interface LeadCreatedAutomationData {
	submission_id: string;
	name: string;
	email: string;
	source_path?: string | null;
	request_id?: string | null;
}

export interface AutomationEventDataMap {
	'lead.created': LeadCreatedAutomationData;
}

export type AutomationEventName = keyof AutomationEventDataMap;

export type AutomationEvent<TName extends AutomationEventName = AutomationEventName> = {
	event: TName;
	version: 1;
	occurred_at: string;
	data: AutomationEventDataMap[TName];
};

export type AutomationSendResult =
	| { ok: true; provider: AutomationProviderName; delivered: true; status?: number }
	| {
			ok: true;
			provider: AutomationProviderName;
			delivered: false;
			skipped: true;
			reason: 'disabled' | 'not_configured';
	  }
	| {
			ok: false;
			provider: AutomationProviderName;
			failure: 'timeout' | 'network' | 'http' | 'configuration';
			error: string;
			status?: number;
	  };

export interface AutomationProvider {
	send(event: AutomationEvent): Promise<AutomationSendResult>;
}
