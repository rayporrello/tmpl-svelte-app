import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { load } from 'js-yaml';
import { TeamMemberSchema } from './schemas.js';
import type { TeamMember } from './types.js';
import {
	duplicateValueIssues,
	filenameSlugIssue,
	handleRuntimeContentFailure,
	makeContentIssue,
	type ContentRecord,
	validateWithSchema,
} from './validation.js';

const TEAM_DIR = join(process.cwd(), 'content', 'team');

interface TeamLoadOptions {
	teamDir?: string;
	extension?: '.yml' | '.yaml';
}

interface TeamMembersLoadOptions extends TeamLoadOptions {
	includeInactive?: boolean;
}

function loadTeamMemberRecord(
	slug: string,
	{ teamDir = TEAM_DIR, extension = '.yml' }: TeamLoadOptions = {}
): TeamMember | undefined {
	const filepath = join(teamDir, `${slug}${extension}`);
	const fileLabel = relative(process.cwd(), filepath);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Team member not found: ${fileLabel}`);
	}

	let parsed: unknown;
	try {
		parsed = load(raw);
	} catch (err) {
		return handleRuntimeContentFailure<TeamMember>('team', fileLabel, [
			makeContentIssue(
				fileLabel,
				'(file)',
				'YAML parse error',
				err instanceof Error ? err.message : String(err)
			),
		]);
	}

	const result = validateWithSchema(TeamMemberSchema, parsed, fileLabel);
	if (!result.success)
		return handleRuntimeContentFailure<TeamMember>('team', fileLabel, result.issues);

	const slugIssue = filenameSlugIssue(fileLabel, result.output.slug, slug);
	if (slugIssue) return handleRuntimeContentFailure<TeamMember>('team', fileLabel, [slugIssue]);

	return result.output;
}

/**
 * Load a single team member by slug.
 * Files live in content/team/<slug>.yml as pure YAML (no frontmatter delimiters).
 */
export function loadTeamMember(slug: string, options: TeamLoadOptions = {}): TeamMember {
	const member = loadTeamMemberRecord(slug, options);
	if (!member) throw new Error(`Team member not found: content/team/${slug}.yml`);
	return member;
}

/**
 * Load all team members.
 * Inactive members are excluded by default. Pass `{ includeInactive: true }` to include them.
 * Results are sorted by the `order` field ascending.
 */
export function loadTeamMembers({
	includeInactive = false,
	teamDir = TEAM_DIR,
}: TeamMembersLoadOptions = {}): TeamMember[] {
	let entries: string[];
	try {
		entries = readdirSync(teamDir).filter((f: string) => f.endsWith('.yml') || f.endsWith('.yaml'));
	} catch {
		return [];
	}

	const records: ContentRecord<TeamMember>[] = entries
		.map((filename) => {
			const slug = filename.replace(/\.ya?ml$/, '');
			const extension = filename.endsWith('.yaml') ? '.yaml' : '.yml';
			const value = loadTeamMemberRecord(slug, { teamDir, extension });
			return value ? { file: relative(process.cwd(), join(teamDir, filename)), value } : undefined;
		})
		.filter((record): record is ContentRecord<TeamMember> => record !== undefined);

	const duplicateOrderIssues = duplicateValueIssues(records, (record) => record.order, 'order');
	if (duplicateOrderIssues.length > 0) {
		const duplicateFiles = new Set(duplicateOrderIssues.map((issue) => issue.file));
		handleRuntimeContentFailure<TeamMember[]>('team', 'content/team', duplicateOrderIssues);
		return records
			.filter((record) => !duplicateFiles.has(record.file))
			.map((record) => record.value)
			.filter((m) => includeInactive || m.active)
			.sort((a, b) => a.order - b.order);
	}

	return records
		.map((record) => record.value)
		.filter((m) => includeInactive || m.active)
		.sort((a, b) => a.order - b.order);
}
