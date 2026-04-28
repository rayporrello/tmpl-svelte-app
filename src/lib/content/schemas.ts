import * as v from 'valibot';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FUTURE_PUBLISHED_DATE_MESSAGE = 'published article cannot have future date';

const NULLISH_TEXT = new Set(['null', 'undefined']);
const STATIC_OR_REMOTE_IMAGE_RE = /^(\/(?!\/)\S+|https?:\/\/\S+)$/;

function isForbiddenText(value: string): boolean {
	return NULLISH_TEXT.has(value.trim().toLowerCase());
}

export function blankToUndefined(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function optionalEntry<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
	return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export function requiredString() {
	return v.pipe(
		v.string('must be a string'),
		v.trim(),
		v.nonEmpty('is required'),
		v.check((value) => !isForbiddenText(value), 'must be a real value')
	);
}

export function optionalBlankableString() {
	return v.pipe(
		v.optional(v.string('must be a string')),
		v.transform(blankToUndefined),
		v.check(
			(value) => value === undefined || !isForbiddenText(value),
			'must be omitted or a real value'
		)
	);
}

function optionalRawString() {
	return v.pipe(
		v.optional(v.string('must be a string')),
		v.check(
			(value) => value === undefined || !isForbiddenText(value),
			'must be omitted or a real value'
		)
	);
}

export const slugString = v.pipe(
	requiredString(),
	v.regex(SLUG_PATTERN, 'must use lowercase letters, numbers, and hyphens')
);

function hasValidCalendarDate(value: string): boolean {
	const [year, month, day] = value.split('-').map(Number);
	if (!year || !month || !day) return false;
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

export const isoDateWithCalendarCheck = v.pipe(
	requiredString(),
	v.isoDate('must be an ISO date in YYYY-MM-DD format'),
	v.check(hasValidCalendarDate, 'must be a valid calendar date')
);

export const optionalIsoDateWithCalendarCheck = v.pipe(
	optionalBlankableString(),
	v.check(
		(value) => value === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value),
		'must be an ISO date in YYYY-MM-DD format'
	),
	v.check(
		(value) => value === undefined || hasValidCalendarDate(value),
		'must be a valid calendar date'
	)
);

export const imagePath = v.pipe(
	optionalRawString(),
	v.check(
		(value) =>
			value === undefined || value.trim() === '' || STATIC_OR_REMOTE_IMAGE_RE.test(value.trim()),
		'must be a site-relative path or http(s) URL'
	)
);

function isSafeCtaHref(value: string): boolean {
	if (value.startsWith('#')) return /^#[A-Za-z0-9_-]+$/.test(value);
	if (value.startsWith('/')) return !value.startsWith('//') && !/\s/.test(value);
	if (value.startsWith('https://')) return !/\s/.test(value);
	if (value.startsWith('http://')) return !/\s/.test(value);
	if (value.startsWith('mailto:')) return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
	if (value.startsWith('tel:')) return /^tel:\+?[0-9().\-\s]+$/.test(value);
	return false;
}

export const ctaHref = v.pipe(
	requiredString(),
	v.check(isSafeCtaHref, 'must be #anchor, /path, http(s)://, mailto:, or tel:')
);

export function intInRange(min: number, max: number) {
	return v.pipe(
		v.number('must be a number'),
		v.integer('must be an integer'),
		v.minValue(min, `must be at least ${min}`),
		v.maxValue(max, `must be at most ${max}`)
	);
}

const orderNumber = v.pipe(v.number('must be a number'), v.integer('must be an integer'));

const optionalRating = v.pipe(
	v.optional(v.union([intInRange(1, 5), v.literal('')])),
	v.transform((value) => (value === '' ? undefined : value))
);

const optionalEmail = v.pipe(
	optionalBlankableString(),
	v.check(
		(value) => value === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
		'must be a valid email'
	)
);

const CtaSchema = v.strictObject({
	label: requiredString(),
	href: ctaHref,
});

const HeroSchema = v.strictObject({
	eyebrow: optionalBlankableString(),
	headline: requiredString(),
	subheadline: optionalBlankableString(),
	primary_cta: v.optional(CtaSchema),
	secondary_cta: v.optional(CtaSchema),
});

const HomeSectionItemSchema = v.strictObject({
	text: requiredString(),
});

const HomeSectionSchema = v.strictObject({
	title: requiredString(),
	body: requiredString(),
	items: v.optional(v.array(HomeSectionItemSchema, 'must be a list')),
});

export const HomePageSchema = v.strictObject({
	title: requiredString(),
	description: requiredString(),
	hero: HeroSchema,
	sections: v.optional(v.array(HomeSectionSchema, 'must be a list')),
});

const TeamMemberRawSchema = v.strictObject({
	name: requiredString(),
	slug: slugString,
	role: requiredString(),
	photo: imagePath,
	photo_alt: optionalRawString(),
	bio: optionalBlankableString(),
	email: optionalEmail,
	order: orderNumber,
	active: v.boolean('must be true or false'),
});

export const TeamMemberSchema = v.pipe(
	TeamMemberRawSchema,
	v.forward(
		v.partialCheck(
			[['photo'], ['photo_alt']],
			(input) => !blankToUndefined(input.photo) || Boolean(blankToUndefined(input.photo_alt)),
			'required when photo is set'
		),
		['photo_alt']
	),
	v.transform((input) => ({
		name: input.name,
		slug: input.slug,
		role: input.role,
		...optionalEntry('photo', blankToUndefined(input.photo)),
		...optionalEntry('photo_alt', blankToUndefined(input.photo_alt)),
		...optionalEntry('bio', input.bio),
		...optionalEntry('email', input.email),
		order: input.order,
		active: input.active,
	}))
);

const TestimonialRawSchema = v.strictObject({
	name: requiredString(),
	slug: slugString,
	quote: requiredString(),
	source: optionalBlankableString(),
	rating: optionalRating,
	photo: imagePath,
	photo_alt: optionalRawString(),
	order: orderNumber,
	published: v.boolean('must be true or false'),
});

export const TestimonialSchema = v.pipe(
	TestimonialRawSchema,
	v.forward(
		v.partialCheck(
			[['photo'], ['photo_alt']],
			(input) => !blankToUndefined(input.photo) || Boolean(blankToUndefined(input.photo_alt)),
			'required when photo is set'
		),
		['photo_alt']
	),
	v.transform((input) => ({
		name: input.name,
		slug: input.slug,
		quote: input.quote,
		...optionalEntry('source', input.source),
		...optionalEntry('rating', input.rating),
		...optionalEntry('photo', blankToUndefined(input.photo)),
		...optionalEntry('photo_alt', blankToUndefined(input.photo_alt)),
		order: input.order,
		published: input.published,
	}))
);

function todayDateOnly(): string {
	return new Date().toISOString().slice(0, 10);
}

const ArticleRawSchema = v.strictObject({
	title: requiredString(),
	slug: slugString,
	description: requiredString(),
	date: isoDateWithCalendarCheck,
	modified_date: optionalIsoDateWithCalendarCheck,
	draft: v.boolean('must be true or false'),
	image: imagePath,
	image_alt: optionalRawString(),
	og_image: imagePath,
	og_image_alt: optionalRawString(),
	body: requiredString(),
});

export const ArticleSchema = v.pipe(
	ArticleRawSchema,
	v.forward(
		v.partialCheck(
			[['image'], ['image_alt']],
			(input) => !blankToUndefined(input.image) || Boolean(blankToUndefined(input.image_alt)),
			'required when image is set'
		),
		['image_alt']
	),
	v.forward(
		v.partialCheck(
			[['og_image'], ['og_image_alt']],
			(input) => !blankToUndefined(input.og_image) || Boolean(blankToUndefined(input.og_image_alt)),
			'required when og_image is set'
		),
		['og_image_alt']
	),
	v.forward(
		v.partialCheck(
			[['date'], ['modified_date']],
			(input) => input.modified_date === undefined || input.modified_date >= input.date,
			'must not be before date'
		),
		['modified_date']
	),
	v.forward(
		v.partialCheck(
			[['date'], ['draft']],
			(input) => input.draft || input.date <= todayDateOnly(),
			FUTURE_PUBLISHED_DATE_MESSAGE
		),
		['date']
	),
	v.transform((input) => ({
		title: input.title,
		slug: input.slug,
		description: input.description,
		date: input.date,
		...optionalEntry('modified_date', input.modified_date),
		draft: input.draft,
		...optionalEntry('image', blankToUndefined(input.image)),
		...optionalEntry('image_alt', blankToUndefined(input.image_alt)),
		...optionalEntry('og_image', blankToUndefined(input.og_image)),
		...optionalEntry('og_image_alt', blankToUndefined(input.og_image_alt)),
		body: input.body,
	}))
);

export type HomePageContent = v.InferOutput<typeof HomePageSchema>;
export type TeamMember = v.InferOutput<typeof TeamMemberSchema>;
export type Testimonial = v.InferOutput<typeof TestimonialSchema>;
export type Article = v.InferOutput<typeof ArticleSchema>;
export type ArticleFrontmatter = Omit<Article, 'body'>;

export const contentSchemas = {
	pages: {
		home: HomePageSchema,
	},
	articles: ArticleSchema,
	team: TeamMemberSchema,
	testimonials: TestimonialSchema,
} as const;
