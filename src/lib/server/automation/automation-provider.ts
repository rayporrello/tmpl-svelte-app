export type AutomationProviderName = 'n8n' | 'webhook' | 'console' | 'noop';

export const BUSINESS_FORM_SUBMITTED_EVENT = 'business_form.submitted' as const;

export interface LeadCreatedAutomationData {
	submission_id: string;
	name: string;
	email: string;
	source_path?: string | null;
	request_id?: string | null;
}

export interface BusinessFormSubmittedAutomationData {
	form_id: string;
	submission_id: string;
	source_table: string;
	source_path?: string | null;
	request_id?: string | null;
}

export interface AutomationEventDataMap {
	'lead.created': LeadCreatedAutomationData;
	[BUSINESS_FORM_SUBMITTED_EVENT]: BusinessFormSubmittedAutomationData;
}

export type AutomationEventName = keyof AutomationEventDataMap;

export type AutomationEvent<TName extends AutomationEventName = AutomationEventName> = {
	event: TName;
	version: 1;
	occurred_at: string;
	idempotency_key?: string;
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
