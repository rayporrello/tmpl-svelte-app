import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { HomePageContent } from './types.js';

const CONTENT_DIR = join(process.cwd(), 'content');

/**
 * Load a pure YAML page file from content/pages/.
 * Uses js-yaml — NOT gray-matter. Pure YAML files have no frontmatter delimiters.
 */
export function loadPage<T = unknown>(filename: string): T {
	const filepath = join(CONTENT_DIR, 'pages', filename);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Content file not found: content/pages/${filename}`);
	}
	try {
		return load(raw) as T;
	} catch (err) {
		throw new Error(`YAML parse error in content/pages/${filename}: ${err}`, { cause: err });
	}
}

export function loadHomePage(): HomePageContent {
	return loadPage<HomePageContent>('home.yml');
}
