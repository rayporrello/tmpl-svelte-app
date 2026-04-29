export const RETENTION_DEFAULTS_DAYS = {
	contactSubmissions: 90,
	automationEventsCompleted: 30,
	automationEventsFailed: 60,
	automationDeadLetters: 30,
} as const;

export type RetentionDefaultsDays = typeof RETENTION_DEFAULTS_DAYS;
