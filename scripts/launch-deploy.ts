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
	skipContactDeliverySmoke: boolean;
	deployArgs: string[];
};

function usage(): string {
	return [
		'Usage: bun run launch:deploy -- --client=<slug> --image=<ghcr-image> --sha=<sha> --safety=<rollback-safe|rollback-blocked>',
		'',
		'launch:deploy gates the first deploy on web-data-platform launch:checklist,',
		'delegates to deploy:apply, and then runs the platform',
		'web:test-contact-delivery end-to-end check. On a green smoke, the launch',
		'checklist item contact_delivery_smoke_passed is marked done.',
		'',
		'Options:',
		'  --client=<slug>                  Defaults to site.project.json project.projectSlug',
		'  --web-data-platform=<path>       Defaults to WEB_DATA_PLATFORM_PATH or ../web-data-platform',
		'  --skip-checklist                 Bypass launch checklist gate for an approved exception',
		'  --skip-contact-delivery-smoke    Skip the post-deploy web:test-contact-delivery check',
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
	let skipContactDeliverySmoke = false;

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
		} else if (arg === '--skip-contact-delivery-smoke') {
			skipContactDeliverySmoke = true;
		} else {
			deployArgs.push(arg);
		}
	}

	return {
		client,
		webDataPlatformPath: resolve(rootDir, webDataPlatformPath),
		skipChecklist,
		skipContactDeliverySmoke,
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

type ContactDeliveryResult = { exitCode: number };

function runContactDeliverySmoke(client: string, platformPath: string): ContactDeliveryResult {
	const proc = spawnSync(
		'bun',
		['run', '--cwd', platformPath, 'web:test-contact-delivery', '--', `--client=${client}`],
		{ encoding: 'utf8' }
	);
	if (proc.stdout) process.stdout.write(proc.stdout);
	if (proc.stderr) process.stderr.write(proc.stderr);
	return { exitCode: proc.status ?? 1 };
}

function markContactDeliverySmokePassed(client: string, platformPath: string): void {
	const proc = spawnSync(
		'bun',
		[
			'run',
			'--cwd',
			platformPath,
			'launch:checklist',
			'--',
			`--client=${client}`,
			'--set=contact_delivery_smoke_passed:done',
			'--note=web:test-contact-delivery passed from launch:deploy',
		],
		{ encoding: 'utf8' }
	);
	if (proc.stderr) process.stderr.write(proc.stderr);
	if ((proc.status ?? 1) !== 0) {
		console.warn(
			'[launch:deploy] post-deploy smoke passed but the checklist item could not be marked done; run launch:checklist manually.'
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

		const deployExitCode = await deployApplyMain(options.deployArgs);
		if (deployExitCode !== 0) return deployExitCode;

		if (options.skipContactDeliverySmoke) {
			console.warn(
				'[launch:deploy] post-deploy contact-delivery smoke skipped by --skip-contact-delivery-smoke. The launch-complete phase will not advance for this deploy.'
			);
			return 0;
		}

		const smoke = runContactDeliverySmoke(client, options.webDataPlatformPath);
		if (smoke.exitCode !== 0) {
			console.error(
				'[launch:deploy] post-deploy web:test-contact-delivery FAILED. The site is deployed but the launch-complete phase has not advanced. Investigate the failure (printed above) before flipping clients.json active:true or before announcing the launch. Auto-rollback is intentionally NOT triggered; if a rollback is appropriate, run `bun run rollback` manually for --safety=rollback-safe, or follow PITR/roll-forward guidance for --safety=rollback-blocked.'
			);
			return smoke.exitCode;
		}
		markContactDeliverySmokePassed(client, options.webDataPlatformPath);
		return 0;
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
