#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main as deployApplyMain } from './deploy-apply';

type CliOptions = {
	client?: string;
	webDataPlatformPath: string;
	skipChecklist: boolean;
	deployArgs: string[];
};

function usage(): string {
	return [
		'Usage: bun run launch:deploy -- --client=<slug> --image=<ghcr-image> --sha=<sha> --safety=<rollback-safe|rollback-blocked>',
		'',
		'launch:deploy gates the first deploy on web-data-platform launch:checklist,',
		'then delegates to deploy:apply. deploy:apply runs deploy:smoke after restart.',
		'',
		'Options:',
		'  --client=<slug>                  Defaults to site.project.json project.projectSlug',
		'  --web-data-platform=<path>       Defaults to WEB_DATA_PLATFORM_PATH or ../web-data-platform',
		'  --skip-checklist                 Bypass launch checklist gate for an approved exception',
	].join('\n');
}

export function parseArgs(
	argv: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
	rootDir = process.cwd()
): CliOptions {
	const deployArgs: string[] = [];
	let client: string | undefined;
	let webDataPlatformPath =
		env.WEB_DATA_PLATFORM_PATH?.trim() || resolve(rootDir, '..', 'web-data-platform');
	let skipChecklist = false;

	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			console.log(usage());
			process.exit(0);
		} else if (arg.startsWith('--client=')) {
			client = arg.slice('--client='.length);
		} else if (arg.startsWith('--web-data-platform=')) {
			webDataPlatformPath = arg.slice('--web-data-platform='.length);
		} else if (arg === '--skip-checklist') {
			skipChecklist = true;
		} else {
			deployArgs.push(arg);
		}
	}

	return {
		client,
		webDataPlatformPath: resolve(rootDir, webDataPlatformPath),
		skipChecklist,
		deployArgs,
	};
}

function clientSlugFromProject(rootDir: string): string {
	const manifestPath = resolve(rootDir, 'site.project.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
		project?: { projectSlug?: unknown };
	};
	const slug = manifest.project?.projectSlug;
	if (typeof slug === 'string' && slug.trim()) return slug.trim();
	throw new Error('Missing --client and site.project.json project.projectSlug.');
}

function runChecklistGate(client: string, platformPath: string): void {
	const packageJsonPath = resolve(platformPath, 'package.json');
	if (!existsSync(packageJsonPath)) {
		throw new Error(
			`web-data-platform not found at ${platformPath}. Pass --web-data-platform=<path>.`
		);
	}
	const proc = spawnSync(
		'bun',
		[
			'run',
			'--cwd',
			platformPath,
			'launch:checklist',
			'--',
			`--client=${client}`,
			'--require-ready',
		],
		{
			encoding: 'utf8',
		}
	);
	const stdout = proc.stdout ?? '';
	const stderr = proc.stderr ?? '';
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr);
	if (proc.status !== 0) {
		throw new Error(
			`launch:deploy stopped because ${client} is not ready in web-data-platform launch:checklist.`
		);
	}
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	try {
		const rootDir = process.cwd();
		const options = parseArgs(argv, process.env, rootDir);
		const client = options.client ?? clientSlugFromProject(rootDir);

		if (options.skipChecklist) {
			console.warn(
				'[launch:deploy] checklist gate skipped by --skip-checklist. Confirm external integrations manually.'
			);
		} else {
			runChecklistGate(client, options.webDataPlatformPath);
		}

		return await deployApplyMain(options.deployArgs);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
