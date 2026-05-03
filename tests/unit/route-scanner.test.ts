import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { evaluateRoutePolicyCoverage, scanSvelteKitRoutes } from '../../scripts/lib/route-scanner';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

function makeRoute(root: string, path: string, file = '+page.svelte'): void {
	const dir = join(root, 'src/routes', path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, file), '');
}

describe('route scanner', () => {
	it('scans pages, dynamic routes, feeds, and health endpoints', () => {
		const routes = scanSvelteKitRoutes(process.cwd()).map((route) => `${route.kind}:${route.path}`);

		expect(routes).toContain('page:/');
		expect(routes).toContain('page:/articles/[slug]');
		expect(routes).toContain('endpoint:/healthz');
		expect(routes).toContain('endpoint:/rss.xml');
	});

	it('reports missing policy coverage', () => {
		const root = mkdtempSync(join(tmpdir(), 'route-scanner-'));
		tempDirs.push(root);
		makeRoute(root, 'unlisted');

		const result = evaluateRoutePolicyCoverage(root);

		expect(result.issues).toEqual([
			expect.objectContaining({
				path: '/unlisted',
				message: 'No route policy entry covers /unlisted.',
			}),
		]);
	});
});
