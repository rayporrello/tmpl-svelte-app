import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { load } from 'js-yaml';
import { TestimonialSchema } from './schemas.js';
import type { Testimonial } from './types.js';
import {
	duplicateValueIssues,
	filenameSlugIssue,
	handleRuntimeContentFailure,
	makeContentIssue,
	type ContentRecord,
	validateWithSchema,
} from './validation.js';

const TESTIMONIALS_DIR = join(process.cwd(), 'content', 'testimonials');

interface TestimonialLoadOptions {
	testimonialsDir?: string;
	extension?: '.yml' | '.yaml';
}

interface TestimonialsLoadOptions extends TestimonialLoadOptions {
	includeUnpublished?: boolean;
}

function loadTestimonialRecord(
	slug: string,
	{ testimonialsDir = TESTIMONIALS_DIR, extension = '.yml' }: TestimonialLoadOptions = {}
): Testimonial | undefined {
	const filepath = join(testimonialsDir, `${slug}${extension}`);
	const fileLabel = relative(process.cwd(), filepath);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Testimonial not found: ${fileLabel}`);
	}

	let parsed: unknown;
	try {
		parsed = load(raw);
	} catch (err) {
		return handleRuntimeContentFailure<Testimonial>('testimonials', fileLabel, [
			makeContentIssue(
				fileLabel,
				'(file)',
				'YAML parse error',
				err instanceof Error ? err.message : String(err)
			),
		]);
	}

	const result = validateWithSchema(TestimonialSchema, parsed, fileLabel);
	if (!result.success) {
		return handleRuntimeContentFailure<Testimonial>('testimonials', fileLabel, result.issues);
	}

	const slugIssue = filenameSlugIssue(fileLabel, result.output.slug, slug);
	if (slugIssue) {
		return handleRuntimeContentFailure<Testimonial>('testimonials', fileLabel, [slugIssue]);
	}

	return result.output;
}

/**
 * Load a single testimonial by slug.
 * Files live in content/testimonials/<slug>.yml as pure YAML (no frontmatter delimiters).
 */
export function loadTestimonial(slug: string, options: TestimonialLoadOptions = {}): Testimonial {
	const testimonial = loadTestimonialRecord(slug, options);
	if (!testimonial) throw new Error(`Testimonial not found: content/testimonials/${slug}.yml`);
	return testimonial;
}

/**
 * Load all testimonials.
 * Unpublished testimonials are excluded by default. Pass `{ includeUnpublished: true }` to include them.
 * Results are sorted by the `order` field ascending.
 */
export function loadTestimonials({
	includeUnpublished = false,
	testimonialsDir = TESTIMONIALS_DIR,
}: TestimonialsLoadOptions = {}): Testimonial[] {
	let entries: string[];
	try {
		entries = readdirSync(testimonialsDir).filter(
			(f: string) => f.endsWith('.yml') || f.endsWith('.yaml')
		);
	} catch {
		return [];
	}

	const records: ContentRecord<Testimonial>[] = entries
		.map((filename) => {
			const slug = filename.replace(/\.ya?ml$/, '');
			const extension = filename.endsWith('.yaml') ? '.yaml' : '.yml';
			const value = loadTestimonialRecord(slug, { testimonialsDir, extension });
			return value
				? { file: relative(process.cwd(), join(testimonialsDir, filename)), value }
				: undefined;
		})
		.filter((record): record is ContentRecord<Testimonial> => record !== undefined);

	const duplicateOrderIssues = duplicateValueIssues(records, (record) => record.order, 'order');
	if (duplicateOrderIssues.length > 0) {
		const duplicateFiles = new Set(duplicateOrderIssues.map((issue) => issue.file));
		handleRuntimeContentFailure<Testimonial[]>(
			'testimonials',
			'content/testimonials',
			duplicateOrderIssues
		);
		return records
			.filter((record) => !duplicateFiles.has(record.file))
			.map((record) => record.value)
			.filter((t) => includeUnpublished || t.published)
			.sort((a, b) => a.order - b.order);
	}

	return records
		.map((record) => record.value)
		.filter((t) => includeUnpublished || t.published)
		.sort((a, b) => a.order - b.order);
}
