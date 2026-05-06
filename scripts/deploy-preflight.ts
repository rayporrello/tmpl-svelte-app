#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnv, type EnvMap } from './lib/env-file';
import { evaluateLaunchBlockers } from './lib/launch-blockers';
import { sanitizeProjectSlug } from './lib/postgres-dev';
import { run as defaultRunner, type RunResult } from './lib/run';
import { REQUIRED_PRIVATE_ENV_VARS, REQUIRED_PUBLIC_ENV_VARS } from '../src/lib/server/env';
import {
	readAutomationProviderConfig,
	validateAutomationProviderConfig,
} from '../src/lib/server/automation/providers';

export type DeployPreflightStatus = 'pass' | 'fail' | 'skip';

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
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
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

function skip(id: string, label: string, reason: string, hint: string): DeployPreflightResult {
	return {
		id,
		label,
		status: 'skip',
		detail: reason,
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
	try {
		const manifest = readJson(join(rootDir, 'site.project.json'));
		const project = manifest.project;
		if (project && typeof project === 'object') {
			const value = (project as Record<string, unknown>).projectSlug;
			if (typeof value === 'string' && value.trim()) return sanitizeProjectSlug(value);
		}
	} catch {
		// Fall back to package.json for partial fixtures and older projects.
	}
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
	const slug = projectSlug(context.rootDir);
	const label = 'Production DATABASE_URL targets bundled Postgres';
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
			'NEXT: Set DATABASE_URL to postgres://...@<project>-postgres:5432/<project>_app.'
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
	if (parsed.hostname !== `${slug}-postgres`) {
		return fail(
			'PREFLIGHT-DB-001',
			label,
			`DATABASE_URL points to ${parsed.hostname}.`,
			`NEXT: Use the internal Podman-network host ${slug}-postgres for web and worker containers.`
		);
	}
	return pass(
		'PREFLIGHT-DB-001',
		label,
		`DATABASE_URL uses the internal ${slug}-postgres host.`,
		'NEXT: Keep DATABASE_DIRECT_URL for host migrations/backups/restores.'
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
		'PublishPort=127.0.0.1:3000:3000',
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

export async function checkQuadletNetwork(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Project network Quadlet is coherent';
	const slug = projectSlug(context.rootDir);
	const path = join(context.rootDir, 'deploy/quadlets/web.network');
	if (!existsSync(path)) {
		return fail(
			'PREFLIGHT-QUADLET-002',
			label,
			'deploy/quadlets/web.network is missing.',
			'NEXT: Restore deploy/quadlets/web.network or add the project network unit.'
		);
	}

	const content = readFileSync(path, 'utf8');
	if (content.includes('<project>')) {
		return fail(
			'PREFLIGHT-QUADLET-002',
			label,
			'deploy/quadlets/web.network still contains <project> placeholders.',
			'NEXT: Run bun run init:site or replace <project> with the project slug.'
		);
	}
	if (!content.includes(`[Network]`)) {
		return fail(
			'PREFLIGHT-QUADLET-002',
			label,
			'deploy/quadlets/web.network is missing a [Network] section.',
			'NEXT: Restore the project-local Podman network unit.'
		);
	}

	const webPath = join(context.rootDir, 'deploy/quadlets/web.container');
	const postgresPath = join(context.rootDir, 'deploy/quadlets/postgres.container');
	const webContent = existsSync(webPath) ? readFileSync(webPath, 'utf8') : '';
	const postgresContent = existsSync(postgresPath) ? readFileSync(postgresPath, 'utf8') : '';
	const expectedNetworkLine = `Network=${slug}.network`;
	const missing = [
		!webContent
			? 'deploy/quadlets/web.container is missing.'
			: !webContent.includes(expectedNetworkLine)
				? 'deploy/quadlets/web.container does not join the project network.'
				: null,
		postgresContent && !postgresContent.includes(expectedNetworkLine)
			? 'deploy/quadlets/postgres.container does not join the project network.'
			: null,
	].filter((item): item is string => item !== null);

	if (missing.length) {
		return fail(
			'PREFLIGHT-QUADLET-002',
			label,
			missing.join(' '),
			'NEXT: Keep web and bundled Postgres on the same <project>.network.'
		);
	}

	return pass(
		'PREFLIGHT-QUADLET-002',
		label,
		`web.network exists and containers join ${slug}.network.`,
		'NEXT: Copy it to ~/.config/containers/systemd/<project>.network on the host.'
	);
}

export async function checkRuntimeReachability(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Host Caddy reaches web through loopback publish';
	const problems = [
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/web.container', [
			'PublishPort=127.0.0.1:3000:3000',
		]),
		...missingFileOrLines(context.rootDir, 'deploy/Caddyfile.example', [
			'reverse_proxy 127.0.0.1:3000',
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
		'web.container publishes 127.0.0.1:3000 and Caddy proxies to the same loopback port.',
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
		'DATABASE_DIRECT_URL',
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

export async function checkPostgresArtifacts(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Bundled Postgres Quadlet artifacts are wired';
	const slug = projectSlug(context.rootDir);
	const problems = [
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/postgres.container', [
			// Image must point at the project-built Postgres+WAL-G image, not
			// a stock postgres:* tag. The template ships postgres:18-bookworm
			// + WAL-G via deploy/Containerfile.postgres.
			`Image=ghcr.io/`,
			`-postgres:`,
			`EnvironmentFile=%h/secrets/${slug}.prod.env`,
			`Network=${slug}.network`,
			`HostName=${slug}-postgres`,
			'PublishPort=127.0.0.1:5432:5432',
			`Volume=${slug}-postgres-data:/var/lib/postgresql/data`,
			'HealthCmd=pg_isready',
			// archive_command must be wired so WAL streams to R2.
			'archive_mode=on',
			'archive_command',
			'wal-g wal-push',
		]),
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/postgres.volume', [
			`VolumeName=${slug}-postgres-data`,
		]),
		...missingFileOrLines(context.rootDir, 'deploy/Containerfile.postgres', [
			'FROM docker.io/library/postgres:',
			'WAL_G_VERSION',
			'wal-g --version',
		]),
	];

	if (problems.length) {
		return fail(
			'PREFLIGHT-POSTGRES-001',
			label,
			problems.join(' '),
			'NEXT: Restore deploy/quadlets/postgres.{container,volume}, deploy/Containerfile.postgres, or update them for this project.'
		);
	}

	return pass(
		'PREFLIGHT-POSTGRES-001',
		label,
		`Postgres container, WAL-G image, and volume artifacts are present for ${slug}.`,
		'NEXT: Install them with the web and worker Quadlets for every production project.'
	);
}

export async function checkPostgresEnvShape(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Bundled Postgres env values are present';
	const envReference = readProdEnv(context);
	if (!envReference.ok) {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			envReference.detail,
			'NEXT: Add DATABASE_URL to the production env file before checking bundled Postgres env values.'
		);
	}

	const slug = projectSlug(context.rootDir);
	const databaseUrl = envReference.env.DATABASE_URL?.trim();
	if (!databaseUrl) {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			'DATABASE_URL is missing.',
			'NEXT: Set DATABASE_URL to postgres://...@<project>-postgres:5432/<project>_app.'
		);
	}

	let parsedDatabaseUrl: URL;
	try {
		parsedDatabaseUrl = new URL(databaseUrl);
	} catch {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			'DATABASE_URL is not parseable.',
			'NEXT: Use postgres://user:password@host:port/database.'
		);
	}

	if (parsedDatabaseUrl.hostname !== `${slug}-postgres`) {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			`DATABASE_URL targets ${parsedDatabaseUrl.hostname}; expected ${slug}-postgres.`,
			'NEXT: DATABASE_URL is the internal app/worker URL on the project Podman network.'
		);
	}

	const requiredKeys = [
		'DATABASE_DIRECT_URL',
		'POSTGRES_DB',
		'POSTGRES_USER',
		'POSTGRES_PASSWORD',
	] as const;
	const missing = requiredKeys.filter((key) => !envReference.env[key]?.trim());
	if (missing.length) {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			`DATABASE_URL targets bundled Postgres but ${missing.join(', ')} ${
				missing.length === 1 ? 'is' : 'are'
			} missing.`,
			'NEXT: Add the bundled Postgres env values shown in deploy/env.example.'
		);
	}

	const expectedDbSlug = slug.replace(/-/g, '_');
	const expectedDatabase = `${expectedDbSlug}_app`;
	const expectedUser = `${expectedDbSlug}_app_user`;
	const runtimeDatabase = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/u, ''));
	if (
		runtimeDatabase !== expectedDatabase ||
		decodeURIComponent(parsedDatabaseUrl.username) !== expectedUser ||
		envReference.env.POSTGRES_DB !== expectedDatabase ||
		envReference.env.POSTGRES_USER !== expectedUser
	) {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			`Expected app database/role ${expectedDatabase}/${expectedUser}; found DATABASE_URL user/db ${decodeURIComponent(
				parsedDatabaseUrl.username
			)}/${runtimeDatabase} and POSTGRES_DB/USER ${envReference.env.POSTGRES_DB}/${envReference.env.POSTGRES_USER}.`,
			'NEXT: Use the generated per-project app database and role names; hyphens in the project slug become underscores in Postgres identifiers.'
		);
	}

	let directUrl: URL;
	try {
		directUrl = new URL(envReference.env.DATABASE_DIRECT_URL ?? '');
	} catch {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			'DATABASE_DIRECT_URL is not parseable.',
			'NEXT: Use postgres://user:password@127.0.0.1:5432/database for the bundled Postgres host tools path.'
		);
	}

	if (!LOOPBACK_HOSTS.has(directUrl.hostname)) {
		return fail(
			'PREFLIGHT-POSTGRES-002',
			label,
			`DATABASE_DIRECT_URL points to ${directUrl.hostname}.`,
			'NEXT: Point DATABASE_DIRECT_URL at the loopback-published Postgres port for host-side migrations and backups.'
		);
	}

	return pass(
		'PREFLIGHT-POSTGRES-002',
		label,
		`DATABASE_URL uses ${slug}-postgres and host tools use ${directUrl.hostname}.`,
		'NEXT: Run bun run db:migrate explicitly before starting or restarting the web service.'
	);
}

