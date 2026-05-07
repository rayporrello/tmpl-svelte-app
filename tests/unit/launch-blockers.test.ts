import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runCheckLaunch } from '../../scripts/check-launch';
import { ERRORS, type LaunchErrorCode } from '../../scripts/lib/errors';
import { evaluateLaunchBlockers, LAUNCH_BLOCKERS } from '../../scripts/lib/launch-blockers';
import { recordDrill } from '../../scripts/lib/restore-drill-state';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const READY_FIXTURE = join(REPO_ROOT, 'tests/fixtures/ready-to-launch');
const TEMPLATE_OG = readFileSync(join(REPO_ROOT, 'static/og-default.png'));

let tempDirs: string[] = [];
const previousOpsStateDir = process.env.OPS_STATE_DIR;

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
});

function copyReadyFixture(): string {
	const rootDir = mkdtempSync(join(tmpdir(), 'launch-ready-'));
	tempDirs.push(rootDir);
	cpSync(READY_FIXTURE, rootDir, { recursive: true });
	return rootDir;
}

function writeFixtureFile(rootDir: string, path: string, content: string | Buffer): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function useTempOpsState(): void {
	const stateDir = mkdtempSync(join(tmpdir(), 'launch-ops-state-'));
	tempDirs.push(stateDir);
	process.env.OPS_STATE_DIR = stateDir;
}

function recordSuccessfulDrill(finishedAt: string): void {
	recordDrill({
		results: [{ id: 'DRILL-001', severity: 'pass', summary: 'Source container present.' }],
		targetTime: '2026-05-07T02:00:00.000Z',
		backupSource: 'WAL-G LATEST via ready-site-postgres',
		startedAt: new Date(new Date(finishedAt).getTime() - 1000),
		finishedAt: new Date(finishedAt),
	});
}

function blocker(id: LaunchErrorCode) {
	const found = LAUNCH_BLOCKERS.find((item) => item.id === id);
	if (!found) throw new Error(`Missing blocker ${id}`);
	return found;
}

async function resultFor(id: LaunchErrorCode, rootDir: string, envSource: 'dev' | 'prod' = 'prod') {
	return blocker(id).check({ rootDir, envSource });
}

