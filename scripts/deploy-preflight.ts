#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnv, type EnvMap } from './lib/env-file';
import { evaluateLaunchBlockers } from './lib/launch-blockers';
import { run as defaultRunner, type RunResult } from './lib/run';
import { REQUIRED_PRIVATE_ENV_VARS, REQUIRED_PUBLIC_ENV_VARS } from '../src/lib/server/env';
import {
	fail as opsFail,
	info as opsInfo,
	pass as opsPass,
	severityToExitCode,
	type OpsResult,
} from './lib/ops-result';

export type DeployPreflightResult = OpsResult;

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
	run: (context: DeployPreflightContext) => Promise<OpsResult>;
	/**
	 * When true, this check is skipped (with a synthesized 'skip' result) when
	 * PREFLIGHT-ENV-001 fails. Avoids duplicating the same "no production env
	 * file" error across every check that reads it.
	 */
	dependsOnEnv?: boolean;
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

function remediation(hint: string): string[] {
	return [hint.startsWith('NEXT:') ? hint : `NEXT: ${hint}`];
}

function pass(id: string, summary: string, detail: string, hint: string): OpsResult {
	return opsPass(id, summary, { detail, remediation: remediation(hint) });
}

function fail(id: string, summary: string, detail: string, hint: string): OpsResult {
	return opsFail(id, summary, { detail, remediation: remediation(hint) });
}

function skip(id: string, summary: string, reason: string, hint: string): OpsResult {
	return opsInfo(id, summary, { detail: reason, remediation: remediation(hint) });
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
	try {
		const manifest = readJson(join(rootDir, 'site.project.json'));
		const project = manifest.project;
		if (project && typeof project === 'object') {
			const value = (project as Record<string, unknown>).projectSlug;
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
	} catch {
		// Fall back to package.json for partial fixtures and older projects.
	}
	return readPackageName(rootDir)
		.replace(/[^a-z0-9-]/giu, '-')
		.toLowerCase();
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

function missingLines(content: string, lines: readonly string[]): string[] {
	return lines.filter((line) => !content.includes(line));
}

function missingFileOrLines(rootDir: string, path: string, lines: readonly string[]): string[] {
	const absolutePath = join(rootDir, path);
	if (!existsSync(absolutePath)) return [`${path} is missing.`];
	const content = readFileSync(absolutePath, 'utf8');
	return missingLines(content, lines).map((line) => `${path} missing ${line}.`);
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
	const label = 'Production DATABASE_URL targets shared platform Postgres';
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
			'NEXT: Set DATABASE_URL to postgres://...@web-platform-postgres:5432/<client>_app.'
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
	if (!parsed.hostname) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			'DATABASE_URL is missing a host.',
			'NEXT: Use the shared platform Postgres hostname web-platform-postgres.'
		);
	}
	if (hostIsForbidden(parsed.hostname)) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			`DATABASE_URL points to ${parsed.hostname}.`,
			'NEXT: Use the shared platform Postgres hostname web-platform-postgres for production web containers.'
		);
	}
	return pass(
		'PREFLIGHT-DB-001',
		label,
		`DATABASE_URL uses host ${parsed.hostname}.`,
		'NEXT: Platform-owned scripts run migrations before website deploys.'
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
	const siteProject = readJson(join(context.rootDir, 'site.project.json'));
	const deployment = siteProject.deployment;
	const loopbackPort =
		deployment && typeof deployment === 'object'
			? (deployment as Record<string, unknown>).loopbackPort
			: null;
	const expectedPort =
		typeof loopbackPort === 'number' || typeof loopbackPort === 'string'
			? String(loopbackPort)
			: '3000';
	const expectedLines = [
		`EnvironmentFile=%h/secrets/${slug}.prod.env`,
		'Network=web-platform.network',
		`PublishPort=127.0.0.1:${expectedPort}:3000`,
		`HostName=${slug}-web`,
		'StopTimeout=15',
	];
	const missing = missingLines(content, expectedLines);

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

export async function checkRuntimeReachability(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Host Caddy reaches web through loopback publish';
	const siteProject = readJson(join(context.rootDir, 'site.project.json'));
	const deployment = siteProject.deployment;
	const loopbackPort =
		deployment && typeof deployment === 'object'
			? (deployment as Record<string, unknown>).loopbackPort
			: null;
	const expectedPort =
		typeof loopbackPort === 'number' || typeof loopbackPort === 'string'
			? String(loopbackPort)
			: '3000';
	const problems = [
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/web.container', [
			`PublishPort=127.0.0.1:${expectedPort}:3000`,
		]),
		...missingFileOrLines(context.rootDir, 'deploy/Caddyfile.example', [
			`reverse_proxy 127.0.0.1:${expectedPort}`,
		]),
	];

	if (problems.length) {
		return fail(
			'PREFLIGHT-RUNTIME-001',
			label,
			problems.join(' '),
			'NEXT: Keep deploy/quadlets/web.container PublishPort and deploy/Caddyfile.example reverse_proxy aligned.'
		);
	}

	return pass(
		'PREFLIGHT-RUNTIME-001',
		label,
		`web.container publishes 127.0.0.1:${expectedPort} and Caddy proxies to the same loopback port.`,
		'NEXT: If you change one port for a multi-site host, change the other in the same deploy.'
	);
}

