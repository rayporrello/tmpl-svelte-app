import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, parse, resolve } from 'node:path';

import { runDeployPreflight } from '../deploy-preflight';
import { runDeploySmoke } from '../deploy-smoke';
import { fail, info, pass, warn, type OpsResult } from './ops-result';
import { appendEvent } from './ops-status';
import { parseQuadletImage, replaceQuadletImage } from './quadlet-image';
import { ALL_QUADLETS } from './quadlets';
import { getCurrentRelease, recordRelease, type Release } from './release-state';

export type MigrationSafety = 'rollback-safe' | 'rollback-blocked';

export interface DeployPlan {
	image: string;
	sha: string;
	migrationSafety: MigrationSafety;
	quadletUpdates: Array<{
		path: string;
		oldImage: string;
		newImage: string;
		unitName: string;
	}>;
	migrationsToRun: string[];
}

export interface DeployRunner {
	exec(
		cmd: string[],
		opts?: { stdin?: string }
	): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export type DeployPreflightFunction = typeof runDeployPreflight;
export type DeploySmokeFunction = typeof runDeploySmoke;

export interface PlanDeployOptions {
	image: string;
	sha: string;
	migrationSafety: MigrationSafety;
	deployQuadletsDir?: string;
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	preflight?: DeployPreflightFunction;
}

export interface ApplyDeployOptions {
	dryRun?: boolean;
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	runner?: DeployRunner;
	preflight?: DeployPreflightFunction;
	smoke?: DeploySmokeFunction;
	fetcher?: typeof fetch;
	readinessUrl?: string;
	readinessTimeoutMs?: number;
	readinessIntervalMs?: number;
	smokeBaseUrl?: string;
}

const WEB_DATA_PLATFORM_CLI_MISSING_WARNING =
	'[deploy:apply] web-data-platform CLI not found at WEB_DATA_PLATFORM_PATH — migration gate skipped. Confirm migrations applied manually before deploy.';

type DrizzleJournal = {
	entries?: Array<{ tag?: unknown }>;
};

const IMAGE_REF_PATTERN =
	/^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*:[A-Za-z0-9_][A-Za-z0-9._-]{0,127}(?:@sha256:[a-fA-F0-9]{64})?$/u;

function hasFail(results: readonly OpsResult[]): boolean {
	return results.some((result) => result.severity === 'fail');
}

function unitNameFor(quadletFilename: string): string {
	return `${parse(basename(quadletFilename)).name}.service`;
}

function validateImageRef(image: string): boolean {
	return IMAGE_REF_PATTERN.test(image);
}

function absoluteOrRelativeToRoot(rootDir: string, path: string): string {
	return isAbsolute(path) ? path : join(rootDir, path);
}

function readMigrationFilenames(rootDir: string): string[] {
	const journalPath = join(rootDir, 'drizzle/meta/_journal.json');
	if (!existsSync(journalPath)) return [];

	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as DrizzleJournal;
	return (journal.entries ?? [])
		.map((entry) => (typeof entry.tag === 'string' ? `${entry.tag}.sql` : null))
		.filter((entry): entry is string => entry !== null);
}

function migrationsSinceCurrentRelease(rootDir: string): string[] {
	const applied = new Set(getCurrentRelease()?.migrations ?? []);
	return readMigrationFilenames(rootDir).filter((migration) => !applied.has(migration));
}

async function preflightResults(opts: {
	rootDir: string;
	env: NodeJS.ProcessEnv;
	preflight?: DeployPreflightFunction;
}): Promise<OpsResult[]> {
	const preflight = opts.preflight ?? runDeployPreflight;
	return (await preflight({ rootDir: opts.rootDir, env: opts.env })).results;
}

function summarizePlan(plan: DeployPlan): string {
	return [
		`Image: ${plan.image}`,
		`SHA: ${plan.sha}`,
		`Migration safety: ${plan.migrationSafety}`,
		`Quadlets: ${plan.quadletUpdates.map((update) => update.path).join(', ')}`,
		`Migrations: ${plan.migrationsToRun.length ? plan.migrationsToRun.join(', ') : 'none'}`,
	].join('\n');
}

export async function planDeploy(opts: PlanDeployOptions): Promise<{
	plan: DeployPlan | null;
	results: OpsResult[];
}> {
	const rootDir = opts.rootDir ?? process.cwd();
	const env = opts.env ?? process.env;
	const results: OpsResult[] = [];

	if (!validateImageRef(opts.image)) {
		results.push(
			fail('DEPLOY-PLAN-001', 'Deploy image ref is invalid', {
				detail: `Received: ${opts.image || '(empty)'}`,
				remediation: ['NEXT: Use an immutable image ref such as ghcr.io/owner/repo:sha-abc123.'],
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	}
	if (!opts.sha.trim()) {
		results.push(
			fail('DEPLOY-PLAN-002', 'Deploy SHA is required', {
				remediation: ['NEXT: Pass --sha=<git sha> for the commit being deployed.'],
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	}
	if (hasFail(results)) return { plan: null, results };

	const preflight = await preflightResults({ rootDir, env, preflight: opts.preflight });
	if (hasFail(preflight)) return { plan: null, results: preflight };

	const deployQuadletsDir = absoluteOrRelativeToRoot(
		rootDir,
		opts.deployQuadletsDir ?? join('deploy', 'quadlets')
	);
	let quadletUpdates: DeployPlan['quadletUpdates'];
	try {
		quadletUpdates = ALL_QUADLETS.map((entry) => {
			const path = join(deployQuadletsDir, entry);
			return {
				path,
				oldImage: parseQuadletImage(path).imageRef,
				newImage: opts.image,
				unitName: unitNameFor(entry),
			};
		});
	} catch (error) {
		return {
			plan: null,
			results: [
				fail('DEPLOY-PLAN-003', 'Quadlet image plan could not be built', {
					detail: error instanceof Error ? error.message : String(error),
					remediation: ['NEXT: Fix the Image= lines in deploy/quadlets/*.container.'],
					runbook: 'docs/operations/deploy-apply.md',
				}),
			],
		};
	}

	const plan = {
		image: opts.image,
		sha: opts.sha,
		migrationSafety: opts.migrationSafety,
		quadletUpdates,
		migrationsToRun: migrationsSinceCurrentRelease(rootDir),
	};

	return {
		plan,
		results: [
			info('DEPLOY-PLAN-004', 'Deploy plan ready', {
				detail: summarizePlan(plan),
				runbook: 'docs/operations/deploy-apply.md',
			}),
		],
	};
}

async function streamToText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	if (!stream) return '';
	return await new Response(stream).text();
}

export function createDefaultDeployRunner(): DeployRunner {
	return {
		async exec(cmd: string[], opts: { stdin?: string } = {}) {
			const bun = (
				globalThis as typeof globalThis & {
					Bun?: {
						spawn(
							command: string[],
							options?: object
						): {
							stdout: ReadableStream<Uint8Array> | null;
							stderr: ReadableStream<Uint8Array> | null;
							exited: Promise<number>;
						};
					};
				}
			).Bun;
			if (!bun) throw new Error('deploy:apply requires Bun to execute commands.');

			const proc = bun.spawn(cmd, {
				stdin: opts.stdin ? 'pipe' : 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			});
			if (opts.stdin) {
				// Bun's spawn stdin writer is intentionally not typed here so tests do
				// not need Bun globals. deploy:apply currently does not pass stdin.
			}
			const [exitCode, stdout, stderr] = await Promise.all([
				proc.exited,
				streamToText(proc.stdout),
				streamToText(proc.stderr),
			]);
			return { exitCode, stdout, stderr };
		},
	};
}

function commandOutputDetail(result: { stdout: string; stderr: string }): string {
	return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n') || 'No output.';
}

function rollbackRemediation(migrationSafety: MigrationSafety): string[] {
	if (migrationSafety === 'rollback-safe') return ['bun run rollback --to previous'];
	return [
		'bun run rollback --status',
		'NEXT: This release is rollback-blocked. Use the web-data-platform restore runbook if the database must move back.',
	];
}

async function wait(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function readSiteProject(rootDir: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(join(rootDir, 'site.project.json'), 'utf8')) as Record<
			string,
			unknown
		>;
	} catch {
		return {};
	}
}

function clientSlugFrom(rootDir: string, env: NodeJS.ProcessEnv): string {
	const explicit = env.CLIENT_SLUG?.trim();
	if (explicit) return explicit;
	const siteProject = readSiteProject(rootDir);
	const project = siteProject.project;
	if (project && typeof project === 'object') {
		const slug = (project as Record<string, unknown>).projectSlug;
		if (typeof slug === 'string' && slug.trim()) return slug.trim();
	}
	return 'unknown-client';
}

function webDataPlatformPath(rootDir: string, env: NodeJS.ProcessEnv): string {
	const configured = env.WEB_DATA_PLATFORM_PATH?.trim();
	if (configured) return absoluteOrRelativeToRoot(rootDir, configured);
	return resolve(rootDir, '..', 'web-data-platform');
}

function webDataPlatformCliAvailable(path: string): boolean {
	return existsSync(join(path, 'package.json'));
}

async function verifyMigrationsWithWebDataPlatform(opts: {
	rootDir: string;
	env: NodeJS.ProcessEnv;
	runner: DeployRunner;
	dryRun: boolean;
}): Promise<OpsResult> {
	const dataPlatformPath = webDataPlatformPath(opts.rootDir, opts.env);
	const client = clientSlugFrom(opts.rootDir, opts.env);
	if (!webDataPlatformCliAvailable(dataPlatformPath)) {
		return warn('DEPLOY-MIGRATE-001', 'Migration gate skipped', {
			detail: WEB_DATA_PLATFORM_CLI_MISSING_WARNING,
			remediation: [
				'NEXT: Confirm web-data-platform migrations have been applied manually before deploying this web image.',
			],
			runbook: 'docs/operations/deploy-apply.md',
		});
	}

	const command = [
		'bun',
		'run',
		'--cwd',
		dataPlatformPath,
		'web:fleet-migration-status',
		'--',
		`--client=${client}`,
		`--repo=${opts.rootDir}`,
	];
	if (opts.dryRun) {
		return info(
			'DEPLOY-MIGRATE-DRY-RUN-001',
			'Would verify migrations through web-data-platform CLI',
			{
				detail: command.join(' '),
			}
		);
	}

	const status = await opts.runner.exec(command);
	if (status.exitCode !== 0) {
		return fail('DEPLOY-MIGRATE-001', 'web-data-platform migration gate failed', {
			detail: commandOutputDetail(status),
			remediation: [
				`bun run --cwd ${dataPlatformPath} web:run-fleet-migrations -- --client=${client}`,
			],
			runbook: 'docs/operations/deploy-apply.md',
		});
	}

	return pass('DEPLOY-MIGRATE-001', 'web-data-platform migration gate passed', {
		detail: commandOutputDetail(status),
	});
}

function readPublishedReadyPort(plan: DeployPlan): string | null {
	const webUpdate = plan.quadletUpdates.find((update) => basename(update.path) === 'web.container');
	if (!webUpdate) return null;
	try {
		const content = readFileSync(webUpdate.path, 'utf8');
		return content.match(/^\s*PublishPort=127\.0\.0\.1:(\d+):3000\s*$/mu)?.[1] ?? null;
	} catch {
		return null;
	}
}

function readReadinessUrl(plan: DeployPlan, opts: ApplyDeployOptions): string {
	if (opts.readinessUrl) return opts.readinessUrl;
	const env = opts.env ?? process.env;
	if (env.DEPLOY_APPLY_READINESS_URL) return env.DEPLOY_APPLY_READINESS_URL;

	const rootDir = opts.rootDir ?? process.cwd();
	const siteProject = readSiteProject(rootDir);
	const deployment = siteProject.deployment;
	const deploymentPort =
		deployment && typeof deployment === 'object'
			? ((deployment as Record<string, unknown>).loopbackPort ??
				(deployment as Record<string, unknown>).port)
			: null;
	const port =
		env.DEPLOY_APPLY_READY_PORT ??
		(typeof deploymentPort === 'number' || typeof deploymentPort === 'string'
			? String(deploymentPort)
			: null) ??
		readPublishedReadyPort(plan) ??
		'3000';
	const host = env.DEPLOY_APPLY_READY_HOST ?? '127.0.0.1';
	return `http://${host}:${port}/readyz`;
}

function readSmokeBaseUrl(rootDir: string, opts: ApplyDeployOptions): string {
	if (opts.smokeBaseUrl) return opts.smokeBaseUrl;
	const env = opts.env ?? process.env;
	if (env.DEPLOY_SMOKE_URL) return env.DEPLOY_SMOKE_URL;

	const siteProject = readSiteProject(rootDir);
	const site = siteProject.site;
	const productionUrl =
		site && typeof site === 'object' ? (site as Record<string, unknown>).productionUrl : null;
	if (typeof productionUrl === 'string' && productionUrl.trim()) return productionUrl.trim();
	return 'http://127.0.0.1:3000';
}

async function waitForReadiness(plan: DeployPlan, opts: ApplyDeployOptions): Promise<OpsResult> {
	const fetcher = opts.fetcher ?? fetch;
	const url = readReadinessUrl(plan, opts);
	const timeoutMs = opts.readinessTimeoutMs ?? 60_000;
	const intervalMs = opts.readinessIntervalMs ?? 1_000;
	const deadline = Date.now() + timeoutMs;
	let lastDetail = 'No response yet.';

	while (Date.now() <= deadline) {
		try {
			const response = await fetcher(url);
			if (response.status === 200) {
				return pass('DEPLOY-READY-001', 'Readiness endpoint is healthy', {
					detail: `${url} returned HTTP 200.`,
				});
			}
			lastDetail = `${url} returned HTTP ${response.status}.`;
		} catch (error) {
			lastDetail = error instanceof Error ? error.message : String(error);
		}
		await wait(intervalMs);
	}

	return fail('DEPLOY-READY-001', 'Readiness endpoint did not become healthy', {
		detail: lastDetail,
		remediation: [
			'journalctl --user -u web.service -n 200',
			'NEXT: Fix readiness before routing traffic or attempting another deploy.',
		],
		runbook: 'docs/operations/deploy-apply.md',
	});
}

function releaseId(sha: string, deployedAt: string): string {
	const compactTime = deployedAt.replace(/[-:.TZ]/gu, '').slice(0, 14);
	return `${compactTime}-${sha.slice(0, 12)}`;
}

export async function applyDeploy(
	plan: DeployPlan,
	opts: ApplyDeployOptions = {}
): Promise<OpsResult[]> {
	const dryRun = opts.dryRun === true;
	const rootDir = opts.rootDir ?? process.cwd();
	const env = opts.env ?? process.env;
	const runner = opts.runner ?? createDefaultDeployRunner();
	const results: OpsResult[] = [];

	const preflight = await preflightResults({ rootDir, env, preflight: opts.preflight });
	if (hasFail(preflight)) return preflight;
	results.push(pass('DEPLOY-PREFLIGHT-001', 'Preflight passed'));

	const migrationGate = await verifyMigrationsWithWebDataPlatform({ rootDir, env, runner, dryRun });
	results.push(migrationGate);
	if (migrationGate.severity === 'fail') return results;

	if (dryRun) {
		results.push(
			info('DEPLOY-PULL-DRY-RUN-001', 'Would pull web image', {
				detail: `podman pull ${plan.image}`,
			})
		);
	} else {
		const pull = await runner.exec(['podman', 'pull', plan.image]);
		if (pull.exitCode !== 0) {
			results.push(
				fail('DEPLOY-PULL-001', 'Web image pull failed', {
					detail: commandOutputDetail(pull),
					remediation: ['NEXT: Confirm CI pushed the GHCR image and the host can pull it.'],
					runbook: 'docs/operations/deploy-apply.md',
				})
			);
			return results;
		}
		results.push(
			pass('DEPLOY-PULL-001', 'Web image pulled', {
				detail: commandOutputDetail(pull),
			})
		);
	}

	for (const update of plan.quadletUpdates) {
		try {
			const replacement = replaceQuadletImage(update.path, update.newImage, { dryRun });
			results.push(
				info(
					dryRun ? 'DEPLOY-QUADLET-DRY-RUN-001' : 'DEPLOY-QUADLET-001',
					`${dryRun ? 'Would update' : 'Updated'} ${update.path}`,
					{
						detail: `${replacement.oldRef} -> ${update.newImage}`,
					}
				)
			);
		} catch (error) {
			results.push(
				fail('DEPLOY-QUADLET-001', `Failed to update ${update.path}`, {
					detail: error instanceof Error ? error.message : String(error),
					remediation: ['NEXT: Fix the Quadlet file before re-running deploy:apply.'],
					runbook: 'docs/operations/deploy-apply.md',
				})
			);
			return results;
		}
	}

	if (dryRun) {
		results.push(info('DEPLOY-SYSTEMD-DRY-RUN-001', 'Would reload and restart systemd user units'));
		results.push(
			info('DEPLOY-DRY-RUN-001', 'Deploy dry-run complete', {
				detail:
					'No migration gate ran, no image was pulled, no Quadlet files were written, no systemctl commands ran, and no release or smoke events were recorded.',
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
		return results;
	}

	const daemonReload = await runner.exec(['systemctl', '--user', 'daemon-reload']);
	if (daemonReload.exitCode !== 0) {
		results.push(
			fail('DEPLOY-SYSTEMD-001', 'systemctl daemon-reload failed', {
				detail: commandOutputDetail(daemonReload),
				remediation: rollbackRemediation(plan.migrationSafety),
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
		return results;
	}
	results.push(pass('DEPLOY-SYSTEMD-001', 'systemd user units reloaded'));

	for (const update of plan.quadletUpdates) {
		const restart = await runner.exec(['systemctl', '--user', 'restart', update.unitName]);
		if (restart.exitCode !== 0) {
			results.push(
				fail('DEPLOY-SYSTEMD-002', `Restart failed for ${update.unitName}`, {
					detail: commandOutputDetail(restart),
					remediation: rollbackRemediation(plan.migrationSafety),
					runbook: 'docs/operations/deploy-apply.md',
				})
			);
			return results;
		}
		results.push(pass('DEPLOY-SYSTEMD-002', `Restarted ${update.unitName}`));
	}

	const readiness = await waitForReadiness(plan, opts);
	results.push(readiness);
	if (readiness.severity === 'fail') return results;

	const deployedAt = new Date().toISOString();
	const release: Release = {
		id: releaseId(plan.sha, deployedAt),
		sha: plan.sha,
		image: plan.image,
		deployedAt,
		migrations: plan.migrationsToRun,
		migrationSafety: plan.migrationSafety,
	};
	recordRelease(release);
	appendEvent({
		channel: 'releases',
		type: 'deploy',
		occurred_at: deployedAt,
		release_id: release.id,
		sha: release.sha,
		image: release.image,
		migration_safety: release.migrationSafety,
		quadlet_units: plan.quadletUpdates.map((update) => update.unitName),
		migrations: release.migrations,
	});
	results.push(
		pass('DEPLOY-RELEASE-001', 'Release recorded', {
			detail: `${release.id} -> ${release.image}`,
		})
	);

	const smoke = opts.smoke ?? runDeploySmoke;
	const smokeResult = await smoke({
		baseUrl: readSmokeBaseUrl(rootDir, opts),
		fetcher: opts.fetcher,
	});
	const smokeStatus = hasFail(smokeResult.results) ? 'fail' : 'pass';
	appendEvent({
		channel: 'smoke',
		type: 'deploy.smoke',
		occurred_at: new Date().toISOString(),
		release_id: release.id,
		sha: release.sha,
		image: release.image,
		smoke_status: smokeStatus,
		results: smokeResult.results,
	});
	results.push(...smokeResult.results);

	if (smokeStatus === 'fail') {
		results.push(
			fail('DEPLOY-SMOKE-001', 'Post-deploy smoke failed', {
				detail:
					'The release is recorded because the units restarted successfully. Choose image rollback or platform restore based on migration safety.',
				remediation: rollbackRemediation(plan.migrationSafety),
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	}

	return results;
}

export function resolveProjectRoot(path = process.cwd()): string {
	return resolve(path);
}
