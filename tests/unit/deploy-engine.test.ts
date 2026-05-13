import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	applyDeploy,
	planDeploy,
	type DeployPlan,
	type DeployRunner,
} from '../../scripts/lib/deploy-engine';
import { fail, pass } from '../../scripts/lib/ops-result';
import { readEvents } from '../../scripts/lib/ops-status';
import { parseQuadletImage } from '../../scripts/lib/quadlet-image';
import { ALL_QUADLETS } from '../../scripts/lib/quadlets';
import { getCurrentRelease, recordRelease, type Release } from '../../scripts/lib/release-state';

let tempDir: string;
let rootDir: string;
let quadletsDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;

function write(path: string, content: string): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function writeQuadlet(name: string, image: string): void {
	writeFileSync(
		join(quadletsDir, name),
		`[Container]\nImage=${image}\nPublishPort=127.0.0.1:3000:3000\n`
	);
}

function writeWebDataPlatformFixture(scripts: Record<string, string> = {}): string {
	const dir = join(tempDir, 'web-data-platform');
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify(
			{
				private: true,
				scripts: {
					'web:fleet-migration-status': 'bun run scripts/fleet-migration-status.ts',
					...scripts,
				},
			},
			null,
			'\t'
		)
	);
	return dir;
}

function migrationGateCommand(): string[] {
	return [
		'bun',
		'run',
		'--cwd',
		join(tempDir, 'web-data-platform'),
		'web:fleet-migration-status',
		'--',
		'--client=deploy-engine',
		`--repo=${rootDir}`,
	];
}

function seedProject(image = 'ghcr.io/example/site:old'): void {
	write(
		'site.project.json',
		JSON.stringify({
			project: { projectSlug: 'deploy-engine' },
			site: { productionUrl: 'https://deploy.example' },
			deployment: { loopbackPort: 3000 },
		})
	);
	write(
		'drizzle/meta/_journal.json',
		JSON.stringify({
			version: '7',
			dialect: 'postgresql',
			entries: [
				{ idx: 0, tag: '0000_init' },
				{ idx: 1, tag: '0001_add_contact' },
			],
		})
	);
	mkdirSync(quadletsDir, { recursive: true });
	for (const name of ALL_QUADLETS) writeQuadlet(name, image);
}

function release(id: string, migrations: string[] = []): Release {
	return {
		id,
		sha: `sha-${id}`,
		image: `ghcr.io/example/site:${id}`,
		deployedAt: `2026-05-06T12:0${id}:00.000Z`,
		migrations,
		migrationSafety: 'rollback-safe',
	};
}

function passingPreflight() {
	return vi.fn().mockResolvedValue({
		results: [pass('PREFLIGHT-TEST-001', 'Preflight fixture passed')],
		exitCode: 0,
	});
}

function fakeRunner(failRestart = false): DeployRunner & { calls: string[][] } {
	const calls: string[][] = [];
	return {
		calls,
		async exec(cmd: string[]) {
			calls.push(cmd);
			if (failRestart && cmd.join(' ') === 'systemctl --user restart web.service') {
				return { exitCode: 1, stdout: '', stderr: 'restart failed' };
			}
			return { exitCode: 0, stdout: 'ok', stderr: '' };
		},
	};
}

async function collectEvents(channel: string): Promise<object[]> {
	const events: object[] = [];
	for await (const event of readEvents({ channel })) events.push(event);
	return events;
}

function readyFetcher(): typeof fetch {
	return vi.fn().mockResolvedValue(new Response('ok', { status: 200 })) as typeof fetch;
}

function smoke(severity: 'pass' | 'fail') {
	return vi.fn().mockResolvedValue({
		results: [
			severity === 'pass'
				? pass('SMOKE-TEST-001', 'Smoke fixture passed')
				: fail('SMOKE-TEST-001', 'Smoke fixture failed'),
		],
		exitCode: severity === 'pass' ? 0 : 1,
	});
}

