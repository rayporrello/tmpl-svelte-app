import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { load } from 'js-yaml';
import { HomePageSchema } from './schemas.js';
import type { HomePageContent } from './types.js';
import { handleRuntimeContentFailure, makeContentIssue, validateWithSchema } from './validation.js';

const CONTENT_DIR = join(process.cwd(), 'content');

interface PageLoadOptions {
	contentDir?: string;
}

/**
 * Load a pure YAML page file from content/pages/.
 * Uses js-yaml — NOT gray-matter. Pure YAML files have no frontmatter delimiters.
 */
export function loadPage<T = unknown>(filename: string, options: PageLoadOptions = {}): T {
	const contentDir = options.contentDir ?? CONTENT_DIR;
	const filepath = join(contentDir, 'pages', filename);
	const fileLabel = relative(process.cwd(), filepath);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Content file not found: ${fileLabel}`);
	}
	let parsed: unknown;
	try {
		parsed = load(raw);
	} catch (err) {
		const issues = [
			makeContentIssue(
				fileLabel,
				'(file)',
				'YAML parse error',
				err instanceof Error ? err.message : String(err)
			),
		];
		const dropped = handleRuntimeContentFailure<T>('pages', fileLabel, issues);
		if (dropped === undefined)
			throw new Error(`Content file invalid: ${fileLabel}`, { cause: err });
		return dropped;
	}

	if (filename === 'home.yml') {
		const result = validateWithSchema(HomePageSchema, parsed, fileLabel);
		if (result.success) return result.output as T;
		const dropped = handleRuntimeContentFailure<T>('pages', fileLabel, result.issues);
		if (dropped === undefined) throw new Error(`Content file invalid: ${fileLabel}`);
		return dropped;
	}

	return parsed as T;
}

export function loadHomePage(options: PageLoadOptions = {}): HomePageContent {
	return loadPage<HomePageContent>('home.yml', options);
}
