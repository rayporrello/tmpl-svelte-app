import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	ArticleSchema,
	HomePageSchema,
	TeamMemberSchema,
	TestimonialSchema,
} from '$lib/content/schemas';
import { formatContentIssues, valibotIssuesToContentIssues } from '$lib/content/validation';

const validHome = {
	title: 'Home',
	description: 'A useful site description.',
	hero: {
		eyebrow: '',
		headline: 'Welcome',
		subheadline: '',
		primary_cta: { label: 'Start', href: '#start' },
	},
	sections: [{ title: 'Features', body: 'What the site offers.', items: [{ text: 'Fast' }] }],
};

const validTeamMember = {
	name: 'Jane Doe',
	slug: 'jane-doe',
	role: 'Designer',
	photo: '',
	photo_alt: '',
	bio: '',
	email: '',
	order: 1,
	active: true,
};

const validTestimonial = {
	name: 'Casey Lee',
	slug: 'casey-lee',
	quote: 'The process was clear and fast.',
	source: '',
	rating: 5,
	photo: '',
	photo_alt: '',
	order: 1,
	published: false,
};

const validArticle = {
	title: 'Getting Started',
	slug: 'getting-started',
	description: 'A useful article description.',
	date: '2026-04-27',
	modified_date: '',
	draft: true,
	image: '',
	image_alt: '',
	og_image: '',
	og_image_alt: '',
	body: 'Article body.',
};

function futureDate(): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

describe('content schemas', () => {
	it('accepts valid home content and normalizes optional blank strings', () => {
		const result = v.safeParse(HomePageSchema, validHome);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.hero.eyebrow).toBeUndefined();
			expect(result.output.hero.subheadline).toBeUndefined();
		}
	});

	it('rejects missing required home fields', () => {
		const result = v.safeParse(HomePageSchema, { ...validHome, title: '' });
		expect(result.success).toBe(false);
	});

	it('normalizes optional team blanks and rejects string booleans', () => {
		const result = v.safeParse(TeamMemberSchema, validTeamMember);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.photo).toBeUndefined();
			expect(result.output.email).toBeUndefined();
		}

		expect(v.safeParse(TeamMemberSchema, { ...validTeamMember, active: 'true' }).success).toBe(
			false
		);
	});

	it('rejects bad slugs and non-integer order values', () => {
		expect(v.safeParse(TeamMemberSchema, { ...validTeamMember, slug: 'Jane_Doe' }).success).toBe(
			false
		);
		expect(v.safeParse(TeamMemberSchema, { ...validTeamMember, order: '3' }).success).toBe(false);
	});

	it('requires photo_alt when photo is set', () => {
		const result = v.safeParse(TeamMemberSchema, {
			...validTeamMember,
			photo: '/uploads/jane.jpg',
			photo_alt: '',
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issues = valibotIssuesToContentIssues('content/team/jane-doe.yml', result.issues);
			expect(formatContentIssues(issues)).toContain(
				'photo_alt: required when photo is set (got "")'
			);
		}
	});

	it('validates testimonial ratings as optional integers from 1 to 5', () => {
		expect(v.safeParse(TestimonialSchema, validTestimonial).success).toBe(true);
		expect(v.safeParse(TestimonialSchema, { ...validTestimonial, rating: '' }).success).toBe(true);
		expect(v.safeParse(TestimonialSchema, { ...validTestimonial, rating: 6 }).success).toBe(false);
		expect(v.safeParse(TestimonialSchema, { ...validTestimonial, rating: 2.5 }).success).toBe(
			false
		);
	});

	it('validates article dates as real calendar dates', () => {
		expect(v.safeParse(ArticleSchema, validArticle).success).toBe(true);
		expect(v.safeParse(ArticleSchema, { ...validArticle, date: '2023-06-31' }).success).toBe(false);
		expect(v.safeParse(ArticleSchema, { ...validArticle, date: '2023-6-1' }).success).toBe(false);
	});

	it('allows future draft articles and rejects future published articles', () => {
		const date = futureDate();
		expect(v.safeParse(ArticleSchema, { ...validArticle, date, draft: true }).success).toBe(true);
		expect(v.safeParse(ArticleSchema, { ...validArticle, date, draft: false }).success).toBe(false);
	});

	it('rejects modified_date before date', () => {
		expect(
			v.safeParse(ArticleSchema, {
				...validArticle,
				date: '2026-04-27',
				modified_date: '2026-04-26',
			}).success
		).toBe(false);
	});
});
