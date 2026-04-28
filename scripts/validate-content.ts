/**
 * Validates all content files under content/.
 * Pure YAML collections use js-yaml. Markdown articles use gray-matter.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import matter from 'gray-matter';
import { load as yamlLoad } from 'js-yaml';
import {
	ArticleSchema,
	HomePageSchema,
	TeamMemberSchema,
	TestimonialSchema,
} from '../src/lib/content/schemas';
import type { Article, HomePageContent, TeamMember, Testimonial } from '../src/lib/content/types';
import {
	duplicateValueIssues,
	filenameSlugIssue,
	formatContentIssues,
	makeContentIssue,
	type ContentRecord,
	type ContentValidationIssue,
	validateWithSchema,
} from '../src/lib/content/validation';

const CONTENT_DIR = 'content';
const STATIC_DIR = 'static';

type CollectionName = 'pages' | 'articles' | 'team' | 'testimonials';

const errors: ContentValidationIssue[] = [];
const warnings: ContentValidationIssue[] = [];

const articleRecords: ContentRecord<Article>[] = [];
const teamRecords: ContentRecord<TeamMember>[] = [];
const testimonialRecords: ContentRecord<Testimonial>[] = [];

function rel(path: string): string {
	return relative(process.cwd(), path);
}

function collectFiles(dir: string, extensions: string[]): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...collectFiles(full, extensions));
		else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) files.push(full);
	}
	return files.sort();
}

function parseYamlFile(file: string): unknown | undefined {
	try {
		return yamlLoad(readFileSync(file, 'utf-8'));
	} catch (err) {
		errors.push(
			makeContentIssue(
				rel(file),
				'(file)',
				'YAML parse error',
				err instanceof Error ? err.message : String(err)
			)
		);
		return undefined;
	}
}

function parseArticleFile(file: string): Record<string, unknown> | undefined {
	let raw: string;
	try {
		raw = readFileSync(file, 'utf-8');
	} catch (err) {
		errors.push(
			makeContentIssue(
				rel(file),
				'(file)',
				'cannot read file',
				err instanceof Error ? err.message : String(err)
			)
		);
		return undefined;
	}

	if (!raw.startsWith('---')) {
		errors.push(
			makeContentIssue(rel(file), '(frontmatter)', 'must start with YAML frontmatter', undefined)
		);
		return undefined;
	}

	try {
		const parsed = matter(raw);
		return { ...(parsed.data as Record<string, unknown>), body: parsed.content };
	} catch (err) {
		errors.push(
			makeContentIssue(
				rel(file),
				'(frontmatter)',
				'frontmatter YAML parse error',
				err instanceof Error ? err.message : String(err)
			)
		);
		return undefined;
	}
}

function addImagePathChecks(file: string, values: Record<string, unknown>, fields: string[]): void {
	for (const field of fields) {
		const value = values[field];
		if (typeof value !== 'string' || value.trim().length === 0) continue;
		const trimmed = value.trim();
		if (trimmed.startsWith('https://')) continue;
		if (trimmed.startsWith('http://')) {
			warnings.push(
				makeContentIssue(file, field, 'should use https:// for remote images', trimmed, 'warning')
			);
			continue;
		}
		const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
		const onDisk = join(STATIC_DIR, normalized);
		if (!existsSync(onDisk)) {
			errors.push(
				makeContentIssue(file, field, 'referenced image does not exist on disk', trimmed)
			);
		}
	}
}

function addCtaWarnings(file: string, home: HomePageContent): void {
	const ctas = [
		['hero.primary_cta.href', home.hero.primary_cta?.href],
		['hero.secondary_cta.href', home.hero.secondary_cta?.href],
	] as const;

	for (const [path, href] of ctas) {
		if (href?.startsWith('http://')) {
			warnings.push(
				makeContentIssue(file, path, 'should use https:// for remote CTA links', href, 'warning')
			);
		}
	}
}

function validateHome(file: string): void {
	const parsed = parseYamlFile(file);
	if (parsed === undefined) return;
	const fileLabel = rel(file);
	const result = validateWithSchema(HomePageSchema, parsed, fileLabel);
	if (!result.success) {
		errors.push(...result.issues);
		return;
	}
	addCtaWarnings(fileLabel, result.output);
}

function validateArticle(file: string): void {
	const parsed = parseArticleFile(file);
	if (parsed === undefined) return;
	const fileLabel = rel(file);
	const result = validateWithSchema(ArticleSchema, parsed, fileLabel);
	if (!result.success) {
		errors.push(...result.issues);
		return;
	}

	const expectedSlug = basename(file, '.md');
	const slugIssue = filenameSlugIssue(fileLabel, result.output.slug, expectedSlug);
	if (slugIssue) errors.push(slugIssue);

	addImagePathChecks(fileLabel, result.output, ['image', 'og_image']);
	articleRecords.push({ file: fileLabel, value: result.output });
}

function validateTeam(file: string): void {
	const parsed = parseYamlFile(file);
	if (parsed === undefined) return;
	const fileLabel = rel(file);
	const result = validateWithSchema(TeamMemberSchema, parsed, fileLabel);
	if (!result.success) {
		errors.push(...result.issues);
		return;
	}

	const expectedSlug = basename(file).replace(/\.ya?ml$/, '');
	const slugIssue = filenameSlugIssue(fileLabel, result.output.slug, expectedSlug);
	if (slugIssue) errors.push(slugIssue);

	addImagePathChecks(fileLabel, result.output, ['photo']);
	teamRecords.push({ file: fileLabel, value: result.output });
}

function validateTestimonial(file: string): void {
	const parsed = parseYamlFile(file);
	if (parsed === undefined) return;
	const fileLabel = rel(file);
	const result = validateWithSchema(TestimonialSchema, parsed, fileLabel);
	if (!result.success) {
		errors.push(...result.issues);
		return;
	}

	const expectedSlug = basename(file).replace(/\.ya?ml$/, '');
	const slugIssue = filenameSlugIssue(fileLabel, result.output.slug, expectedSlug);
	if (slugIssue) errors.push(slugIssue);

	addImagePathChecks(fileLabel, result.output, ['photo']);
	testimonialRecords.push({ file: fileLabel, value: result.output });
}

function validateCollection(collection: CollectionName): void {
	if (collection === 'pages') {
		const homePath = join(CONTENT_DIR, 'pages', 'home.yml');
		if (existsSync(homePath)) validateHome(homePath);
		return;
	}

	if (collection === 'articles') {
		for (const file of collectFiles(join(CONTENT_DIR, 'articles'), ['.md'])) validateArticle(file);
		return;
	}

	if (collection === 'team') {
		for (const file of collectFiles(join(CONTENT_DIR, 'team'), ['.yml', '.yaml']))
			validateTeam(file);
		return;
	}

	for (const file of collectFiles(join(CONTENT_DIR, 'testimonials'), ['.yml', '.yaml'])) {
		validateTestimonial(file);
	}
}

if (!existsSync(CONTENT_DIR)) {
	console.log('[INFO] No content directory found. Skipping content validation.');
	process.exit(0);
}

validateCollection('pages');
validateCollection('articles');
validateCollection('team');
validateCollection('testimonials');

errors.push(...duplicateValueIssues(articleRecords, (record) => record.slug, 'slug'));
errors.push(...duplicateValueIssues(teamRecords, (record) => record.slug, 'slug'));
errors.push(...duplicateValueIssues(testimonialRecords, (record) => record.slug, 'slug'));
errors.push(...duplicateValueIssues(teamRecords, (record) => record.order, 'order'));
errors.push(...duplicateValueIssues(testimonialRecords, (record) => record.order, 'order'));

const errorOutput = formatContentIssues(errors);
const warningOutput = formatContentIssues(warnings, 'warning');

if (errorOutput) {
	console.error(errorOutput);
	if (warningOutput) console.warn(`\n${warningOutput}`);
	process.exit(1);
}

if (warningOutput) {
	console.warn(warningOutput);
	console.log('Content validation passed with warnings.');
} else {
	console.log('Content validation passed.');
}
