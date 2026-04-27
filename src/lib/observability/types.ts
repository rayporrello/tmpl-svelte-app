export type ObservabilityTier = 'small' | 'medium' | 'large';

export type LogLevel = 'info' | 'warn' | 'error';

export interface HealthResponse {
	ok: boolean;
	service: string;
	environment: string;
	time: string;
}

/**
 * Typed payload for website-to-n8n webhook events.
 * Extend `payload` with event-specific fields per workflow.
 */
export interface WorkflowEventPayload {
	request_id: string;
	site_id: string;
	environment: string;
	event_type: string;
	occurred_at: string;
	idempotency_key: string;
	payload_version: string;
	payload?: Record<string, unknown>;
}
