import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { BootstrapScriptError } from './errors';
import { detectContainerRuntime, type ContainerRuntime } from './preflight';
import { run, type RunResult } from './run';

// Local-bootstrap Postgres image. Pinned to the same major as the shared
// platform production cluster. Local dev does not need WAL-G, so we use the
// smaller alpine variant.
export const POSTGRES_IMAGE = 'docker.io/library/postgres:18-alpine';
export const BOOTSTRAP_LABELS = {
	'tmpl-svelte-app.bootstrap': 'true',
	'tmpl-svelte-app.contract-version': '1',
} as const;

export type ProvisionLocalPostgresResult = {
	runtime: ContainerRuntime | 'external';
	container: string | null;
	port: number | null;
	databaseUrl: string;
};

export type ProvisionLocalPostgresOptions = {
	projectSlug: string;
	existingDatabaseUrl?: string;
	runtime?: ContainerRuntime | null;
	commandRunner?: (
		command: string,
		args: readonly string[],
		options?: { capture?: boolean }
	) => Promise<RunResult>;
	isDatabaseReachable?: (databaseUrl: string) => Promise<boolean>;
	isPortAvailable?: (port: number) => Promise<boolean>;
	password?: string;
	readinessTimeoutMs?: number;
	readinessIntervalMs?: number;
};

type Labels = Record<string, string>;

const MIN_PORT = 50000;
const MAX_PORT = 55000;

function hashSlug(slug: string): number {
	let hash = 0;
	for (const char of slug) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return hash;
}

export function sanitizeProjectSlug(slug: string): string {
	const sanitized = slug
		.toLowerCase()
		.replace(/[^a-z0-9-]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.replace(/-{2,}/gu, '-');
	return sanitized || 'tmpl-svelte-app';
}

export function postgresIdentifiers(slug: string): {
	database: string;
	user: string;
	container: string;
} {
	const containerSlug = sanitizeProjectSlug(slug);
	const database = `${containerSlug.replace(/-/g, '_')}_app`;
	return {
		database,
		user: `${database}_user`,
		container: `${containerSlug}-postgres`,
	};
}

async function defaultPortAvailable(port: number): Promise<boolean> {
	return await new Promise((resolve) => {
		const server = createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close(() => resolve(true));
		});
		server.listen(port, '127.0.0.1');
	});
}

export async function allocatePostgresPort(
	slug: string,
	isPortAvailable: (port: number) => Promise<boolean> = defaultPortAvailable
): Promise<number> {
	const totalPorts = MAX_PORT - MIN_PORT + 1;
	const start = MIN_PORT + (hashSlug(sanitizeProjectSlug(slug)) % 5000);

	for (let offset = 0; offset < totalPorts; offset += 1) {
		const port = MIN_PORT + ((start - MIN_PORT + offset) % totalPorts);
		if (await isPortAvailable(port)) return port;
	}

	throw new BootstrapScriptError(
		'BOOT-PG-003',
		'Could not allocate a Postgres host port within 50000-55000.',
		'NEXT: Stop another local service in that port range or set a different project slug.'
	);
}

