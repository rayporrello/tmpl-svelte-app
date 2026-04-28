import { basename, extname } from 'node:path';
import * as v from 'valibot';
import { logger } from '../server/logger.js';
import { FUTURE_PUBLISHED_DATE_MESSAGE } from './schemas.js';

export type ContentIssueSeverity = 'error' | 'warning';

export interface ContentValidationIssue {
	file: string;
	path: string;
	message: string;
	received?: unknown;
	receivedText?: string;
	severity?: ContentIssueSeverity;
}

export interface ContentRecord<T> {
	file: string;
	value: T;
}

export function todayDateOnly(): string {
	return new Date().toISOString().slice(0, 10);
}

function formatReceived(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	if (typeof value === 'string') return JSON.stringify(value);
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function issuePath(issue: v.BaseIssue<unknown>): string {
	const dotPath = v.getDotPath(issue);
	if (dotPath) return dotPath;
	const path = issue.path ?? [];
	if (path.length === 0) return '(root)';
	return path.map((part) => String((part as { key?: unknown }).key ?? '(unknown)')).join('.');
}

function issueMessage(issue: v.BaseIssue<unknown>): string {
	if (issue.type === 'strict_object' && issue.expected === 'never') return 'unknown field';
	if (
		issue.type === 'strict_object' &&
		issue.received === 'undefined' &&
		typeof issue.expected === 'string' &&
		issue.expected.startsWith('"')
	) {
		return 'is required';
	}
	return issue.message;
}

function issueReceived(issue: v.BaseIssue<unknown>): unknown {
	const lastPathPart = issue.path?.at(-1) as { value?: unknown; origin?: string } | undefined;
	if (issue.type === 'partial_check' && lastPathPart) return lastPathPart.value;
	if (issue.type === 'strict_object' && lastPathPart?.origin === 'key') return issue.input;
	return issue.input;
}

function issueReceivedText(issue: v.BaseIssue<unknown>): string | undefined {
	if (issue.message !== FUTURE_PUBLISHED_DATE_MESSAGE) return undefined;
	const dateValue = issueReceived(issue);
	return `${String(dateValue)}, today is ${todayDateOnly()}`;
}

export function valibotIssuesToContentIssues(
	file: string,
	issues: readonly v.BaseIssue<unknown>[]
): ContentValidationIssue[] {
	return issues.map((issue) => ({
		file,
		path: issuePath(issue),
		message: issueMessage(issue),
		received: issueReceived(issue),
		receivedText: issueReceivedText(issue),
		severity: 'error',
	}));
}

export function makeContentIssue(
	file: string,
	path: string,
	message: string,
	received?: unknown,
	severity: ContentIssueSeverity = 'error',
	receivedText?: string
): ContentValidationIssue {
	return { file, path, message, received, receivedText, severity };
}

export function formatContentIssues(
	issues: readonly ContentValidationIssue[],
	severity: ContentIssueSeverity = 'error'
): string {
	const filtered = issues.filter((issue) => (issue.severity ?? 'error') === severity);
	if (filtered.length === 0) return '';

	const byFile = new Map<string, ContentValidationIssue[]>();
	for (const issue of filtered) {
		const fileIssues = byFile.get(issue.file) ?? [];
		fileIssues.push(issue);
		byFile.set(issue.file, fileIssues);
	}

	const marker = severity === 'error' ? '✗' : '!';
	const label = severity === 'error' ? 'error' : 'warning';
	const lines: string[] = [];

	for (const [file, fileIssues] of byFile) {
		if (lines.length > 0) lines.push('');
		lines.push(file);
		for (const issue of fileIssues) {
			const received =
				issue.receivedText ??
				(issue.received !== undefined ? formatReceived(issue.received) : undefined);
			const got = received === undefined ? '' : ` (got ${received})`;
			lines.push(`  ${marker} ${issue.path}: ${issue.message}${got}`);
		}
	}

	const issueCount = filtered.length;
	const fileCount = byFile.size;
	lines.push('');
	lines.push(
		`${issueCount} ${label}${issueCount === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'}`
	);
	return lines.join('\n');
}

export function validateWithSchema<TSchema extends v.GenericSchema>(
	schema: TSchema,
	input: unknown,
	file: string
):
	| { success: true; output: v.InferOutput<TSchema> }
	| { success: false; issues: ContentValidationIssue[] } {
	const result = v.safeParse(schema, input);
	if (result.success) return { success: true, output: result.output };
	return { success: false, issues: valibotIssuesToContentIssues(file, result.issues) };
}

export function filenameSlugIssue(
	file: string,
	slug: unknown,
	expectedSlug = basename(file, extname(file))
): ContentValidationIssue | undefined {
	if (typeof slug !== 'string' || slug.length === 0) return undefined;
	if (slug === expectedSlug) return undefined;
	return makeContentIssue(file, 'slug', `must match filename "${expectedSlug}"`, slug);
}

export function duplicateValueIssues<T>(
	records: readonly ContentRecord<T>[],
	getValue: (record: T) => string | number | undefined,
	path: string
): ContentValidationIssue[] {
	const firstByValue = new Map<string | number, string>();
	const issues: ContentValidationIssue[] = [];

	for (const record of records) {
		const value = getValue(record.value);
		if (value === undefined) continue;
		const firstFile = firstByValue.get(value);
		if (firstFile) {
			issues.push(
				makeContentIssue(record.file, path, `must be unique; already used in ${firstFile}`, value)
			);
		} else {
			firstByValue.set(value, record.file);
		}
	}

	return issues;
}

function shouldThrowContentErrors(): boolean {
	const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
	return meta.env?.DEV ?? process.env.NODE_ENV !== 'production';
}

export function handleRuntimeContentFailure<T>(
	collection: string,
	file: string,
	issues: readonly ContentValidationIssue[]
): T | undefined {
	const message = formatContentIssues(issues);
	if (shouldThrowContentErrors()) {
		throw new Error(message || `${file}: invalid content`);
	}
	logger.error('Invalid content record dropped', {
		collection,
		file,
		errors: issues.map((issue) => ({
			path: issue.path,
			message: issue.message,
			received: issue.receivedText ?? issue.received,
		})),
	});
	return undefined;
}
