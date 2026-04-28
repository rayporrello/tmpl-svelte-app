import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { contactSchema } from '$lib/forms/contact.schema';

const valid = {
	name: 'Alice',
	email: 'alice@example.com',
	message: 'Hello there, I have a question for you.',
};

describe('contactSchema', () => {
	it('accepts valid input', () => {
		expect(v.safeParse(contactSchema, valid).success).toBe(true);
	});

	it('rejects empty name', () => {
		expect(v.safeParse(contactSchema, { ...valid, name: '' }).success).toBe(false);
	});

	it('rejects name over 100 characters', () => {
		expect(v.safeParse(contactSchema, { ...valid, name: 'a'.repeat(101) }).success).toBe(false);
	});

	it('rejects invalid email', () => {
		expect(v.safeParse(contactSchema, { ...valid, email: 'not-an-email' }).success).toBe(false);
	});

	it('rejects empty email', () => {
		expect(v.safeParse(contactSchema, { ...valid, email: '' }).success).toBe(false);
	});

	it('rejects message shorter than 10 characters', () => {
		expect(v.safeParse(contactSchema, { ...valid, message: 'too short' }).success).toBe(false);
	});

	it('rejects message over 2000 characters', () => {
		expect(v.safeParse(contactSchema, { ...valid, message: 'a'.repeat(2001) }).success).toBe(false);
	});

	it('accepts message at exactly 10 characters', () => {
		expect(v.safeParse(contactSchema, { ...valid, message: 'a'.repeat(10) }).success).toBe(true);
	});

	it('accepts message at exactly 2000 characters', () => {
		expect(v.safeParse(contactSchema, { ...valid, message: 'a'.repeat(2000) }).success).toBe(true);
	});
});
