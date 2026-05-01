import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readEnv, type EnvMap } from './env-file';
import { INIT_SITE_OWNED_FILES } from './protected-files';

export type RepoInspection = {
	initSiteDone: boolean;
	placeholdersByFile: Record<string, string[]>;
	envPresent: boolean;
	envParsed: EnvMap | null;
	containerExists: boolean;
	containerHealthy: boolean;
	schemaApplied: boolean;
};

export type InspectRepoOptions = {
	rootDir?: string;
	envPath?: string;
	containerExists?: () => Promise<boolean>;
	containerHealthy?: () => Promise<boolean>;
	schemaApplied?: () => Promise<boolean>;
};

const PLACEHOLDER_PATTERNS = [
	'tmpl-svelte-app',
	'Your Site Name',
	'https://example.com',
	'example.com',
	'owner/repo-name',
	'<owner>',
	'<name>',
	'<project>',
	'REPLACE PER PROJECT',
	'[Site Title]',
	'[Site Name]',
	'[Year]',
] as const;

function placeholdersIn(content: string): string[] {
	return PLACEHOLDER_PATTERNS.filter((placeholder) => content.includes(placeholder));
}

function inspectPlaceholders(rootDir: string): Record<string, string[]> {
	const byFile: Record<string, string[]> = {};
	for (const file of INIT_SITE_OWNED_FILES) {
		const absolutePath = join(rootDir, file);
		if (!existsSync(absolutePath)) continue;
		const placeholders = placeholdersIn(readFileSync(absolutePath, 'utf8'));
		if (placeholders.length) byFile[file] = placeholders;
	}
	return byFile;
}

export async function inspectRepo(options: InspectRepoOptions = {}): Promise<RepoInspection> {
	const rootDir = options.rootDir ?? process.cwd();
	const envPath = options.envPath ?? join(rootDir, '.env');
	const envPresent = existsSync(envPath);
	let envParsed: EnvMap | null = null;

	if (envPresent) {
		try {
			envParsed = readEnv(envPath);
		} catch {
			envParsed = null;
		}
	}

	const placeholdersByFile = inspectPlaceholders(rootDir);
	const containerExists = options.containerExists ? await options.containerExists() : false;
	const containerHealthy =
		containerExists && options.containerHealthy ? await options.containerHealthy() : false;
	const schemaApplied = options.schemaApplied
		? await options.schemaApplied()
		: existsSync(join(rootDir, 'drizzle/meta/_journal.json'));

	return {
		initSiteDone: Object.keys(placeholdersByFile).length === 0,
		placeholdersByFile,
		envPresent,
		envParsed,
		containerExists,
		containerHealthy,
		schemaApplied,
	};
}
