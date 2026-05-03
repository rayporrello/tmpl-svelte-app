import type { AutomationEventName } from '../automation/automation-provider';

export type BusinessFormId = 'contact';

export interface BusinessFormRegistryEntry {
	id: BusinessFormId;
	label: string;
	route: string;
	schemaPath: string;
	serverRoutePath: string;
	clientRoutePath: string;
	sourceTable: string;
	outboxEvent: AutomationEventName | null;
	storesPii: boolean;
	piiFields: readonly string[];
	retentionPolicy: string;
	inspection: readonly string[];
}

export const businessFormRegistry = [
	{
		id: 'contact',
		label: 'Contact form',
		route: '/contact',
		schemaPath: 'src/lib/forms/contact.schema.ts',
		serverRoutePath: 'src/routes/contact/+page.server.ts',
		clientRoutePath: 'src/routes/contact/+page.svelte',
		sourceTable: 'contact_submissions',
		outboxEvent: 'lead.created',
		storesPii: true,
		piiFields: ['name', 'email', 'message', 'user_agent'],
		retentionPolicy: 'contactSubmissions',
		inspection: [
			'bun run db:studio',
			`psql "$DATABASE_URL" -c "select id, created_at, name, email, source_path from contact_submissions order by created_at desc limit 20;"`,
		],
	},
] as const satisfies readonly BusinessFormRegistryEntry[];

export function getBusinessFormEntry(id: BusinessFormId): BusinessFormRegistryEntry {
	const entry = businessFormRegistry.find((form) => form.id === id);
	if (!entry) throw new Error(`Unknown business form: ${id}`);
	return entry;
}
