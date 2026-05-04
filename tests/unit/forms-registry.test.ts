import { describe, expect, it } from 'vitest';

import { automationEventHandlers } from '../../src/lib/server/automation/registry';
import { businessFormRegistry } from '../../src/lib/server/forms/registry';
import { evaluateFormsRegistry } from '../../scripts/lib/forms-check';

describe('business form registry', () => {
	it('passes the same validation used by bun run forms:check', () => {
		expect(evaluateFormsRegistry().issues).toEqual([]);
	});

	it('maps registered forms to known automation handlers', () => {
		for (const form of businessFormRegistry) {
			if (form.outboxEvent === null) continue;
			expect(automationEventHandlers).toHaveProperty(form.outboxEvent);
		}
	});

	it('documents the contact form source table and PII fields', () => {
		const contact = businessFormRegistry.find((form) => form.id === 'contact');

		expect(contact).toMatchObject({
			route: '/contact',
			sourceTable: 'contact_submissions',
			outboxEvent: 'lead.created',
			storesPii: true,
			piiClassification: 'contact',
			retentionPolicy: 'contactSubmissions',
		});
		expect(contact?.piiFields).toEqual(
			expect.arrayContaining(['name', 'email', 'message', 'user_agent'])
		);
		expect(contact?.inspection.join('\n')).toContain('bun run forms:ops');
	});
});
