#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { glob } from 'glob';

export type AccessibilityRuleId =
	| 'a11y/page-h1'
	| 'a11y/control-label'
	| 'a11y/empty-interactive-name'
	| 'a11y/image-alt';

export type AccessibilityViolation = {
	ruleId: AccessibilityRuleId;
	file: string;
	line: number;
	column: number;
	message: string;
};

export type AccessibilityReport = {
	violations: AccessibilityViolation[];
	checkedFiles: string[];
};

export type AccessibilityCheckOptions = {
	rootDir?: string;
	files?: string[];
};

type LineIndex = {
	positionAt(offset: number): { line: number; column: number };
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLOBS = ['src/**/*.svelte'];
const IGNORED_GLOBS = ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**'];
const CONTROL_TAG_PATTERN = /<(input|select|textarea)\b[^>]*>/giu;
const INTERACTIVE_TAG_PATTERN = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/giu;
const IMAGE_TAG_PATTERN = /<(img|enhanced:img|CmsImage)\b[^>]*>/giu;

function toProjectPath(rootDir: string, path: string): string {
	return relative(rootDir, path).replace(/\\/gu, '/');
}

function createLineIndex(source: string): LineIndex {
	const lineStarts = [0];
	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === '\n') lineStarts.push(index + 1);
	}

	return {
		positionAt(offset: number) {
			let low = 0;
			let high = lineStarts.length - 1;
			while (low <= high) {
				const middle = Math.floor((low + high) / 2);
				if (lineStarts[middle] <= offset) low = middle + 1;
				else high = middle - 1;
			}
			const lineIndex = Math.max(0, high);
			return { line: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1 };
		},
	};
}

function stripScriptsAndComments(source: string): string {
	return source
		.replace(/<script\b[\s\S]*?<\/script>/giu, (match) => ' '.repeat(match.length))
		.replace(/<!--[\s\S]*?-->/gu, (match) => ' '.repeat(match.length));
}

function resolveFiles(rootDir: string, files?: string[]): string[] {
	const input =
		files && files.length > 0
			? files.map((file) => resolve(rootDir, file))
			: SOURCE_GLOBS.flatMap((pattern) =>
					glob.sync(pattern, {
						cwd: rootDir,
						absolute: true,
						nodir: true,
						ignore: IGNORED_GLOBS,
					})
				);
	return [...new Set(input)].filter((file) => existsSync(file)).sort();
}

function hasAttr(tag: string, name: string): boolean {
	const escaped = name.replace(/[\\^$*+?.()|[\]{}]/gu, '\\$&');
	return new RegExp(`(?:\\s${escaped}(?:\\s*=|\\s|>|/>)|[{]\\s*${escaped}\\s*[}])`, 'iu').test(tag);
}

function attrValue(tag: string, name: string): string | null {
	const escaped = name.replace(/[\\^$*+?.()|[\]{}]/gu, '\\$&');
	const match = new RegExp(
		`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]+)\\})`,
		'iu'
	).exec(tag);
	return match ? (match[1] ?? match[2] ?? match[3] ?? '').trim() : null;
}

function pushViolation(
	violations: AccessibilityViolation[],
	ruleId: AccessibilityRuleId,
	projectPath: string,
	lineIndex: LineIndex,
	offset: number,
	message: string
): void {
	const position = lineIndex.positionAt(offset);
	violations.push({ ruleId, file: projectPath, ...position, message });
}

function routePathForPage(projectPath: string): string | null {
	if (!projectPath.startsWith('src/routes/') || !projectPath.endsWith('/+page.svelte')) {
		return null;
	}
	return projectPath;
}

function labelIds(source: string): Set<string> {
	const ids = new Set<string>();
	for (const match of source.matchAll(/<label\b[^>]*\sfor\s*=\s*(?:"([^"]+)"|'([^']+)')/giu)) {
		ids.add(match[1] ?? match[2]);
	}
	return ids;
}

function isInsideLabel(source: string, offset: number): boolean {
	const before = source.slice(0, offset);
	return before.lastIndexOf('<label') > before.lastIndexOf('</label>');
}

function controlNeedsLabel(tag: string): boolean {
	const type = (attrValue(tag, 'type') ?? '').toLowerCase();
	return !['hidden', 'button', 'submit', 'reset', 'image'].includes(type);
}

function hasProgrammaticName(tag: string): boolean {
	return hasAttr(tag, 'aria-label') || hasAttr(tag, 'aria-labelledby') || hasAttr(tag, 'title');
}