export async function checkEnvExamples(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Required runtime env names are documented';
	const required = [
		...REQUIRED_PUBLIC_ENV_VARS,
		...REQUIRED_PRIVATE_ENV_VARS,
		'CLIENT_SLUG',
		'DATABASE_POOL_MAX',
		'DATABASE_STATEMENT_TIMEOUT_MS',
	];
	const files = ['.env.example', 'deploy/env.example'];
	const problems: string[] = [];

	for (const file of files) {
		const path = join(context.rootDir, file);
		if (!existsSync(path)) {
			problems.push(`${file} is missing.`);
			continue;
		}
		const content = readFileSync(path, 'utf8');
		for (const key of required) {
			if (!new RegExp(`^${key}=`, 'mu').test(content)) problems.push(`${file} missing ${key}.`);
		}
	}

	if (problems.length) {
		return fail(
			'PREFLIGHT-ENV-003',
			label,
			problems.join(' '),
			'NEXT: Keep .env.example and deploy/env.example aligned with src/lib/server/env.ts.'
		);
	}

	return pass(
		'PREFLIGHT-ENV-003',
		label,
		`${required.join(', ')} are present in .env.example and deploy/env.example.`,
		'NEXT: Add new required env vars to both example files in the same change.'
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

export async function checkRequiredLaunchBlockers(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const results = await evaluateLaunchBlockers({
		rootDir: context.rootDir,
		env: context.env ?? process.env,
		envSource: 'prod',
		prodEnvPath: context.prodEnvPath,
	});
	const failures = results.filter((item) => item.severity === 'required' && item.status === 'fail');
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
		dependsOnEnv: true,
	},
	{
		id: 'PREFLIGHT-ENV-002',
		label: 'Origins are HTTPS and match',
		run: checkHttpsOrigins,
		dependsOnEnv: true,
	},
	{ id: 'PREFLIGHT-CADDY-001', label: 'Caddyfile domain is replaced', run: checkCaddyfileDomain },
	{ id: 'PREFLIGHT-QUADLET-001', label: 'Quadlet names align', run: checkQuadletProject },
	{
		id: 'PREFLIGHT-RUNTIME-001',
		label: 'Loopback runtime reachability aligns',
		run: checkRuntimeReachability,
	},
	{ id: 'PREFLIGHT-ENV-003', label: 'Env examples include required names', run: checkEnvExamples },
	{ id: 'PREFLIGHT-GHCR-001', label: 'GHCR image name aligns', run: checkGhcrImageShape },
	{
		id: 'PREFLIGHT-LAUNCH-001',
		label: 'Required launch blockers pass',
		run: checkRequiredLaunchBlockers,
		dependsOnEnv: true,
	},
];

export async function runDeployPreflight(
	options: Partial<DeployPreflightContext> = {}
): Promise<{ results: OpsResult[]; exitCode: number }> {
	const context: DeployPreflightContext = {
		rootDir: options.rootDir ?? process.cwd(),
		env: options.env ?? process.env,
		runner: options.runner,
		prodEnvPath: options.prodEnvPath,
	};

	// Run PREFLIGHT-ENV-001 first so we can short-circuit env-dependent checks
	// when the production env file is missing. This collapses what used to be
	// 7+ duplicate "no production env file found" failures into a single FAIL
	// plus SKIPs that point back at it.
	const envCheck = DEPLOY_PREFLIGHT_CHECKS.find((check) => check.id === 'PREFLIGHT-ENV-001');
	if (!envCheck) throw new Error('PREFLIGHT-ENV-001 is required in DEPLOY_PREFLIGHT_CHECKS.');
	const envResult = await envCheck.run(context);
	const envOk = envResult.severity === 'pass';

	const otherResults = await Promise.all(
		DEPLOY_PREFLIGHT_CHECKS.filter((check) => check.id !== 'PREFLIGHT-ENV-001').map((check) => {
			if (!envOk && check.dependsOnEnv) {
				return Promise.resolve(
					skip(
						check.id,
						check.label,
						'depends on PREFLIGHT-ENV-001 (production env file missing)',
						'NEXT: Provide a production env file, then re-run bun run deploy:preflight.'
					)
				);
			}
			return check.run(context);
		})
	);

	const order = new Map(DEPLOY_PREFLIGHT_CHECKS.map((check, i) => [check.id, i]));
	const results = [envResult, ...otherResults].sort(
		(a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
	);

	return {
		results,
		exitCode: severityToExitCode(
			results.some((item) => item.severity === 'fail') ? 'fail' : 'pass'
		),
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
		const prefix = item.severity === 'pass' ? 'OK  ' : item.severity === 'info' ? 'SKIP' : 'FAIL';
		lines.push(`  ${prefix} ${item.id} ${item.detail}`);
		if (item.severity === 'fail' || item.severity === 'info') {
			for (const step of item.remediation ?? []) lines.push(`       ${step}`);
		}
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
