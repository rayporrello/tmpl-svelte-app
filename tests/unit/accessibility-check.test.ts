import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkAccessibilitySource } from '../../scripts/check-accessibility';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'accessibility-check-'));
	tempDirs.push(dir);
	return dir;
}

function write(rootDir: string, path: string, content: string): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

describe('accessibility source check', () => {
	it('accepts labeled controls, named links/buttons, one h1, and image alt', () => {
		const rootDir = tempProject();
		write(
			rootDir,
			'src/routes/+page.svelte',
			[
				'<h1>Home</h1>',
				'<label for="email">Email</label>',
				'<input id="email" type="email" />',
				'<button type="button">Open</button>',
				'<a href="/">Home</a>',
				'<img src="/x.png" alt="" width="1" height="1" />',
			].join('\n')
		);

		const report = checkAccessibilitySource({ rootDir });

		expect(report.violations).toEqual([]);
	});

	it('reports common source-level accessibility mistakes', () => {
		const rootDir = tempProject();
		write(
			rootDir,
			'src/routes/+page.svelte',
			[
				'<h1>One</h1>',
				'<h1>Two</h1>',
				'<input id="name" type="text" />',
				'<button type="button"><span aria-hidden="true"></span></button>',
				'<a href="/empty"></a>',
				'<img src="/x.png" width="1" height="1" />',
			].join('\n')
		);

		const report = checkAccessibilitySource({ rootDir });
		const ruleIds = report.violations.map((violation) => violation.ruleId);

		expect(ruleIds).toContain('a11y/page-h1');
		expect(ruleIds).toContain('a11y/control-label');
		expect(ruleIds).toContain('a11y/empty-interactive-name');
		expect(ruleIds).toContain('a11y/image-alt');
	});
});
