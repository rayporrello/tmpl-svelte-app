import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { Testimonial } from './types.js';

const TESTIMONIALS_DIR = join(process.cwd(), 'content', 'testimonials');

/**
 * Load a single testimonial by slug.
 * Files live in content/testimonials/<slug>.yml as pure YAML (no frontmatter delimiters).
 */
export function loadTestimonial(slug: string): Testimonial {
	const filepath = join(TESTIMONIALS_DIR, `${slug}.yml`);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Testimonial not found: content/testimonials/${slug}.yml`);
	}
	try {
		return load(raw) as Testimonial;
	} catch (err) {
		throw new Error(`YAML parse error in content/testimonials/${slug}.yml: ${err}`, { cause: err });
	}
}

/**
 * Load all testimonials.
 * Unpublished testimonials are excluded by default. Pass `{ includeUnpublished: true }` to include them.
 * Results are sorted by the `order` field ascending.
 */
export function loadTestimonials({ includeUnpublished = false } = {}): Testimonial[] {
	let entries: string[];
	try {
		entries = readdirSync(TESTIMONIALS_DIR).filter((f: string) => f.endsWith('.yml'));
	} catch {
		return [];
	}
	return entries
		.map((filename) => loadTestimonial(filename.replace(/\.yml$/, '')))
		.filter((t) => includeUnpublished || t.published)
		.sort((a, b) => a.order - b.order);
}
