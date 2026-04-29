export type ObservabilityTier = 'small' | 'medium' | 'large';

export type LogLevel = 'info' | 'warn' | 'error';

export interface HealthResponse {
	ok: boolean;
	service: string;
	environment: string;
	time: string;
}

/**
 * Legacy observability-facing shape for workflow payload examples.
 * Runtime automation delivery uses src/lib/server/automation/automation-provider.ts.
 */
export interface WorkflowEventPayload {
	event: string;
	version: number;
	occurred_at: string;
	data?: Record<string, unknown>;
}
