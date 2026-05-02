import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = join(process.cwd(), 'scripts/check-cms-config.ts');
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

function tempProject(config: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'check-cms-config-'));
	tempDirs.push(dir);
	const adminDir = join(dir, 'static/admin');
	mkdirSync(adminDir, { recursive: true });
	writeFileSync(join(adminDir, 'config.yml'), config, 'utf8');
	return dir;
}

function runCheck(cwd: string) {
	return spawnSync('bun', [scriptPath], {
		cwd,
		encoding: 'utf8',
	});
}

function configWith(localBackend: 'true' | 'false' | null): string {
	const localBackendLine = localBackend === null ? '' : `local_backend: ${localBackend}\n`;
	return `backend:
  name: github
  repo: owner/repo-name
  branch: main
${localBackendLine}media_folder: static/uploads
public_folder: /uploads
collections: []
`;
}

describe('check-cms-config local_backend guard', () => {
	it.each(['true', 'false'] as const)('fails when local_backend is %s', (value) => {
		const result = runCheck(tempProject(configWith(value)));

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('local_backend is ignored by Sveltia CMS');
		expect(result.stderr).toContain('Work-with-Local-Repository');
	});

	it('passes when local_backend is absent', () => {
		const result = runCheck(tempProject(configWith(null)));

		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain('local_backend');
		expect(result.stdout).toContain('CMS config check passed');
	});
});
