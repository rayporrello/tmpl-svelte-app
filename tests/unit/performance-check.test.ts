import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runPerformanceCheck } from '../../scripts/check-performance';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'performance-check-'));
	tempDirs.push(dir);
	return dir;
}

function write(rootDir: string, path: string, content: string): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function writeBudget(rootDir: string, overrides = {}): void {
	write(
		rootDir,
		'performance.budget.json',
		JSON.stringify(
			{
				schemaVersion: 1,
				budgets: {
					totalClientJsGzipWarnKb: 100,
					totalClientJsGzipFailKb: 200,
					largestClientJsGzipWarnKb: 100,
					largestClientJsGzipFailKb: 200,
					totalCssGzipWarnKb: 100,
					totalCssGzipFailKb: 200,
					staticImageWarnKb: 100,
					staticImageFailKb: 200,
					singleAssetFailKb: 500,
					...overrides,
				},
				allowLargeAssets: [],
			},
			null,
			2
		)
	);
}

describe('performance check', () => {
	it('passes for a small built bundle and optimized upload sibling', () => {
		const rootDir = tempProject();
		writeBudget(rootDir);
		write(rootDir, 'build/client/_app/immutable/chunks/app.js', 'console.log("small");');
		write(rootDir, 'build/client/_app/immutable/assets/app.css', 'body{color:black}');
		write(rootDir, 'static/uploads/photo.jpg', 'source');
		write(rootDir, 'static/uploads/photo.webp', 'optimized');
		write(rootDir, 'src/routes/+page.svelte', '<h1>Home</h1>');

		const result = runPerformanceCheck({ rootDir });

		expect(result.exitCode).toBe(0);
		expect(result.results).not.toContainEqual(expect.objectContaining({ status: 'fail' }));
	});

	it('fails when build output is missing', () => {
		const rootDir = tempProject();
		writeBudget(rootDir);
		const result = runPerformanceCheck({ rootDir });

		expect(result.exitCode).toBe(1);
		expect(result.results).toContainEqual(
			expect.objectContaining({ id: 'PERF-BUILD-001', status: 'fail' })
		);
	});

	it('fails when a CMS upload source is missing its WebP sibling', () => {
		const rootDir = tempProject();
		writeBudget(rootDir);
		write(rootDir, 'build/client/_app/immutable/chunks/app.js', 'console.log("small");');
		write(rootDir, 'build/client/_app/immutable/assets/app.css', 'body{}');
		write(rootDir, 'static/uploads/photo.jpg', 'source');

		const result = runPerformanceCheck({ rootDir });

		expect(result.exitCode).toBe(1);
		expect(result.results).toContainEqual(
			expect.objectContaining({ id: 'PERF-IMAGE-002', status: 'fail' })
		);
	});
});
