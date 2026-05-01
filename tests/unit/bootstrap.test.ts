import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BootstrapScriptError } from '../../scripts/lib/errors';
import { ciAnswersFromEnv, guardedWriteText, parseArgs } from '../../scripts/bootstrap';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), 'bootstrap-script-'));
	tempDirs.push(dir);
	return dir;
}

describe('bootstrap orchestrator helpers', () => {
	it('parses supported CLI flags and rejects unknown options with a BOOT code', () => {
		expect(parseArgs(['--dry-run', '--yes', '--ci', '--answers-file', 'answers.txt'])).toEqual({
			dryRun: true,
			yes: true,
			ci: true,
			answersFile: 'answers.txt',
		});

		expect(() => parseArgs(['--wat'])).toThrow(BootstrapScriptError);
		try {
			parseArgs(['--wat']);
		} catch (error) {
			expect((error as BootstrapScriptError).code).toBe('BOOT-INIT-001');
			expect((error as BootstrapScriptError).hint).toContain('NEXT:');
		}
	});

	it('requires all CI answers before init:site can run without prompting', () => {
		expect(() => ciAnswersFromEnv({})).toThrow(BootstrapScriptError);

		const input = ciAnswersFromEnv({
			BOOTSTRAP_PACKAGE_NAME: 'acme-studio',
			BOOTSTRAP_SITE_NAME: 'Acme Studio',
			BOOTSTRAP_PRODUCTION_URL: 'https://acme.example',
			BOOTSTRAP_META_DESCRIPTION: 'Acme Studio site.',
			BOOTSTRAP_GITHUB_OWNER: 'acme',
			BOOTSTRAP_GITHUB_REPO: 'studio',
			BOOTSTRAP_SUPPORT_EMAIL: 'support@acme.example',
			BOOTSTRAP_PROJECT_SLUG: 'acme-studio',
			BOOTSTRAP_PRODUCTION_DOMAIN: 'acme.example',
			BOOTSTRAP_PWA_SHORT_NAME: 'Acme',
		});

		expect(input.split('\n').slice(0, 10)).toEqual([
			'acme-studio',
			'Acme Studio',
			'https://acme.example',
			'Acme Studio site.',
			'acme',
			'studio',
			'support@acme.example',
			'acme-studio',
			'acme.example',
			'Acme',
		]);
	});

	it('guards bootstrap writes with the protected-file allowlist', () => {
		const root = tempRepo();

		guardedWriteText(root, '.env', 'ORIGIN=http://127.0.0.1:5173\n');
		expect(readFileSync(join(root, '.env'), 'utf8')).toBe('ORIGIN=http://127.0.0.1:5173\n');

		expect(() => guardedWriteText(root, 'src/app.html', '<title>Nope</title>\n')).toThrow(
			BootstrapScriptError
		);
		try {
			guardedWriteText(root, 'src/app.html', '<title>Nope</title>\n');
		} catch (error) {
			expect((error as BootstrapScriptError).code).toBe('BOOT-GUARD-001');
			expect((error as BootstrapScriptError).hint).toContain('NEXT:');
		}
	});
});
