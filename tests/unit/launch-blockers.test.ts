import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runCheckLaunch } from '../../scripts/check-launch';
import { ERRORS, type LaunchErrorCode } from '../../scripts/lib/errors';
import { evaluateLaunchBlockers, LAUNCH_BLOCKERS } from '../../scripts/lib/launch-blockers';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const READY_FIXTURE = join(REPO_ROOT, 'tests/fixtures/ready-to-launch');
const TEMPLATE_OG = readFileSync(join(REPO_ROOT, 'static/og-default.png'));

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
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

	it('marks backup and email as recommended and required blockers as required', () => {
		const severities = Object.fromEntries(LAUNCH_BLOCKERS.map((item) => [item.id, item.severity]));
		expect(severities['LAUNCH-BACKUP-001']).toBe('recommended');
		expect(severities['LAUNCH-EMAIL-001']).toBe('recommended');
		expect(severities['LAUNCH-OG-001']).toBe('required');
		expect(severities['LAUNCH-ENV-001']).toBe('required');
	});

	it('passes every blocker for the ready-to-launch fixture', async () => {
		const results = await evaluateLaunchBlockers({
			rootDir: copyReadyFixture(),
			envSource: 'prod',
		});

		expect(results).toEqual(
			expect.arrayContaining(
				LAUNCH_BLOCKERS.map((item) => expect.objectContaining({ id: item.id }))
			)
		);
		expect(results.every((item) => item.status === 'pass')).toBe(true);
	});

	it('lets check:launch exit 0 against the ready-to-launch fixture', async () => {
		const result = await runCheckLaunch({ rootDir: copyReadyFixture(), env: {} });

		expect(result.exitCode).toBe(0);
		expect(result.results.every((item) => item.status === 'pass')).toBe(true);
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

	it('warns for missing backup and email production env', async () => {
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
			status: 'warn',
			detail: expect.stringContaining('POSTMARK_SERVER_TOKEN'),
		});
	});

	it('fails check:launch only for required blocker failures', async () => {
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
	});
});
