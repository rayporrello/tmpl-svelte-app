import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runResetDev } from '../../scripts/reset-dev';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'reset-dev-'));
	tempDirs.push(dir);
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'ready-site' }, null, 2));
	return dir;
}

function writeBootstrappedState(rootDir: string): void {
	writeFileSync(
		join(rootDir, '.bootstrap.state.json'),
		JSON.stringify(
			{
				createdAt: '2026-05-01T00:00:00.000Z',
				createdContainer: 'ready-site-pg',
				createdContainerPort: 55432,
				createdEnvKeys: ['DATABASE_URL'],
				bootstrapContractVersion: 1,
			},
			null,
			2
		)
	);
	writeFileSync(
		join(rootDir, '.env'),
		'DATABASE_URL=postgres://ready_site_user:secret@127.0.0.1:55432/ready_site\n'
	);
}

function runnerWithLabels(labels: Record<string, string>, gitStatus = '') {
	return vi.fn(async (command: string, args: readonly string[] = []) => {
		if (command === 'git') return { code: 0, stdout: gitStatus, stderr: '', durationMs: 1 };
		if (args[0] === 'inspect') {
			return { code: 0, stdout: JSON.stringify(labels), stderr: '', durationMs: 1 };
		}
		return { code: 0, stdout: '', stderr: '', durationMs: 1 };
	});
}

const OWNED_LABELS = {
	'tmpl-svelte-app.bootstrap': 'true',
	'tmpl-svelte-app.project-slug': 'ready-site',
	'tmpl-svelte-app.contract-version': '1',
};

describe('reset:dev', () => {
	it('removes the label-checked container, moves .env, and removes bootstrap state', async () => {
		const rootDir = tempProject();
		writeBootstrappedState(rootDir);
		const runner = runnerWithLabels(OWNED_LABELS);

		const result = await runResetDev({
			rootDir,
			runtime: 'podman',
			runner,
			now: () => 1_776_000_000_000,
		});

		expect(result.exitCode).toBe(0);
		expect(runner).toHaveBeenCalledWith('podman', ['rm', '-f', 'ready-site-pg'], {
			capture: true,
		});
		expect(existsSync(join(rootDir, '.env'))).toBe(false);
		expect(readFileSync(join(rootDir, '.env.backup.1776000000'), 'utf8')).toContain(
			'DATABASE_URL='
		);
		expect(existsSync(join(rootDir, '.bootstrap.state.json'))).toBe(false);
	});

	it('deletes .env with --destroy-env', async () => {
		const rootDir = tempProject();
		writeBootstrappedState(rootDir);

		const result = await runResetDev({
			rootDir,
			runtime: 'podman',
			runner: runnerWithLabels(OWNED_LABELS),
			destroyEnv: true,
		});

		expect(result.exitCode).toBe(0);
		expect(existsSync(join(rootDir, '.env'))).toBe(false);
		expect(existsSync(join(rootDir, '.env.backup.'))).toBe(false);
	});

	it('refuses when DATABASE_URL points outside the bootstrap-owned container', async () => {
		const rootDir = tempProject();
		writeBootstrappedState(rootDir);
		writeFileSync(
			join(rootDir, '.env'),
			'DATABASE_URL=postgres://ready:secret@db.example.com:5432/ready\n'
		);
		const runner = runnerWithLabels(OWNED_LABELS);

		const result = await runResetDev({ rootDir, runtime: 'podman', runner });

		expect(result.exitCode).toBe(1);
		expect(result.messages.join('\n')).toContain('external Postgres');
		expect(runner).not.toHaveBeenCalledWith('podman', ['rm', '-f', 'ready-site-pg'], {
			capture: true,
		});
		expect(existsSync(join(rootDir, '.env'))).toBe(true);
	});

	it('does not touch a same-named container without matching labels', async () => {
		const rootDir = tempProject();
		writeBootstrappedState(rootDir);
		const runner = runnerWithLabels({ 'tmpl-svelte-app.bootstrap': 'false' });

		const result = await runResetDev({ rootDir, runtime: 'podman', runner });

		expect(result.exitCode).toBe(1);
		expect(result.messages.join('\n')).toContain('does not carry matching bootstrap labels');
		expect(runner).not.toHaveBeenCalledWith('podman', ['rm', '-f', 'ready-site-pg'], {
			capture: true,
		});
		expect(existsSync(join(rootDir, '.env'))).toBe(true);
	});

	it('refuses unrelated working-tree changes unless forced', async () => {
		const rootDir = tempProject();
		writeBootstrappedState(rootDir);
		const runner = runnerWithLabels(OWNED_LABELS, ' M src/routes/+page.svelte\n');

		const refused = await runResetDev({ rootDir, runtime: 'podman', runner });
		expect(refused.exitCode).toBe(1);
		expect(refused.messages.join('\n')).toContain('Working tree has uncommitted changes');

		const forced = await runResetDev({ rootDir, runtime: 'podman', runner, force: true });
		expect(forced.exitCode).toBe(0);
	});
});
