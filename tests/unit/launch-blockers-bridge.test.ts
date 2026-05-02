import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getDevSetupWarnings } from '../../src/lib/server/launch-blockers';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'launch-bridge-'));
	tempDirs.push(dir);
	return dir;
}

function write(rootDir: string, path: string, content: string): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function writeFreshBootstrappedProject(): string {
	const rootDir = tempProject();
	write(
		rootDir,
		'src/lib/config/site.ts',
		"export const site = { url: 'https://ready.example', defaultTitle: 'Ready Site' };\n"
	);
	write(rootDir, '.env', 'ORIGIN=http://127.0.0.1:5173\nPUBLIC_SITE_URL=http://127.0.0.1:5173\n');
	write(
		rootDir,
		'static/admin/config.yml',
		'backend:\n  name: github\n  repo: <owner>/<repo>\n  branch: main\n'
	);
	write(rootDir, 'src/app.html', '<!doctype html><title>Ready Site</title>\n');
	return rootDir;
}

describe('server launch-blockers bridge', () => {
	it('returns serializable dev setup warnings from the script manifest', async () => {
		const warnings = await getDevSetupWarnings({ rootDir: writeFreshBootstrappedProject() });

		expect(warnings).toEqual(JSON.parse(JSON.stringify(warnings)));
		expect(warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'LAUNCH-OG-001' }),
				expect.objectContaining({ id: 'LAUNCH-CMS-001' }),
				expect.objectContaining({ id: 'LAUNCH-ENV-001' }),
				expect.objectContaining({ id: 'LAUNCH-ENV-002' }),
			])
		);
		expect(warnings[0]).toEqual({
			id: expect.any(String),
			label: expect.any(String),
			severity: expect.stringMatching(/^(required|recommended)$/),
			fixHint: expect.stringContaining('NEXT:'),
		});
	});

	it('drops the OG warning when the placeholder is replaced', async () => {
		const rootDir = writeFreshBootstrappedProject();
		write(rootDir, 'static/og-default.png', 'not-the-template-og');

		const warnings = await getDevSetupWarnings({ rootDir });

		expect(warnings.map((warning) => warning.id)).not.toContain('LAUNCH-OG-001');
	});
});
