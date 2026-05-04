import type { AutomationEventName } from '../automation/automation-provider';
import { RETENTION_DEFAULTS_DAYS, type RetentionDefaultsDays } from '../privacy/retention';

export type PiiClassification = 'none' | 'contact' | 'sensitive';

export interface BusinessFormRegistryEntry {
	id: string;
	label: string;
	description: string;
	route: string;
	schemaPath: string;
	serverRoutePath: string;
	clientRoutePath: string;
	sourceTable: string;
	outboxEvent: AutomationEventName | null;
	storesPii: boolean;
	piiClassification: PiiClassification;
	piiFields: readonly string[];
	retentionPolicy: keyof RetentionDefaultsDays;
	retentionDays: number;
	docsPath: string;
	inspection: readonly string[];
}

export const businessFormRegistry = [
	{
		id: 'contact',
		label: 'Contact form',
		description:
			'Canonical DB-backed form example for source table, Superforms, outbox, email, and retention wiring.',
		route: '/contact',
		schemaPath: 'src/lib/forms/contact.schema.ts',
		serverRoutePath: 'src/routes/contact/+page.server.ts',
		clientRoutePath: 'src/routes/contact/+page.svelte',
		sourceTable: 'contact_submissions',
		outboxEvent: 'lead.created',
		storesPii: true,
		piiClassification: 'contact',
		piiFields: ['name', 'email', 'message', 'user_agent'],
		retentionPolicy: 'contactSubmissions',
		retentionDays: RETENTION_DEFAULTS_DAYS.contactSubmissions,
		docsPath: 'docs/forms/README.md',
		inspection: [
			'bun run forms:ops -- list --form=contact',
			'bun run forms:ops -- inspect --form=contact --id=<submission-id>',
		],
	},
	// FORM SCAFFOLD: registry entries go above this line.
] as const satisfies readonly BusinessFormRegistryEntry[];

export type BusinessFormId = (typeof businessFormRegistry)[number]['id'];

export function getBusinessFormEntry(id: string): BusinessFormRegistryEntry {
	const entry = businessFormRegistry.find((form) => form.id === id);
	if (!entry) throw new Error(`Unknown business form: ${id}`);
	return entry;
}
