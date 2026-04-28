import { describe, it, expect } from 'vitest';
import { signWebhookPayload } from '$lib/server/automation/signing';

describe('signWebhookPayload()', () => {
	it('produces a 64-character hex string', () => {
		expect(signWebhookPayload('hello', 'secret')).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is deterministic for the same inputs', () => {
		expect(signWebhookPayload('payload', 'secret')).toBe(signWebhookPayload('payload', 'secret'));
	});

	it('produces different signatures for different payloads', () => {
		expect(signWebhookPayload('payload-a', 'secret')).not.toBe(
			signWebhookPayload('payload-b', 'secret')
		);
	});

	it('produces different signatures for different secrets', () => {
		expect(signWebhookPayload('payload', 'secret-1')).not.toBe(
			signWebhookPayload('payload', 'secret-2')
		);
	});

	it('handles empty payload', () => {
		expect(signWebhookPayload('', 'secret')).toMatch(/^[0-9a-f]{64}$/);
	});
});
