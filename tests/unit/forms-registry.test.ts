import { describe, expect, it } from 'vitest';

import { automationEventHandlers } from '../../src/lib/server/automation/registry';
import { businessFormRegistry } from '../../src/lib/server/forms/registry';

describe('business form registry', () => {
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
		});
		expect(contact?.piiFields).toEqual(
			expect.arrayContaining(['name', 'email', 'message', 'user_agent'])
		);
	});
});