describe('launch-blockers manifest', () => {
	it('has one entry for every LAUNCH-* code', () => {
		const registryLaunchCodes = Object.keys(ERRORS).filter((code) => code.startsWith('LAUNCH-'));
		expect(LAUNCH_BLOCKERS.map((item) => item.id).sort()).toEqual(registryLaunchCodes.sort());
	});

	it('marks backup as recommended and email as required', () => {
		const severities = Object.fromEntries(LAUNCH_BLOCKERS.map((item) => [item.id, item.severity]));
		expect(severities['LAUNCH-BACKUP-001']).toBe('recommended');
		expect(severities['LAUNCH-EMAIL-001']).toBe('required');
		expect(severities['LAUNCH-OG-001']).toBe('required');
		expect(severities['LAUNCH-ENV-001']).toBe('required');
	});

	it('passes every blocker for the ready-to-launch fixture', async () => {
		useTempOpsState();
		const results = await evaluateLaunchBlockers({
			rootDir: copyReadyFixture(),
			envSource: 'prod',
		});

		expect(results).toEqual(
			expect.arrayContaining(
				LAUNCH_BLOCKERS.map((item) => expect.objectContaining({ id: item.id }))
			)
		);
		expect(results.filter((item) => item.status !== 'pass')).toEqual([
			expect.objectContaining({ id: 'LAUNCH-DRILL-001', status: 'warn' }),
			expect.objectContaining({ id: 'LAUNCH-SMOKE-001', status: 'warn' }),
		]);
	});

	it('lets check:launch exit 0 against the ready-to-launch fixture', async () => {
		const result = await runCheckLaunch({ rootDir: copyReadyFixture(), env: {} });

		expect(result.exitCode).toBe(0);
		expect(result.results.some((item) => item.status === 'fail')).toBe(false);
	});

	it('fails LAUNCH-OG-001 for the template OG asset and passes after replacement', async () => {
		const rootDir = copyReadyFixture();

		writeFixtureFile(rootDir, 'static/og-default.png', TEMPLATE_OG);
		await expect(resultFor('LAUNCH-OG-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
		});

		writeFixtureFile(rootDir, 'static/og-default.png', 'not-the-template-og');
		await expect(resultFor('LAUNCH-OG-001', rootDir)).resolves.toMatchObject({
			status: 'pass',
		});
	});

	it('fails LAUNCH-SEO-001 for a placeholder defaultTitle', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'src/lib/config/site.ts',
			"export const site = { defaultTitle: 'tmpl-svelte-app' };\n"
		);

		await expect(resultFor('LAUNCH-SEO-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('site.defaultTitle'),
		});
	});

	it('fails LAUNCH-CMS-001 for a placeholder backend repo', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'static/admin/config.yml',
			'backend:\n  name: github\n  repo: <owner>/<repo>\n  branch: main\n'
		);

		await expect(resultFor('LAUNCH-CMS-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('backend.repo'),
		});
	});

	it('warns for localhost ORIGIN in dev and fails for it in prod', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'.env',
			'ORIGIN=http://127.0.0.1:5173\nPUBLIC_SITE_URL=https://ready.example\n'
		);
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=http://127.0.0.1:5173\nPUBLIC_SITE_URL=https://ready.example\n'
		);

		await expect(resultFor('LAUNCH-ENV-001', rootDir, 'dev')).resolves.toMatchObject({
			status: 'warn',
		});
		await expect(resultFor('LAUNCH-ENV-001', rootDir, 'prod')).resolves.toMatchObject({
			status: 'fail',
		});
	});

	it('warns for localhost PUBLIC_SITE_URL in dev and fails for it in prod', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=http://localhost:5173\n'
		);
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=http://localhost:5173\n'
		);

		await expect(resultFor('LAUNCH-ENV-002', rootDir, 'dev')).resolves.toMatchObject({
			status: 'warn',
		});
		await expect(resultFor('LAUNCH-ENV-002', rootDir, 'prod')).resolves.toMatchObject({
			status: 'fail',
		});
	});

	it('warns for missing dev env and fails for missing prod env', async () => {
		const rootDir = copyReadyFixture();
		rmSync(join(rootDir, 'production.env'));

		await expect(resultFor('LAUNCH-ENV-001', rootDir, 'dev')).resolves.toMatchObject({
			status: 'warn',
			detail: expect.stringContaining('.env is missing'),
		});
		await expect(resultFor('LAUNCH-ENV-001', rootDir, 'prod')).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('no production env file found'),
		});
	});

	it('fails LAUNCH-APPHTML-001 for the template fallback title', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(rootDir, 'src/app.html', '<!doctype html><title>Your Site Name</title>\n');

		await expect(resultFor('LAUNCH-APPHTML-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('<title>'),
		});
	});

	it('fails LAUNCH-AUTOMATION-001 when AUTOMATION_PROVIDER=n8n but webhook config is missing', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nBACKUP_REMOTE=r2:bucket\nPOSTMARK_SERVER_TOKEN=token\nAUTOMATION_PROVIDER=n8n\n'
		);

		await expect(resultFor('LAUNCH-AUTOMATION-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('N8N_WEBHOOK_URL'),
		});
	});

	it('fails LAUNCH-AUTOMATION-001 for AUTOMATION_PROVIDER=console (dev-only)', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nBACKUP_REMOTE=r2:bucket\nPOSTMARK_SERVER_TOKEN=token\nAUTOMATION_PROVIDER=console\n'
		);

		await expect(resultFor('LAUNCH-AUTOMATION-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('development only'),
		});
	});

	it('passes LAUNCH-AUTOMATION-001 for explicit AUTOMATION_PROVIDER=noop', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nBACKUP_REMOTE=r2:bucket\nPOSTMARK_SERVER_TOKEN=token\nAUTOMATION_PROVIDER=noop\n'
		);

		await expect(resultFor('LAUNCH-AUTOMATION-001', rootDir)).resolves.toMatchObject({
			status: 'pass',
			detail: expect.stringContaining('explicitly disabled'),
		});
	});

	it('passes LAUNCH-AUTOMATION-001 when AUTOMATION_PROVIDER is unset', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nBACKUP_REMOTE=r2:bucket\nPOSTMARK_SERVER_TOKEN=token\nCONTACT_TO_EMAIL=hello@ready.example\nCONTACT_FROM_EMAIL=website@ready.example\n'
		);

		await expect(resultFor('LAUNCH-AUTOMATION-001', rootDir)).resolves.toMatchObject({
			status: 'pass',
			detail: expect.stringContaining('AUTOMATION_PROVIDER=noop'),
		});
	});

	it('fails LAUNCH-AUTOMATION-001 when AUTOMATION_PROVIDER=webhook but webhook config is missing', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nBACKUP_REMOTE=r2:bucket\nPOSTMARK_SERVER_TOKEN=token\nCONTACT_TO_EMAIL=hello@ready.example\nCONTACT_FROM_EMAIL=website@ready.example\nAUTOMATION_PROVIDER=webhook\n'
		);

		await expect(resultFor('LAUNCH-AUTOMATION-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('AUTOMATION_WEBHOOK_URL'),
		});
	});

	it('fails LAUNCH-EMAIL-001 when Postmark production env is missing', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\n'
		);

		await expect(resultFor('LAUNCH-BACKUP-001', rootDir)).resolves.toMatchObject({
			status: 'warn',
			detail: expect.stringContaining('BACKUP_REMOTE'),
		});
		await expect(resultFor('LAUNCH-EMAIL-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('POSTMARK_SERVER_TOKEN'),
		});
	});

	it('allows LAUNCH-EMAIL-001 with an explicit console-email waiver warning', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nLAUNCH_ALLOW_CONSOLE_EMAIL=1\n'
		);

		await expect(resultFor('LAUNCH-EMAIL-001', rootDir)).resolves.toMatchObject({
			status: 'warn',
			detail: expect.stringContaining('LAUNCH_ALLOW_CONSOLE_EMAIL=1'),
		});
	});

	it('allows LAUNCH-EMAIL-001 when the console-email waiver is supplied by process env', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\n'
		);

		const result = await blocker('LAUNCH-EMAIL-001').check({
			rootDir,
			envSource: 'prod',
			env: { LAUNCH_ALLOW_CONSOLE_EMAIL: '1' },
		});

		expect(result).toMatchObject({
			status: 'warn',
			detail: expect.stringContaining('process environment'),
		});
	});

	it('fails check:launch only for required blocker failures', async () => {
		useTempOpsState();
		const rootDir = copyReadyFixture();
		writeFixtureFile(rootDir, 'static/og-default.png', TEMPLATE_OG);
		writeFixtureFile(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\n'
		);

		const result = await runCheckLaunch({ rootDir, env: {} });

		expect(result.exitCode).toBe(1);
		expect(result.results.find((item) => item.id === 'LAUNCH-OG-001')).toMatchObject({
			status: 'fail',
		});
		expect(result.results.find((item) => item.id === 'LAUNCH-BACKUP-001')).toMatchObject({
			status: 'warn',
		});
		expect(result.results.find((item) => item.id === 'LAUNCH-DRILL-001')).toMatchObject({
			status: 'warn',
		});
	});

	it('warns when restore drill evidence is missing or stale and passes when fresh', async () => {
		useTempOpsState();
		const rootDir = copyReadyFixture();

		await expect(resultFor('LAUNCH-DRILL-001', rootDir)).resolves.toMatchObject({
			status: 'warn',
			detail: expect.stringContaining('No restore drill evidence'),
		});

		recordSuccessfulDrill('2026-04-20T03:00:00.000Z');
		await expect(
			blocker('LAUNCH-DRILL-001').check({
				rootDir,
				envSource: 'prod',
				env: { LAUNCH_NOW: '2026-05-07T03:00:00.000Z' },
			})
		).resolves.toMatchObject({
			status: 'warn',
			detail: expect.stringContaining('older than the 14-day'),
		});

		recordSuccessfulDrill('2026-05-01T03:00:00.000Z');
		await expect(
			blocker('LAUNCH-DRILL-001').check({
				rootDir,
				envSource: 'prod',
				env: { LAUNCH_NOW: '2026-05-07T03:00:00.000Z' },
			})
		).resolves.toMatchObject({
			status: 'pass',
		});
	});

	it('fails smoke launch gates when secret is short or test token is missing', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(
			rootDir,
			'production.env',
			[
				'ORIGIN=https://ready.example',
				'PUBLIC_SITE_URL=https://ready.example',
				'BACKUP_REMOTE=r2:bucket',
				'POSTMARK_SERVER_TOKEN=token',
				'CONTACT_TO_EMAIL=hello@ready.example',
				'CONTACT_FROM_EMAIL=website@ready.example',
				'AUTOMATION_PROVIDER=noop',
				'SMOKE_TEST_SECRET=short',
			].join('\n')
		);

		await expect(resultFor('LAUNCH-SMOKE-001', rootDir)).resolves.toMatchObject({
			status: 'fail',
		});
		await expect(resultFor('LAUNCH-SMOKE-002', rootDir)).resolves.toMatchObject({
			status: 'fail',
			detail: expect.stringContaining('POSTMARK_API_TEST'),
		});
	});

	it('passes smoke launch gates when secret, token, and migration are present', async () => {
		const rootDir = copyReadyFixture();
		writeFixtureFile(rootDir, 'src/lib/server/db/schema.ts', 'export const isSmokeTest = true;\n');
		writeFixtureFile(
			rootDir,
			'drizzle/0003_smoke_test_contact_rows.sql',
			'ALTER TABLE contact_submissions ADD COLUMN is_smoke_test boolean;\n'
		);
		writeFixtureFile(
			rootDir,
			'production.env',
			[
				'ORIGIN=https://ready.example',
				'PUBLIC_SITE_URL=https://ready.example',
				'BACKUP_REMOTE=r2:bucket',
				'POSTMARK_SERVER_TOKEN=token',
				'POSTMARK_API_TEST=POSTMARK_API_TEST',
				'CONTACT_TO_EMAIL=hello@ready.example',
				'CONTACT_FROM_EMAIL=website@ready.example',
				'AUTOMATION_PROVIDER=noop',
				'SMOKE_TEST_SECRET=0123456789abcdef0123456789abcdef',
			].join('\n')
		);

		await expect(resultFor('LAUNCH-SMOKE-001', rootDir)).resolves.toMatchObject({
			status: 'pass',
		});
		await expect(resultFor('LAUNCH-SMOKE-002', rootDir)).resolves.toMatchObject({
			status: 'pass',
		});
		await expect(resultFor('LAUNCH-SMOKE-003', rootDir)).resolves.toMatchObject({
			status: 'pass',
		});
	});
});