function visibleTextFrom(innerHtml: string): string {
	return innerHtml
		.replace(/<script\b[\s\S]*?<\/script>/giu, '')
		.replace(/<style\b[\s\S]*?<\/style>/giu, '')
		.replace(/<[^>]+>/gu, ' ')
		.replace(/&nbsp;/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
}

function childImageAltProvidesName(innerHtml: string): boolean {
	for (const match of innerHtml.matchAll(IMAGE_TAG_PATTERN)) {
		const alt = attrValue(match[0], 'alt');
		if (alt && !/^['"]?['"]?$/u.test(alt)) return true;
	}
	return false;
}

function hasInteractiveName(attrs: string, innerHtml: string): boolean {
	if (hasProgrammaticName(attrs)) return true;
	if (visibleTextFrom(innerHtml)) return true;
	if (innerHtml.includes('{')) return true;
	return childImageAltProvidesName(innerHtml);
}

function checkPageH1(
	source: string,
	projectPath: string,
	lineIndex: LineIndex,
	violations: AccessibilityViolation[]
): void {
	if (!routePathForPage(projectPath)) return;
	const h1Matches = [...source.matchAll(/<h1\b/giu)];
	if (h1Matches.length === 1) return;

	const offset = h1Matches[1]?.index ?? h1Matches[0]?.index ?? 0;
	pushViolation(
		violations,
		'a11y/page-h1',
		projectPath,
		lineIndex,
		offset,
		h1Matches.length === 0
			? 'Route page is missing an h1.'
			: `Route page has ${h1Matches.length} h1 elements; expected exactly one.`
	);
}

function checkControls(
	source: string,
	projectPath: string,
	lineIndex: LineIndex,
	violations: AccessibilityViolation[]
): void {
	const labels = labelIds(source);
	for (const match of source.matchAll(CONTROL_TAG_PATTERN)) {
		const tag = match[0];
		const offset = match.index ?? 0;
		if (!controlNeedsLabel(tag)) continue;
		if (hasProgrammaticName(tag) || isInsideLabel(source, offset)) continue;

		const id = attrValue(tag, 'id');
		if (id && labels.has(id)) continue;

		pushViolation(
			violations,
			'a11y/control-label',
			projectPath,
			lineIndex,
			offset,
			`${match[1]} control needs a label, wrapping label, aria-label, or aria-labelledby.`
		);
	}
}

function checkInteractiveNames(
	source: string,
	projectPath: string,
	lineIndex: LineIndex,
	violations: AccessibilityViolation[]
): void {
	for (const match of source.matchAll(INTERACTIVE_TAG_PATTERN)) {
		const tagName = match[1];
		const attrs = match[2] ?? '';
		const innerHtml = match[3] ?? '';
		if (tagName.toLowerCase() === 'a' && !hasAttr(attrs, 'href')) continue;
		if (hasAttr(attrs, 'aria-hidden')) continue;
		if (hasInteractiveName(attrs, innerHtml)) continue;

		pushViolation(
			violations,
			'a11y/empty-interactive-name',
			projectPath,
			lineIndex,
			match.index ?? 0,
			`<${tagName}> has no visible or programmatic accessible name.`
		);
	}
}

function checkImageAlt(
	source: string,
	projectPath: string,
	lineIndex: LineIndex,
	violations: AccessibilityViolation[]
): void {
	for (const match of source.matchAll(IMAGE_TAG_PATTERN)) {
		const tag = match[0];
		if (hasAttr(tag, 'alt')) continue;
		pushViolation(
			violations,
			'a11y/image-alt',
			projectPath,
			lineIndex,
			match.index ?? 0,
			`${match[1]} is missing alt. Use alt="" for decorative images.`
		);
	}
}

export function checkAccessibilitySource(
	options: AccessibilityCheckOptions = {}
): AccessibilityReport {
	const rootDir = resolve(options.rootDir ?? ROOT_DIR);
	const files = resolveFiles(rootDir, options.files);
	const violations: AccessibilityViolation[] = [];

	for (const file of files) {
		const rawSource = readFileSync(file, 'utf8');
		const source = stripScriptsAndComments(rawSource);
		const projectPath = toProjectPath(rootDir, file);
		const lineIndex = createLineIndex(rawSource);
		checkPageH1(source, projectPath, lineIndex, violations);
		checkControls(source, projectPath, lineIndex, violations);
		checkInteractiveNames(source, projectPath, lineIndex, violations);
		checkImageAlt(source, projectPath, lineIndex, violations);
	}

	return { violations, checkedFiles: files.map((file) => toProjectPath(rootDir, file)) };
}

export function main(): number {
	const report = checkAccessibilitySource();
	for (const violation of report.violations) {
		console.error(
			`${violation.file}:${violation.line}:${violation.column} error ${violation.ruleId} ${violation.message}`
		);
	}

	const summary = `Accessibility source check: ${report.violations.length} error(s), ${report.checkedFiles.length} file(s) checked.`;
	if (report.violations.length > 0) {
		console.error(`\n${summary}\n`);
		return 1;
	}

	console.log(`\n${summary}\n`);
	return 0;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(main());
}
