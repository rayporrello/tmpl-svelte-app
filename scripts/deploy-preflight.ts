#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnv, type EnvMap } from './lib/env-file';
import { evaluateLaunchBlockers } from './lib/launch-blockers';
import { sanitizeProjectSlug } from './lib/postgres-dev';
import { run as defaultRunner, type RunResult } from './lib/run';

export type DeployPreflightStatus = 'pass' | 'fail';

export type DeployPreflightResult = {
	id: string;
	label: string;
	status: DeployPreflightStatus;
	detail: string;
	hint: string;
};

export type DeployPreflightContext = {
	rootDir: string;
	env?: NodeJS.ProcessEnv;
	runner?: (
		command: string,
		args?: readonly string[],
		options?: { cwd?: string; capture?: boolean; env?: NodeJS.ProcessEnv }
	) => Promise<RunResult>;
	prodEnvPath?: string;
};

type EnvReference =
	| {
			ok: true;
			path: string;
			env: EnvMap;
	  }
	| {
			ok: false;
			detail: string;
	  };

type ImageReference =
	| {
			ok: true;
			owner: string;
			name: string;
			tag: string;
	  }
	| {
			ok: false;
			detail: string;
	  };

type CheckDefinition = {
	id: string;
	label: string;
	run: (context: DeployPreflightContext) => Promise<DeployPreflightResult>;
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROD_ENV_CANDIDATES = [
	'.env.production',
	'.env.prod',
	'production.env',
	'deploy/.env.production',
	'deploy/production.env',
] as const;
const PROD_ENV_PATH_ENV_KEYS = [
	'DEPLOY_PREFLIGHT_ENV_FILE',
	'LAUNCH_PROD_ENV_FILE',
	'PRODUCTION_ENV_FILE',
];
const FORBIDDEN_PROD_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function pass(id: string, label: string, detail: string, hint: string): DeployPreflightResult {
	return { id, label, status: 'pass', detail, hint };
}

function fail(id: string, label: string, detail: string, hint: string): DeployPreflightResult {
	return {
		id,
		label,
		status: 'fail',
		detail,
		hint: hint.startsWith('NEXT:') ? hint : `NEXT: ${hint}`,
	};
}

function displayPath(rootDir: string, path: string): string {
	return path.startsWith(rootDir) ? path.slice(rootDir.length + 1) || basename(path) : path;
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readPackageName(rootDir: string): string {
	const parsed = readJson(join(rootDir, 'package.json'));
	return typeof parsed.name === 'string' && parsed.name.trim()
		? parsed.name.trim()
		: 'tmpl-svelte-app';
}

function projectSlug(rootDir: string): string {
	return sanitizeProjectSlug(readPackageName(rootDir));
}

function stringProperty(source: string, field: string): string | null {
	const match = source.match(new RegExp(`${field}:\\s*['"\`]([^'"\`]+)['"\`]`, 'u'));
	return match?.[1] ?? null;
}

function expectedHost(rootDir: string): string | null {
	const sitePath = join(rootDir, 'src/lib/config/site.ts');
	if (!existsSync(sitePath)) return null;
	const source = readFileSync(sitePath, 'utf8');
	const domain = stringProperty(source, 'domain');
	if (domain)
		return domain
			.replace(/^https?:\/\//u, '')
			.replace(/\/.*$/u, '')
			.toLowerCase();
	const siteUrl = stringProperty(source, 'url');
	if (!siteUrl) return null;
	try {
		return new URL(siteUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
}

function prodEnvCandidates(context: DeployPreflightContext): string[] {
	const paths = new Set<string>();
	if (context.prodEnvPath) paths.add(resolve(context.rootDir, context.prodEnvPath));

	const env = context.env ?? process.env;
	for (const key of PROD_ENV_PATH_ENV_KEYS) {
		const value = env[key]?.trim();
		if (value) paths.add(resolve(context.rootDir, value));
	}

	for (const candidate of PROD_ENV_CANDIDATES) paths.add(resolve(context.rootDir, candidate));
	return [...paths];
}

function readProdEnv(context: DeployPreflightContext): EnvReference {
	const candidates = prodEnvCandidates(context);
	const envPath = candidates.find((path) => existsSync(path));
	if (!envPath) {
		return {
			ok: false,
			detail: `no production env file found at ${candidates
				.map((path) => displayPath(context.rootDir, path))
				.join(', ')}`,
		};
	}

	try {
		return { ok: true, path: envPath, env: readEnv(envPath) };
	} catch (error) {
		return {
			ok: false,
			detail: `${displayPath(context.rootDir, envPath)} could not be parsed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

function hostIsForbidden(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return FORBIDDEN_PROD_HOSTS.has(normalized) || normalized.endsWith('.localhost');
}

function checkHttpsUrl(
	name: 'ORIGIN' | 'PUBLIC_SITE_URL',
	envReference: EnvReference,
	host: string | null
): string | null {
	if (!envReference.ok) return `${name} could not be checked: ${envReference.detail}.`;
	const value = envReference.env[name]?.trim();
	if (!value) return `${name} is missing from ${displayPath(process.cwd(), envReference.path)}.`;

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return `${name}="${value}" is not a valid URL.`;
	}

	if (parsed.protocol !== 'https:') return `${name}="${value}" must use https:.`;
	if (hostIsForbidden(parsed.hostname)) return `${name}="${value}" is not a production host.`;
	if (host && parsed.hostname.toLowerCase() !== host) {
		return `${name} host "${parsed.hostname}" does not match site host "${host}".`;
	}
	return null;
}

function parseImageReference(content: string): ImageReference {
	const match = content.match(/^Image=ghcr\.io\/([^/\s<>]+)\/([^:\s<>]+):([^\s<>]+)$/m);
	if (!match) {
		return {
			ok: false,
			detail:
				'deploy/quadlets/web.container Image= line is missing or still contains placeholders.',
		};
	}
	return { ok: true, owner: match[1], name: match[2], tag: match[3] };
}

export async function checkProductionEnvFile(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const envReference = readProdEnv(context);
	if (!envReference.ok) {
		return fail(
			'PREFLIGHT-ENV-001',
			'Production env file exists',
			envReference.detail,
			'NEXT: Render or provide a production env file such as .env.production.'
		);
	}
	return pass(
		'PREFLIGHT-ENV-001',
		'Production env file exists',
		`${displayPath(context.rootDir, envReference.path)} is present and parses.`,
		'NEXT: Keep production env outside source control unless it is a safe example file.'
	);
}

export async function checkSopsRender(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const secretsPath = join(context.rootDir, 'secrets.yaml');
	if (!existsSync(secretsPath)) {
		return pass(
			'PREFLIGHT-SECRETS-001',
			'SOPS secrets render succeeds when configured',
			'secrets.yaml is not configured; using the production env file path.',
			'NEXT: Add encrypted secrets.yaml when this project adopts SOPS-rendered production env.'
		);
	}

	const secrets = readFileSync(secretsPath, 'utf8');
	if (!/^sops:/mu.test(secrets)) {
		return fail(
			'PREFLIGHT-SECRETS-001',
			'SOPS secrets render succeeds when configured',
			'secrets.yaml exists but does not contain SOPS metadata.',
			'NEXT: Encrypt secrets.yaml with sops --encrypt --in-place secrets.yaml.'
		);
	}

	const runner = context.runner ?? defaultRunner;
	const result = await runner('sops', ['--decrypt', '--output-type', 'dotenv', secretsPath], {
		cwd: context.rootDir,
		capture: true,
		env: context.env,
	});
	if (result.code !== 0) {
		return fail(
			'PREFLIGHT-SECRETS-001',
			'SOPS secrets render succeeds when configured',
			result.stderr.trim() || result.stdout.trim() || 'sops decrypt failed.',
			'NEXT: Ensure SOPS is installed and the age/GPG key can decrypt secrets.yaml.'
		);
	}

	return pass(
		'PREFLIGHT-SECRETS-001',
		'SOPS secrets render succeeds when configured',
		'sops decrypted secrets.yaml to dotenv output without writing a file.',
		'NEXT: Run bun run secrets:render during deployment to create the real env file.'
	);
}

export async function checkDatabaseUrlShape(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const envReference = readProdEnv(context);
	const label = 'Production DATABASE_URL is not local';
	if (!envReference.ok) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			envReference.detail,
			'NEXT: Add DATABASE_URL to the production env file.'
		);
	}

	const value = envReference.env.DATABASE_URL?.trim();
	if (!value) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			'DATABASE_URL is missing.',
			'NEXT: Add the production Postgres URL.'
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			'DATABASE_URL is not parseable.',
			'NEXT: Use postgres://user:password@host:port/database.'
		);
	}

	if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			'DATABASE_URL must use postgres:// or postgresql://.',
			'NEXT: Use the production Postgres URL.'
		);
	}
	if (hostIsForbidden(parsed.hostname)) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			`DATABASE_URL points to ${parsed.hostname}.`,
			'NEXT: Use a production database host, not localhost.'
		);
	}
	return pass(
		'PREFLIGHT-DB-001',
		label,
		'DATABASE_URL uses a non-local Postgres host.',
		'NEXT: Verify the database accepts the deployed app user.'
	);
}

export async function checkHttpsOrigins(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const envReference = readProdEnv(context);
	const host = expectedHost(context.rootDir);
	const problems = [
		checkHttpsUrl('ORIGIN', envReference, host),
		checkHttpsUrl('PUBLIC_SITE_URL', envReference, host),
	].filter((item): item is string => item !== null);

	if (problems.length) {
		return fail(
			'PREFLIGHT-ENV-002',
			'Production origins are HTTPS and match site config',
			problems.join(' '),
			'NEXT: Set ORIGIN and PUBLIC_SITE_URL to the canonical HTTPS site URL.'
		);
	}

	return pass(
		'PREFLIGHT-ENV-002',
		'Production origins are HTTPS and match site config',
		`ORIGIN and PUBLIC_SITE_URL match ${host ?? 'the configured site URL'}.`,
		'NEXT: Keep src/lib/config/site.ts and production env in sync.'
	);
}

export async function checkCaddyfileDomain(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const projectCaddyfile = join(context.rootDir, 'deploy/Caddyfile');
	if (existsSync(projectCaddyfile)) {
		return pass(
			'PREFLIGHT-CADDY-001',
			'Caddyfile domain is project-specific',
			'deploy/Caddyfile exists.',
			'NEXT: Validate the project Caddyfile on the server with caddy validate.'
		);
	}

	const examplePath = join(context.rootDir, 'deploy/Caddyfile.example');
	if (!existsSync(examplePath)) {
		return fail(
			'PREFLIGHT-CADDY-001',
			'Caddyfile domain is project-specific',
			'deploy/Caddyfile.example is missing.',
			'NEXT: Restore deploy/Caddyfile.example or add deploy/Caddyfile.'
		);
	}

	const content = readFileSync(examplePath, 'utf8');
	const host = expectedHost(context.rootDir);
	if (content.includes('example.com')) {
		return fail(
			'PREFLIGHT-CADDY-001',
			'Caddyfile domain is project-specific',
			'deploy/Caddyfile.example still contains example.com.',
			'NEXT: Run bun run init:site or replace example.com with the production domain.'
		);
	}
	if (host && !content.includes(host)) {
		return fail(
			'PREFLIGHT-CADDY-001',
			'Caddyfile domain is project-specific',
			`deploy/Caddyfile.example does not reference ${host}.`,
			'NEXT: Align deploy/Caddyfile.example with src/lib/config/site.ts.'
		);
	}

	return pass(
		'PREFLIGHT-CADDY-001',
		'Caddyfile domain is project-specific',
		'deploy/Caddyfile.example has a project domain.',
		'NEXT: Copy it to the server Caddyfile during deployment.'
	);
}

export async function checkQuadletProject(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Quadlet image and project names match project slug';
	const path = join(context.rootDir, 'deploy/quadlets/web.container');
	if (!existsSync(path)) {
		return fail(
			'PREFLIGHT-QUADLET-001',
			label,
			'deploy/quadlets/web.container is missing.',
			'NEXT: Restore the Quadlet template or project unit file.'
		);
	}

	const slug = projectSlug(context.rootDir);
	const content = readFileSync(path, 'utf8');
	const image = parseImageReference(content);
	const expectedLines = [
		`EnvironmentFile=%h/secrets/${slug}.prod.env`,
		`Network=${slug}.network`,
		`HostName=${slug}-web`,
	];
	const missing = expectedLines.filter((line) => !content.includes(line));

	if (!image.ok || missing.length > 0) {
		return fail(
			'PREFLIGHT-QUADLET-001',
			label,
			[image.ok ? null : image.detail, missing.length ? `Missing ${missing.join(', ')}.` : null]
				.filter(Boolean)
				.join(' '),
			'NEXT: Run bun run init:site or update deploy/quadlets/web.container for this project.'
		);
	}

	if (image.name !== slug) {
		return fail(
			'PREFLIGHT-QUADLET-001',
			label,
			`GHCR image repository is ${image.owner}/${image.name}, expected ${image.owner}/${slug}.`,
			'NEXT: Set Image=ghcr.io/<owner>/<project-slug>:<sha> in deploy/quadlets/web.container.'
		);
	}

	return pass(
		'PREFLIGHT-QUADLET-001',
		label,
		`Quadlet points at ghcr.io/${image.owner}/${slug}:${image.tag}.`,
		'NEXT: Pin the deployed tag to an immutable commit SHA.'
	);
}

export async function checkGhcrImageShape(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'GHCR image name matches owner/project-slug';
	const path = join(context.rootDir, 'deploy/quadlets/web.container');
	if (!existsSync(path)) {
		return fail(
			'PREFLIGHT-GHCR-001',
			label,
			'deploy/quadlets/web.container is missing.',
			'NEXT: Restore the Quadlet template or project unit file.'
		);
	}

	const image = parseImageReference(readFileSync(path, 'utf8'));
	if (!image.ok)
		return fail(
			'PREFLIGHT-GHCR-001',
			label,
			image.detail,
			'NEXT: Use Image=ghcr.io/<owner>/<project-slug>:<sha>.'
		);

	const slug = projectSlug(context.rootDir);
	if (!/^[a-z0-9][a-z0-9-]*$/u.test(image.owner) || image.name !== slug) {
		return fail(
			'PREFLIGHT-GHCR-001',
			label,
			`GHCR image is ghcr.io/${image.owner}/${image.name}; expected owner/${slug}.`,
			'NEXT: Align the GHCR owner and repository with this project slug.'
		);
	}

	return pass(
		'PREFLIGHT-GHCR-001',
		label,
		`GHCR image is ghcr.io/${image.owner}/${image.name}.`,
		'NEXT: Confirm CI pushes this image before deployment.'
	);
}

export async function checkBackupConfigured(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Backups are configured or explicitly waived';
	const envReference = readProdEnv(context);
	const processEnv = context.env ?? process.env;
	if (processEnv.BACKUP_WAIVED === 'true') {
		return pass(
			'PREFLIGHT-BACKUP-001',
			label,
			'BACKUP_WAIVED=true is set for this deploy.',
			'NEXT: Record the backup waiver in the launch notes.'
		);
	}
	if (!envReference.ok)
		return fail(
			'PREFLIGHT-BACKUP-001',
			label,
			envReference.detail,
			'NEXT: Configure BACKUP_REMOTE or set BACKUP_WAIVED=true for this deploy.'
		);
	if (envReference.env.BACKUP_WAIVED === 'true') {
		return pass(
			'PREFLIGHT-BACKUP-001',
			label,
			'BACKUP_WAIVED=true is set in production env.',
			'NEXT: Record the backup waiver in the launch notes.'
		);
	}
	if (!envReference.env.BACKUP_REMOTE?.trim()) {
		return fail(
			'PREFLIGHT-BACKUP-001',
			label,
			'BACKUP_REMOTE is missing.',
			'NEXT: Configure BACKUP_REMOTE or set BACKUP_WAIVED=true for this deploy.'
		);
	}
	return pass(
		'PREFLIGHT-BACKUP-001',
		label,
		'BACKUP_REMOTE is configured.',
		'NEXT: Run bun run backup:check before the first production deploy.'
	);
}

export async function checkRequiredLaunchBlockers(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const results = await evaluateLaunchBlockers({
		rootDir: context.rootDir,
		env: context.env ?? process.env,
		envSource: 'prod',
		prodEnvPath: context.prodEnvPath,
	});
	const failures = results.filter((item) => item.severity === 'required' && item.status !== 'pass');
	if (failures.length) {
		return fail(
			'PREFLIGHT-LAUNCH-001',
			'Required launch blockers pass',
			failures.map((item) => `${item.id}: ${item.detail ?? item.label}`).join(' '),
			'NEXT: Run bun run launch:check and fix every required LAUNCH-* blocker.'
		);
	}

	return pass(
		'PREFLIGHT-LAUNCH-001',
		'Required launch blockers pass',
		'All required LAUNCH-* blockers pass.',
		'NEXT: Review recommended launch warnings before shipping.'
	);
}

export const DEPLOY_PREFLIGHT_CHECKS: CheckDefinition[] = [
	{ id: 'PREFLIGHT-ENV-001', label: 'Production env file exists', run: checkProductionEnvFile },
	{ id: 'PREFLIGHT-SECRETS-001', label: 'SOPS render succeeds', run: checkSopsRender },
	{
		id: 'PREFLIGHT-DB-001',
		label: 'DATABASE_URL is production-shaped',
		run: checkDatabaseUrlShape,
	},
	{ id: 'PREFLIGHT-ENV-002', label: 'Origins are HTTPS and match', run: checkHttpsOrigins },
	{ id: 'PREFLIGHT-CADDY-001', label: 'Caddyfile domain is replaced', run: checkCaddyfileDomain },
	{ id: 'PREFLIGHT-QUADLET-001', label: 'Quadlet names align', run: checkQuadletProject },
	{ id: 'PREFLIGHT-GHCR-001', label: 'GHCR image name aligns', run: checkGhcrImageShape },
	{ id: 'PREFLIGHT-BACKUP-001', label: 'Backups configured or waived', run: checkBackupConfigured },
	{
		id: 'PREFLIGHT-LAUNCH-001',
		label: 'Required launch blockers pass',
		run: checkRequiredLaunchBlockers,
	},
];

export async function runDeployPreflight(
	options: Partial<DeployPreflightContext> = {}
): Promise<{ results: DeployPreflightResult[]; exitCode: number }> {
	const context: DeployPreflightContext = {
		rootDir: options.rootDir ?? process.cwd(),
		env: options.env ?? process.env,
		runner: options.runner,
		prodEnvPath: options.prodEnvPath,
	};
	const results = await Promise.all(DEPLOY_PREFLIGHT_CHECKS.map((check) => check.run(context)));
	return {
		results,
		exitCode: results.some((item) => item.status === 'fail') ? 1 : 0,
	};
}

export async function main(
	options: Partial<DeployPreflightContext> & {
		stdout?: Pick<NodeJS.WriteStream, 'write'>;
		stderr?: Pick<NodeJS.WriteStream, 'write'>;
	} = {}
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const result = await runDeployPreflight({
		rootDir: options.rootDir ?? ROOT_DIR,
		env: options.env ?? process.env,
		runner: options.runner,
		prodEnvPath: options.prodEnvPath,
	});
	const lines = ['Deploy preflight'];
	for (const item of result.results) {
		const prefix = item.status === 'pass' ? 'OK  ' : 'FAIL';
		lines.push(`  ${prefix} ${item.id} ${item.detail}`);
		if (item.status === 'fail') lines.push(`       ${item.hint}`);
	}
	lines.push('');

	const output = lines.join('\n');
	if (result.exitCode === 0) stdout.write(`${output}deploy:preflight passed.\n`);
	else stderr.write(`${output}deploy:preflight failed.\n`);
	return result.exitCode;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	process.exit(await main());
}