function plan(image = 'ghcr.io/example/site:new'): DeployPlan {
	return {
		image,
		sha: 'abc123',
		migrationSafety: 'rollback-safe',
		quadletUpdates: ALL_QUADLETS.map((name) => ({
			path: join(quadletsDir, name),
			oldImage: 'ghcr.io/example/site:old',
			newImage: image,
			unitName: `${name.replace(/\.container$/u, '')}.service`,
		})),
		migrationsToRun: ['0001_add_contact.sql'],
	};
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'deploy-engine-'));
	rootDir = join(tempDir, 'project');
	quadletsDir = join(rootDir, 'deploy/quadlets');
	process.env.OPS_STATE_DIR = join(tempDir, 'ops');
	seedProject();
	writeWebDataPlatformFixture();
});

afterEach(() => {
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe('deploy engine', () => {
	it('does not produce a plan when preflight fails', async () => {
		const result = await planDeploy({
			image: 'ghcr.io/example/site:new',
			sha: 'abc123',
			migrationSafety: 'rollback-safe',
			rootDir,
			preflight: vi.fn().mockResolvedValue({
				results: [fail('PREFLIGHT-TEST-001', 'Preflight fixture failed')],
				exitCode: 1,
			}),
		});

		expect(result.plan).toBeNull();
		expect(result.results).toContainEqual(expect.objectContaining({ severity: 'fail' }));
	});

	it('builds a plan for every locked Quadlet and lists unapplied migrations', async () => {
		recordRelease(release('1', ['0000_init.sql']));

		const result = await planDeploy({
			image: 'ghcr.io/example/site:new',
			sha: 'abc123',
			migrationSafety: 'rollback-safe',
			rootDir,
			preflight: passingPreflight(),
		});

		expect(result.plan?.quadletUpdates.map((update) => update.path).sort()).toEqual(
			ALL_QUADLETS.map((name) => join(quadletsDir, name)).sort()
		);
		expect(result.plan?.migrationsToRun).toEqual(['0001_add_contact.sql']);
		expect(result.results).toContainEqual(
			expect.objectContaining({ id: 'DEPLOY-PLAN-004', severity: 'info' })
		);
	});

	it('dry-runs without pulling, running systemctl, writing Quadlets, or ledger events', async () => {
		const runner = fakeRunner();

		const results = await applyDeploy(plan(), {
			dryRun: true,
			rootDir,
			runner,
			preflight: passingPreflight(),
		});

		expect(runner.calls).toEqual([]);
		for (const name of ALL_QUADLETS) {
			expect(parseQuadletImage(join(quadletsDir, name)).imageRef).toBe('ghcr.io/example/site:old');
		}
		expect(await collectEvents('releases')).toEqual([]);
		expect(results).toContainEqual(
			expect.objectContaining({ id: 'DEPLOY-DRY-RUN-001', severity: 'info' })
		);
	});

	it('uses Bun cwd syntax for the web-data-platform migration gate command', async () => {
		const results = await applyDeploy(plan(), {
			dryRun: true,
			rootDir,
			runner: fakeRunner(),
			preflight: passingPreflight(),
		});

		expect(results).toContainEqual(
			expect.objectContaining({
				id: 'DEPLOY-MIGRATE-DRY-RUN-001',
				detail: expect.stringContaining('bun run --cwd'),
			})
		);
		expect(results).toContainEqual(
			expect.objectContaining({
				id: 'DEPLOY-MIGRATE-DRY-RUN-001',
				detail: expect.stringContaining('web:fleet-migration-status'),
			})
		);
	});

	it('fails closed when the web-data-platform path is missing', async () => {
		const runner = fakeRunner();
		const results = await applyDeploy(plan(), {
			rootDir,
			env: { ...process.env, WEB_DATA_PLATFORM_PATH: join(tempDir, 'missing-platform') },
			runner,
			preflight: passingPreflight(),
		});

		expect(runner.calls).toEqual([]);
		expect(results).toContainEqual(
			expect.objectContaining({
				id: 'DEPLOY-MIGRATE-001',
				severity: 'fail',
				summary: 'web-data-platform migration gate unavailable',
				detail: expect.stringContaining('missing'),
			})
		);
	});

	it('fails closed when the web-data-platform repo does not expose the migration script', async () => {
		const invalidDir = join(tempDir, 'invalid-platform');
		mkdirSync(invalidDir, { recursive: true });
		writeFileSync(join(invalidDir, 'package.json'), JSON.stringify({ private: true, scripts: {} }));

		const runner = fakeRunner();
		const results = await applyDeploy(plan(), {
			rootDir,
			env: { ...process.env, WEB_DATA_PLATFORM_PATH: invalidDir },
			runner,
			preflight: passingPreflight(),
		});

		expect(runner.calls).toEqual([]);
		expect(results).toContainEqual(
			expect.objectContaining({
				id: 'DEPLOY-MIGRATE-001',
				severity: 'fail',
				detail: expect.stringContaining('web:fleet-migration-status'),
			})
		);
	});

	it('allows an explicit migration-gate skip with a loud warning', async () => {
		const results = await applyDeploy(plan(), {
			dryRun: true,
			skipMigrationGate: true,
			rootDir,
			env: { ...process.env, WEB_DATA_PLATFORM_PATH: join(tempDir, 'missing-platform') },
			runner: fakeRunner(),
			preflight: passingPreflight(),
		});

		expect(results).toContainEqual(
			expect.objectContaining({
				id: 'DEPLOY-MIGRATE-SKIP-001',
				severity: 'warn',
				detail: expect.stringContaining('--skip-migration-gate'),
			})
		);
		expect(results).toContainEqual(
			expect.objectContaining({ id: 'DEPLOY-DRY-RUN-001', severity: 'info' })
		);
	});

	it('applies a live deploy, records the release, and appends a passing smoke event', async () => {
		const runner = fakeRunner();

		const results = await applyDeploy(plan(), {
			rootDir,
			runner,
			preflight: passingPreflight(),
			fetcher: readyFetcher(),
			smoke: smoke('pass'),
		});

		expect(runner.calls).toEqual([
			migrationGateCommand(),
			['podman', 'pull', 'ghcr.io/example/site:new'],
			['systemctl', '--user', 'daemon-reload'],
			['systemctl', '--user', 'restart', 'web.service'],
		]);
		for (const name of ALL_QUADLETS) {
			expect(readFileSync(join(quadletsDir, name), 'utf8')).toContain(
				'Image=ghcr.io/example/site:new'
			);
		}
		expect(getCurrentRelease()).toMatchObject({
			image: 'ghcr.io/example/site:new',
			sha: 'abc123',
			migrationSafety: 'rollback-safe',
		});
		expect(await collectEvents('smoke')).toContainEqual(
			expect.objectContaining({ type: 'deploy.smoke', smoke_status: 'pass' })
		);
		expect(results).not.toContainEqual(expect.objectContaining({ severity: 'fail' }));
	});

	it('records the release when smoke fails and prints rollback-safe remediation', async () => {
		const results = await applyDeploy(plan(), {
			rootDir,
			runner: fakeRunner(),
			preflight: passingPreflight(),
			fetcher: readyFetcher(),
			smoke: smoke('fail'),
		});

		expect(getCurrentRelease()?.image).toBe('ghcr.io/example/site:new');
		expect(await collectEvents('smoke')).toContainEqual(
			expect.objectContaining({ type: 'deploy.smoke', smoke_status: 'fail' })
		);
		expect(results.at(-1)).toMatchObject({
			id: 'DEPLOY-SMOKE-001',
			severity: 'fail',
			remediation: ['bun run rollback --to previous'],
		});
	});

	it('does not record a release when restart fails', async () => {
		const results = await applyDeploy(plan(), {
			rootDir,
			runner: fakeRunner(true),
			preflight: passingPreflight(),
			fetcher: readyFetcher(),
			smoke: smoke('pass'),
		});

		expect(getCurrentRelease()).toBeNull();
		expect(results).toContainEqual(
			expect.objectContaining({ id: 'DEPLOY-SYSTEMD-002', severity: 'fail' })
		);
	});

	it('uses platform restore remediation when smoke fails for a rollback-blocked release', async () => {
		const blockedPlan = { ...plan(), migrationSafety: 'rollback-blocked' as const };

		const results = await applyDeploy(blockedPlan, {
			rootDir,
			runner: fakeRunner(),
			preflight: passingPreflight(),
			fetcher: readyFetcher(),
			smoke: smoke('fail'),
		});

		expect(results.at(-1)).toMatchObject({
			id: 'DEPLOY-SMOKE-001',
			severity: 'fail',
			remediation: expect.arrayContaining([
				'bun run rollback --status',
				expect.stringContaining('web-data-platform restore runbook'),
			]),
		});
	});
});
