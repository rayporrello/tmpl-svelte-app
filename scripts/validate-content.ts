/**
 * Validates Markdown content files under content/ and src/content/.
 * Exits 0 when no content directories exist (pre-Phase 3) or all files pass.
 * Exits 1 on any violation with actionable messages.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';

const CONTENT_DIRS = ['content', 'src/content'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_STATUS = new Set(['draft', 'published', 'archived']);
const NULL_VALUES = new Set(['', 'null', 'undefined']);

const HIGH_RISK_FIELDS = [
	'title',
	'description',
	'publishedAt',
	'updatedAt',
	'status',
	'slug',
	'canonical',
	'featuredImage',
	'seoTitle',
	'seoDescription',
];

// Required fields per content type (matched by directory name)
const REQUIRED_FIELDS: Record<string, string[]> = {
	posts: ['title', 'description', 'publishedAt', 'status'],
	articles: ['title', 'description', 'date'],
	pages: ['title', 'description', 'status'],
};

let errors = 0;
let warnings = 0;

function fail(file: string, field: string, problem: string, fix: string): void {
	console.error(`[FAIL] ${file}`);
	console.error(`       field: ${field}`);
	console.error(`       problem: ${problem}`);
	console.error(`       fix: ${fix}`);
	console.error('');
	errors++;
}

function warn(file: string, field: string, problem: string, fix: string): void {
	console.warn(`[WARN] ${file}`);
	console.warn(`       field: ${field}`);
	console.warn(`       problem: ${problem}`);
	console.warn(`       fix: ${fix}`);
	console.warn('');
	warnings++;
}

function isDateLikeKey(key: string): boolean {
	const lower = key.toLowerCase();
	return (
		lower === 'date' ||
		lower.includes('date') ||
		lower.endsWith('at') || // publishedAt, updatedAt, createdAt, occurredAt
		lower === 'published' ||
		lower === 'created' ||
		lower === 'updated' ||
		lower === 'expires'
	);
}

function isNullValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string' && NULL_VALUES.has(value.trim())) return true;
	return false;
}

function collectMarkdownFiles(dir: string): string[] {
	const files: string[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...collectMarkdownFiles(full));
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				files.push(full);
			}
		}
	} catch {
		// Directory unreadable — skip
	}
	return files;
}

function getContentType(filePath: string): string | null {
	const parts = filePath.replace(/\\/g, '/').split('/');
	for (const [dir] of Object.entries(REQUIRED_FIELDS)) {
		if (parts.includes(dir)) return dir;
	}
	return null;
}

function validateFile(filePath: string): void {
	const rel = relative(process.cwd(), filePath);
	let raw: string;
	try {
		raw = readFileSync(filePath, 'utf-8');
	} catch (err) {
		fail(rel, '(file)', `Cannot read file: ${String(err)}`, 'Check file permissions.');
		return;
	}

	// Must have YAML frontmatter
	if (!raw.startsWith('---')) {
		fail(
			rel,
			'(frontmatter)',
			'File does not start with YAML frontmatter (---).',
			'Add --- frontmatter block at the top of the file.'
		);
		return;
	}

	let data: Record<string, unknown>;
	try {
		const parsed = matter(raw);
		data = parsed.data as Record<string, unknown>;
	} catch (err) {
		fail(
			rel,
			'(frontmatter)',
			`Frontmatter YAML parse error: ${String(err)}`,
			'Fix the YAML syntax in the frontmatter block.'
		);
		return;
	}

	// Required fields for this content type
	const contentType = getContentType(filePath);
	const requiredFields = contentType ? (REQUIRED_FIELDS[contentType] ?? []) : [];

	for (const field of requiredFields) {
		const value = data[field];
		if (value === undefined) {
			fail(rel, field, 'Required field is missing.', `Add "${field}: <value>" to the frontmatter.`);
		} else if (isNullValue(value)) {
			fail(
				rel,
				field,
				`Required field is blank or null (got: ${JSON.stringify(value)}).`,
				`Set "${field}" to a valid non-empty value.`
			);
		}
	}

	// High-risk field checks (warn on blank)
	for (const field of HIGH_RISK_FIELDS) {
		if (!(field in data)) continue;
		const value = data[field];
		if (isNullValue(value)) {
			warn(
				rel,
				field,
				`High-risk field is blank or null (got: ${JSON.stringify(value)}).`,
				`Remove "${field}" from frontmatter if unused, or set a valid value.`
			);
		}
	}

	// Date-like fields: if present, must be ISO 8601 with timezone or omitted
	for (const [key, value] of Object.entries(data)) {
		if (!isDateLikeKey(key)) continue;
		if (value === undefined || value === null) continue; // Omitted is fine

		if (isNullValue(value)) {
			fail(
				rel,
				key,
				`Date-like field saved as blank/null (got: ${JSON.stringify(value)}).`,
				`Remove "${key}" from frontmatter when unused instead of saving as "" or null.`
			);
			continue;
		}

		if (typeof value === 'string') {
			// Allow date-only format (YYYY-MM-DD) for legacy date fields
			const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
			const fullIso = DATE_RE.test(value);
			if (!dateOnly && !fullIso) {
				warn(
					rel,
					key,
					`Date value "${value}" is not ISO 8601 with timezone (e.g. 2026-04-27T12:00:00Z).`,
					`Use ISO 8601 datetime with timezone for stored dates.`
				);
			}
		}
	}

	// status field validation
	if ('status' in data) {
		const status = data['status'];
		if (typeof status === 'string' && !VALID_STATUS.has(status)) {
			fail(
				rel,
				'status',
				`Invalid status value "${status}".`,
				`Set status to one of: draft, published, archived.`
			);
		}
	}

	// slug field validation
	if ('slug' in data) {
		const slug = data['slug'];
		if (typeof slug === 'string' && slug.length > 0 && !SLUG_RE.test(slug)) {
			fail(
				rel,
				'slug',
				`Slug "${slug}" is not URL-safe.`,
				`Use lowercase letters, numbers, and hyphens only (e.g. "my-article-title").`
			);
		}
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────

const existingDirs = CONTENT_DIRS.filter((dir) => existsSync(dir));

if (existingDirs.length === 0) {
	console.log('[INFO] No content directories found. Skipping content validation.');
	process.exit(0);
}

const allFiles = existingDirs.flatMap((dir) => collectMarkdownFiles(dir));

if (allFiles.length === 0) {
	console.log('[INFO] No Markdown content files found. Nothing to validate.');
	process.exit(0);
}

console.log(`Validating ${allFiles.length} Markdown file(s)...\n`);

for (const file of allFiles) {
	validateFile(file);
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (errors > 0) {
	console.error(
		`Content validation: ${errors} error(s), ${warnings} warning(s). Fix errors above.`
	);
	process.exit(1);
} else if (warnings > 0) {
	console.log(`Content validation passed with ${warnings} warning(s). Review warnings above.`);
} else {
	console.log(`Content validation passed (${allFiles.length} file(s)).`);
}
