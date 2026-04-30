import * as v from 'valibot';

export const contactSchema = v.object({
	name: v.pipe(
		v.string(),
		v.minLength(1, 'Name is required'),
		v.maxLength(100, 'Name must be 100 characters or fewer')
	),
	email: v.pipe(
		v.string(),
		v.minLength(1, 'Email is required'),
		v.email('Please enter a valid email address')
	),
	message: v.pipe(
		v.string(),
		v.minLength(10, 'Message must be at least 10 characters'),
		v.maxLength(2000, 'Message must be 2000 characters or fewer')
	),
	// Honeypot — bots fill this; real users never see it (visually hidden,
	// off tab order, aria-hidden). The action returns silent success on any
	// non-empty value. See routes/contact/+page.server.ts.
	website: v.optional(v.string(), ''),
});

export type ContactInput = v.InferInput<typeof contactSchema>;
export type ContactOutput = v.InferOutput<typeof contactSchema>;