function buildDatabaseUrl(user: string, password: string, port: number, database: string): string {
	return `postgres://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
}

function hasBootstrapLabels(labels: Labels | null, slug: string): boolean {
	if (!labels) return false;
	return (
		labels['tmpl-svelte-app.bootstrap'] === BOOTSTRAP_LABELS['tmpl-svelte-app.bootstrap'] &&
		labels['tmpl-svelte-app.contract-version'] ===
			BOOTSTRAP_LABELS['tmpl-svelte-app.contract-version'] &&
		labels['tmpl-svelte-app.project-slug'] === sanitizeProjectSlug(slug)
	);
}

async function inspectLabels(
	runtime: ContainerRuntime,
	container: string,
	commandRunner: NonNullable<ProvisionLocalPostgresOptions['commandRunner']>
): Promise<Labels | null> {
	const result = await commandRunner(
		runtime,
		['inspect', container, '--format', '{{json .Config.Labels}}'],
		{
			capture: true,
		}
	);
	if (result.code !== 0) return null;
	try {
		return JSON.parse(result.stdout.trim()) as Labels;
	} catch {
		return null;
	}
}

async function inspectPort(
	runtime: ContainerRuntime,
	container: string,
	commandRunner: NonNullable<ProvisionLocalPostgresOptions['commandRunner']>
): Promise<number | null> {
	const result = await commandRunner(runtime, ['port', container, '5432/tcp'], { capture: true });
	if (result.code !== 0) return null;
	const match = result.stdout.match(/:(\d+)\s*$/u);
	return match ? Number.parseInt(match[1], 10) : null;
}

async function waitForReadiness({
	runtime,
	container,
	database,
	user,
	commandRunner,
	timeoutMs,
	intervalMs,
}: {
	runtime: ContainerRuntime;
	container: string;
	database: string;
	user: string;
	commandRunner: NonNullable<ProvisionLocalPostgresOptions['commandRunner']>;
	timeoutMs: number;
	intervalMs: number;
}): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastResult: RunResult | null = null;

	while (Date.now() <= deadline) {
		lastResult = await commandRunner(
			runtime,
			['exec', container, 'pg_isready', '-U', user, '-d', database],
			{ capture: true }
		);
		if (lastResult.code === 0) return;
		await delay(intervalMs);
	}

	throw new BootstrapScriptError(
		'BOOT-PG-002',
		`Postgres container ${container} did not become ready.`,
		`NEXT: Inspect container logs. Last readiness output: ${lastResult?.stderr || lastResult?.stdout || 'none'}`
	);
}

export async function provisionLocalPostgres(
	options: ProvisionLocalPostgresOptions
): Promise<ProvisionLocalPostgresResult> {
	if (
		options.existingDatabaseUrl &&
		(await options.isDatabaseReachable?.(options.existingDatabaseUrl))
	) {
		return {
			runtime: 'external',
			container: null,
			port: null,
			databaseUrl: options.existingDatabaseUrl,
		};
	}

	const runtime = options.runtime === undefined ? await detectContainerRuntime() : options.runtime;
	if (runtime !== 'podman') {
		throw new BootstrapScriptError(
			'BOOT-PG-001',
			'No reachable Postgres database and no Podman runtime detected.',
			'NEXT: Install Podman or set DATABASE_URL to a reachable local project Postgres database.'
		);
	}

	const commandRunner = options.commandRunner ?? run;
	const slug = sanitizeProjectSlug(options.projectSlug);
	const { database, user, container } = postgresIdentifiers(slug);
	const password = options.password ?? randomBytes(32).toString('hex');

	const existingLabels = await inspectLabels(runtime, container, commandRunner);
	if (existingLabels) {
		if (!hasBootstrapLabels(existingLabels, slug)) {
			throw new BootstrapScriptError(
				'BOOT-PG-002',
				`Container ${container} already exists but is not bootstrap-owned.`,
				'NEXT: Remove or rename the container, or choose a different project slug.'
			);
		}
		const port = await inspectPort(runtime, container, commandRunner);
		await waitForReadiness({
			runtime,
			container,
			database,
			user,
			commandRunner,
			timeoutMs: options.readinessTimeoutMs ?? 30_000,
			intervalMs: options.readinessIntervalMs ?? 500,
		});
		return {
			runtime,
			container,
			port,
			databaseUrl:
				options.existingDatabaseUrl ??
				(port ? buildDatabaseUrl(user, password, port, database) : ''),
		};
	}

	const port = await allocatePostgresPort(slug, options.isPortAvailable);
	await commandRunner(runtime, ['pull', POSTGRES_IMAGE]);
	const result = await commandRunner(runtime, [
		'run',
		'-d',
		'--name',
		container,
		'--label',
		'tmpl-svelte-app.bootstrap=true',
		'--label',
		`tmpl-svelte-app.project-slug=${slug}`,
		'--label',
		'tmpl-svelte-app.contract-version=1',
		'-p',
		`127.0.0.1:${port}:5432`,
		'-e',
		`POSTGRES_DB=${database}`,
		'-e',
		`POSTGRES_USER=${user}`,
		'-e',
		`POSTGRES_PASSWORD=${password}`,
		POSTGRES_IMAGE,
	]);
	if (result.code !== 0) {
		throw new BootstrapScriptError(
			'BOOT-PG-002',
			`Failed to start Postgres container ${container}.`,
			'NEXT: Inspect the container runtime output above and retry ./bootstrap.'
		);
	}

	await waitForReadiness({
		runtime,
		container,
		database,
		user,
		commandRunner,
		timeoutMs: options.readinessTimeoutMs ?? 30_000,
		intervalMs: options.readinessIntervalMs ?? 500,
	});

	return {
		runtime,
		container,
		port,
		databaseUrl: buildDatabaseUrl(user, password, port, database),
	};
}
