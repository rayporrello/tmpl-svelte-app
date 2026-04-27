/**
 * Detects destructive content changes before commit/deploy.
 * Inspects changed Markdown files under approved content directories using git.
 * Exits 0 when not in a git repo, no content files changed, or all checks pass.
 * Exits 1 on detected destructive changes with actionable messages.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import matter from 'gray-matter';

const CONTENT_DIRS = ['content/', 'src/content/'];
const NULL_VALUES = new Set(['', 'null', 'undefined']);

let errors = 0;
let warnings = 0;

function fail(file: string, problem: string): void {
	console.error(`[FAIL] ${file}`);
	console.error(`       ${problem}`);
	console.error(`       → Inspect the content diff manually before proceeding.\n`);
	errors++;
}

function warn(msg: string): void {
	console.warn(`[WARN] ${msg}`);
	warnings++;
}

function isNullValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string' && NULL_VALUES.has(value.trim())) return true;
	return false;
}

function runGit(cmd: string): string | null {
	try {
		return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
	} catch {
		return null;
	}
}

function isInGitRepo(): boolean {
	return runGit('git rev-parse --is-inside-work-tree') === 'true';
}

function getChangedContentFiles(): string[] {
	// Get files changed vs. HEAD (staged + unstaged)
	const staged = runGit('git diff --cached --name-only --diff-filter=ACM') ?? '';
	const unstaged = runGit('git diff --name-only --diff-filter=ACM') ?? '';
	const all = [...new Set([...staged.split('\n'), ...unstaged.split('\n')])].filter(Boolean);
	return all.filter(
		(f) => f.endsWith('.md') && CONTENT_DIRS.some((dir) => f.startsWith(dir))
	);
}

function getHeadContent(filePath: string): string | null {
	return runGit(`git show HEAD:${filePath}`);
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
	try {
		if (!raw.startsWith('---')) return null;
		const parsed = matter(raw);
		return parsed.data as Record<string, unknown>;
	} catch {
		return null;
	}
}

function getBodyContent(raw: string): string {
	try {
		return matter(raw).content ?? '';
	} catch {
		return raw;
	}
}

function countFrontmatterKeys(data: Record<string, unknown> | null): number {
	if (!data) return 0;
	return Object.keys(data).length;
}

function checkFile(filePath: string): void {
	const currentRaw = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null;
	const headRaw = getHeadContent(filePath);

	if (!currentRaw) return; // File deleted — not destructive for this check
	if (!headRaw) return;   // New file — nothing to compare against HEAD

	const currentData = parseFrontmatter(currentRaw);
	const headData = parseFrontmatter(headRaw);

	if (!currentData || !headData) return;

	// Check: any field that was non-empty in HEAD is now blank/null/undefined
	for (const [key, headValue] of Object.entries(headData)) {
		const currentValue = currentData[key];
		if (!isNullValue(headValue) && isNullValue(currentValue)) {
			fail(
				filePath,
				`Field "${key}" was non-empty in HEAD but is now blank/null/undefined. ` +
				`If intentional, remove the field entirely rather than saving it as "".`
			);
		}
	}

	// Check: body content shrank by more than 70%
	const headBody = getBodyContent(headRaw);
	const currentBody = getBodyContent(currentRaw);
	if (headBody.length > 100) {
		const shrinkRatio = 1 - currentBody.length / headBody.length;
		if (shrinkRatio > 0.7) {
			fail(
				filePath,
				`Body content shrank by ${Math.round(shrinkRatio * 100)}% ` +
				`(${headBody.length} → ${currentBody.length} chars). ` +
				`If intentional, verify this is not a CMS truncation error.`
			);
		}
	}

	// Check: frontmatter key count dropped by more than 40%
	const headKeyCount = countFrontmatterKeys(headData);
	const currentKeyCount = countFrontmatterKeys(currentData);
	if (headKeyCount > 0) {
		const dropRatio = 1 - currentKeyCount / headKeyCount;
		if (dropRatio > 0.4) {
			fail(
				filePath,
				`Frontmatter key count dropped by ${Math.round(dropRatio * 100)}% ` +
				`(${headKeyCount} → ${currentKeyCount} keys). ` +
				`Missing keys: ${Object.keys(headData).filter((k) => !(k in currentData)).join(', ')}.`
			);
		}
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!isInGitRepo()) {
	console.log('[INFO] Not inside a git repository. Skipping content diff check.');
	process.exit(0);
}

const changedFiles = getChangedContentFiles();

if (changedFiles.length === 0) {
	console.log('[INFO] No content Markdown files changed. Nothing to check.');
	process.exit(0);
}

if (changedFiles.length > 10) {
	warn(
		`${changedFiles.length} content files changed at once. ` +
		`Review the diff manually to ensure this is intentional.`
	);
}

console.log(`Checking ${changedFiles.length} changed content file(s) for destructive changes...\n`);

for (const file of changedFiles) {
	checkFile(file);
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (errors > 0) {
	console.error(`Content diff check: ${errors} error(s), ${warnings} warning(s).`);
	console.error('Inspect the diffs above before committing or deploying.');
	process.exit(1);
} else if (warnings > 0) {
	console.log(`Content diff check passed with ${warnings} warning(s).`);
} else {
	console.log(`Content diff check passed (${changedFiles.length} file(s)).`);
}
