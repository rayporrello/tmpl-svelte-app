import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectRepo } from '../../scripts/lib/site-state';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function makeRepo(): string {
	const root = mkdtempSync(join(tmpdir(), 'site-state-'));
	tempDirs.push(root);
	return root;
}

function writeRepoFile(root: string, path: string, content: string): void {
	const absolute = join(root, path);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, content, 'utf8');
}

describe('site-state inspectRepo()', () => {
	it('detects init placeholders and parses .env without mutating', async () => {
		const root = makeRepo();
		writeRepoFile(root, 'package.json', '{"name":"tmpl-svelte-app"}\n');
		writeRepoFile(root, '.env', 'ORIGIN=http://127.0.0.1:5173\n');

		const result = await inspectRepo({ rootDir: root });

		expect(result.initSiteDone).toBe(false);
		expect(result.placeholdersByFile['package.json']).toContain('tmpl-svelte-app');
		expect(result.envPresent).toBe(true);
		expect(result.envParsed).toEqual({ ORIGIN: 'http://127.0.0.1:5173' });
		expect(result.containerExists).toBe(false);
		expect(result.containerHealthy).toBe(false);
	});

	it('reports healthy injected runtime and schema state', async () => {
		const root = makeRepo();
		const result = await inspectRepo({
			rootDir: root,
			containerExists: async () => true,
			containerHealthy: async () => true,
			schemaApplied: async () => true,
		});

		expect(result.initSiteDone).toBe(true);
		expect(result.containerExists).toBe(true);
		expect(result.containerHealthy).toBe(true);
		expect(result.schemaApplied).toBe(true);
	});

	it('handles malformed .env as envPresent with null parsed data', async () => {
		const root = makeRepo();
		writeRepoFile(root, '.env', 'BROKEN\n');
		const result = await inspectRepo({ rootDir: root });
		expect(result.envPresent).toBe(true);
		expect(result.envParsed).toBeNull();
	});
});
