import { describe, expect, it } from 'vitest';

import {
	parseFormOpsArgs,
	redactAutomationPayload,
	redactEmail,
	redactRecord,
} from '../../scripts/lib/form-ops';

describe('form operator helpers', () => {
	it('parses list and inspect commands with redacted defaults', () => {
		expect(parseFormOpsArgs(['help'])).toMatchObject({ command: 'help' });
		expect(parseFormOpsArgs(['list', '--form=contact', '--limit=5'])).toMatchObject({
			command: 'list',
			formId: 'contact',
			limit: 5,
			showPii: false,
		});
		expect(
			parseFormOpsArgs([
				'inspect',
				'--form',
				'contact',
				'--id',
				'123e4567-e89b-12d3-a456-426614174000',
			])
		).toMatchObject({
			command: 'inspect',
			formId: 'contact',
			id: '123e4567-e89b-12d3-a456-426614174000',
		});
	});

	it('requires confirmation for dead-letter requeue', () => {
		expect(() =>
			parseFormOpsArgs(['dead-letter:requeue', '--id=123e4567-e89b-12d3-a456-426614174000'])
		).toThrow(/--confirm/);
		expect(
			parseFormOpsArgs([
				'dead-letter:requeue',
				'--id=123e4567-e89b-12d3-a456-426614174000',
				'--confirm',
			])
		).toMatchObject({ command: 'dead-letter:requeue', confirm: true });
	});

	it('redacts known PII fields unless explicitly shown', () => {
		const record = {
			id: 'sub-1',
			name: 'Alice Example',
			email: 'alice@example.com',
			message: 'A private message',
		};

		expect(redactEmail('alice@example.com')).toBe('a***@example.com');
		expect(redactRecord(record, ['name', 'email', 'message'], false)).toEqual({
			id: 'sub-1',
			name: '[redacted]',
			email: 'a***@example.com',
			message: '[redacted]',
		});
		expect(redactRecord(record, ['name', 'email', 'message'], true)).toEqual(record);
	});

	it('redacts risky automation payload keys recursively', () => {
		expect(
			redactAutomationPayload(
				{
					submission_id: 'sub-1',
					data: { email: 'alice@example.com', source_path: '/contact' },
				},
				false
			)
		).toEqual({
			submission_id: 'sub-1',
			data: { email: 'a***@example.com', source_path: '/contact' },
		});
	});
});