export async function checkAutomationWorkerArtifact(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Automation worker container is wired';
	const slug = projectSlug(context.rootDir);
	const problems = [
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/worker.container', [
			'Image=ghcr.io/',
			'Exec=bun run scripts/automation-worker.ts -- --daemon',
			`EnvironmentFile=%h/secrets/${slug}.prod.env`,
			`Network=${slug}.network`,
			`HostName=${slug}-worker`,
			'Restart=on-failure',
		]),
	];

	if (problems.length) {
		return fail(
			'PREFLIGHT-WORKER-001',
			label,
			problems.join(' '),
			'NEXT: Restore deploy/quadlets/worker.container or update it for this project.'
		);
	}

	return pass(
		'PREFLIGHT-WORKER-001',
		label,
		`Automation worker Quadlet container is present for ${slug}.`,
		'NEXT: Install it as ~/.config/containers/systemd/<project>-worker.container alongside web and postgres.'
	);
}

export async function checkBackupPitrConfig(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'PITR backup config is present for bundled Postgres';
	const envReference = readProdEnv(context);
	if (!envReference.ok) {
		return fail(
			'PREFLIGHT-BACKUP-PITR-001',
			label,
			envReference.detail,
			'NEXT: Add the production env file before checking PITR config.'
		);
	}

	const slug = projectSlug(context.rootDir);

	const requiredKeys = [
		'R2_ACCESS_KEY_ID',
		'R2_SECRET_ACCESS_KEY',
		'R2_ENDPOINT',
		'R2_BUCKET',
		'R2_PREFIX',
		'PITR_RETENTION_DAYS',
	];
	const missing = requiredKeys.filter((key) => !envReference.env[key]?.trim());
	if (missing.length) {
		return fail(
			'PREFLIGHT-BACKUP-PITR-001',
			label,
			`Bundled Postgres path requires R2 credentials but ${missing.join(', ')} ${
				missing.length === 1 ? 'is' : 'are'
			} missing.`,
			'NEXT: Configure the R2_* values in the production env file. See docs/operations/backups.md.'
		);
	}

	const baseTimerProblems = missingFileOrLines(
		context.rootDir,
		'deploy/systemd/backup-base.timer',
		[`Unit=${slug}-backup-base.service`]
	);
	const checkTimerProblems = missingFileOrLines(
		context.rootDir,
		'deploy/systemd/backup-check.timer',
		[`Unit=${slug}-backup-check.service`]
	);

	if (baseTimerProblems.length || checkTimerProblems.length) {
		return fail(
			'PREFLIGHT-BACKUP-PITR-001',
			label,
			[...baseTimerProblems, ...checkTimerProblems].join(' '),
			'NEXT: Restore deploy/systemd/backup-base.{service,timer} and backup-check.{service,timer}.'
		);
	}

	return pass(
		'PREFLIGHT-BACKUP-PITR-001',
		label,
		`R2 credentials are set and backup-base/backup-check timers are wired for ${slug}.`,
		'NEXT: Run bun run backup:pitr:check on the host to verify the chain end-to-end.'
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

export async function checkAutomationProviderConfig(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Automation provider has the config it needs';
	const envReference = readProdEnv(context);
	if (!envReference.ok) {
		return fail(
			'PREFLIGHT-AUTOMATION-001',
			label,
			envReference.detail,
			'NEXT: Add the production env file before checking automation config.'
		);
	}

	const config = readAutomationProviderConfig(envReference.env as NodeJS.ProcessEnv);
	const problems = validateAutomationProviderConfig(config);

	if (problems.length > 0) {
		const detail =
			config.provider === 'n8n' || config.provider === 'webhook'
				? `AUTOMATION_PROVIDER=${config.provider} but ${problems.map((p) => p.message).join(' ')}`
				: problems.map((p) => p.message).join(' ');
		const hint =
			config.provider === 'console'
				? 'NEXT: For production, use AUTOMATION_PROVIDER=n8n with N8N_WEBHOOK_URL/SECRET, or set AUTOMATION_PROVIDER=noop to explicitly disable automation.'
				: `NEXT: Set the missing ${config.provider.toUpperCase()} env values, or set AUTOMATION_PROVIDER=noop if this site has no automation.`;
		return fail('PREFLIGHT-AUTOMATION-001', label, detail, hint);
	}

	if (config.provider === 'noop') {
		return pass(
			'PREFLIGHT-AUTOMATION-001',
			label,
			'AUTOMATION_PROVIDER=noop — automation is explicitly disabled for this site.',
			'NEXT: Switch to AUTOMATION_PROVIDER=n8n (with N8N_WEBHOOK_URL/SECRET) when this site adopts automation.'
		);
	}

	if (config.provider === 'console') {
		// validateAutomationProviderConfig already returned a problem above; the
		// early return narrows the union for TypeScript before the auth-mode access.
		return pass(
			'PREFLIGHT-AUTOMATION-001',
			label,
			'AUTOMATION_PROVIDER=console — dev-only mode.',
			'NEXT: Use AUTOMATION_PROVIDER=noop in production for explicit no-automation.'
		);
	}

	const auth =
		config.authMode === 'hmac' ? 'HMAC body signing' : `Header auth (${config.authHeader})`;
	return pass(
		'PREFLIGHT-AUTOMATION-001',
		label,
		`AUTOMATION_PROVIDER=${config.provider} is fully configured (${auth}).`,
		'NEXT: Confirm the matching n8n / receiver workflow accepts this auth mode.'
	);
}

export async function checkN8nBundleConfig(
	context: DeployPreflightContext
): Promise<DeployPreflightResult> {
	const label = 'Per-client n8n bundle is isolated when enabled';
	const envReference = readProdEnv(context);
	if (!envReference.ok) {
		return fail(
			'PREFLIGHT-N8N-001',
			label,
			envReference.detail,
			'NEXT: Add the production env file before checking n8n bundle config.'
		);
	}

	const enabled = envReference.env.N8N_ENABLED?.trim().toLowerCase() === 'true';
	if (!enabled) {
		return pass(
			'PREFLIGHT-N8N-001',
			label,
			'N8N_ENABLED is not true; no per-client n8n container is expected.',
			'NEXT: Run bun run n8n:enable before enabling the n8n Quadlet for this client.'
		);
	}

	const slug = projectSlug(context.rootDir);
	const safeSlug = slug.replace(/-/g, '_');
	const requiredKeys = ['N8N_ENCRYPTION_KEY', 'N8N_HOST', 'N8N_PROTOCOL', 'DB_POSTGRESDB_PASSWORD'];
	const missing = requiredKeys.filter((key) => !envReference.env[key]?.trim());
	const artifactProblems = [
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/n8n.container', [
			`Requires=${slug}-postgres.service`,
			`DB_POSTGRESDB_HOST=${slug}-postgres`,
			`DB_POSTGRESDB_DATABASE=${safeSlug}_n8n`,
			`DB_POSTGRESDB_USER=${safeSlug}_n8n_user`,
			`EnvironmentFile=%h/secrets/${slug}.prod.env`,
			`Network=${slug}.network`,
		]),
		...missingFileOrLines(context.rootDir, 'deploy/quadlets/n8n.volume', [
			`VolumeName=${slug}-n8n-data`,
		]),
	];

	if (missing.length || artifactProblems.length) {
		return fail(
			'PREFLIGHT-N8N-001',
			label,
			[
				missing.length ? `Missing env: ${missing.join(', ')}.` : null,
				artifactProblems.length ? artifactProblems.join(' ') : null,
			]
				.filter(Boolean)
				.join(' '),
			"NEXT: Run bun run n8n:enable, add the printed values to secrets.yaml, render env, then install only this client's n8n Quadlet."
		);
	}

	return pass(
		'PREFLIGHT-N8N-001',
		label,
		`n8n is enabled with database ${safeSlug}_n8n and role ${safeSlug}_n8n_user inside ${slug}-postgres.`,
		'NEXT: Keep n8n per-client; never point unrelated sites at this n8n database or editor.'
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
	{ id: 'PREFLIGHT-QUADLET-002', label: 'Project network aligns', run: checkQuadletNetwork },
	{
		id: 'PREFLIGHT-RUNTIME-001',
		label: 'Loopback runtime reachability aligns',
		run: checkRuntimeReachability,
	},
	{ id: 'PREFLIGHT-ENV-003', label: 'Env examples include required names', run: checkEnvExamples },
	{
		id: 'PREFLIGHT-POSTGRES-001',
		label: 'Bundled Postgres artifacts align',
		run: checkPostgresArtifacts,
	},
	{
		id: 'PREFLIGHT-POSTGRES-002',
		label: 'Bundled Postgres env aligns',
		run: checkPostgresEnvShape,
		dependsOnEnv: true,
	},
	{
		id: 'PREFLIGHT-WORKER-001',
		label: 'Automation worker artifact aligns',
		run: checkAutomationWorkerArtifact,
	},
	{
		id: 'PREFLIGHT-AUTOMATION-001',
		label: 'Automation provider config is complete',
		run: checkAutomationProviderConfig,
		dependsOnEnv: true,
	},
	{
		id: 'PREFLIGHT-N8N-001',
		label: 'Per-client n8n bundle is isolated',
		run: checkN8nBundleConfig,
		dependsOnEnv: true,
	},
	{ id: 'PREFLIGHT-GHCR-001', label: 'GHCR image name aligns', run: checkGhcrImageShape },
	{
		id: 'PREFLIGHT-BACKUP-PITR-001',
		label: 'PITR backup config is present',
		run: checkBackupPitrConfig,
		dependsOnEnv: true,
	},
	{
		id: 'PREFLIGHT-BACKUP-001',
		label: 'Backups configured or waived',
		run: checkBackupConfigured,
		dependsOnEnv: true,
	},
	{
		id: 'PREFLIGHT-LAUNCH-001',
		label: 'Required launch blockers pass',
		run: checkRequiredLaunchBlockers,
		dependsOnEnv: true,
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

	// Run PREFLIGHT-ENV-001 first so we can short-circuit env-dependent checks
	// when the production env file is missing. This collapses what used to be
	// 7+ duplicate "no production env file found" failures into a single FAIL
	// plus SKIPs that point back at it.
	const envCheck = DEPLOY_PREFLIGHT_CHECKS.find((check) => check.id === 'PREFLIGHT-ENV-001');
	if (!envCheck) throw new Error('PREFLIGHT-ENV-001 is required in DEPLOY_PREFLIGHT_CHECKS.');
	const envResult = await envCheck.run(context);
	const envOk = envResult.status === 'pass';

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
		const prefix = item.status === 'pass' ? 'OK  ' : item.status === 'skip' ? 'SKIP' : 'FAIL';
		lines.push(`  ${prefix} ${item.id} ${item.detail}`);
		if (item.status === 'fail' || item.status === 'skip') lines.push(`       ${item.hint}`);
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
