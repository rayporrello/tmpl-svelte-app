import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { TeamMember } from './types.js';

const TEAM_DIR = join(process.cwd(), 'content', 'team');

/**
 * Load a single team member by slug.
 * Files live in content/team/<slug>.yml as pure YAML (no frontmatter delimiters).
 */
export function loadTeamMember(slug: string): TeamMember {
	const filepath = join(TEAM_DIR, `${slug}.yml`);
	let raw: string;
	try {
		raw = readFileSync(filepath, 'utf-8');
	} catch {
		throw new Error(`Team member not found: content/team/${slug}.yml`);
	}
	try {
		return load(raw) as TeamMember;
	} catch (err) {
		throw new Error(`YAML parse error in content/team/${slug}.yml: ${err}`);
	}
}

/**
 * Load all team members.
 * Inactive members are excluded by default. Pass `{ includeInactive: true }` to include them.
 * Results are sorted by the `order` field ascending.
 */
export function loadTeamMembers({ includeInactive = false } = {}): TeamMember[] {
	let entries: string[];
	try {
		entries = readdirSync(TEAM_DIR).filter((f: string) => f.endsWith('.yml'));
	} catch {
		return [];
	}
	return entries
		.map((filename) => loadTeamMember(filename.replace(/\.yml$/, '')))
		.filter((m) => includeInactive || m.active)
		.sort((a, b) => a.order - b.order);
}
