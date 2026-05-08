import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { inTemplateState } from '../helpers/template-state';
import { materializeTemplateProjectJson } from '../../scripts/bootstrap';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'template-project-json-'));
	tempDirs.push(dir);
	mkdirSync(join(dir, '.template'), { recursive: true });
	writeFileSync(
		join(dir, '.template/project.json'),
		JSON.stringify(
			{
				$schema: 'https://tmpl-svelte-app.dev/schema/project.v1.json',
				template: 'tmpl-svelte-app',
				templateVersion: '0.1.0',
				bootstrapContract: 1,
				createdFromTemplateAt: null,
				projectSlug: null,
			},
			null,
			'\t'
		) + '\n'
	);
	return dir;
}

describe('.template/project.json fingerprint', () => {
	it.skipIf(!inTemplateState)('commits the initial null fingerprint shape', () => {
		const fingerprint = readJson(
			fileURLToPath(new URL('../../.template/project.json', import.meta.url))
		);

		expect(fingerprint).toEqual({
			$schema: 'https://tmpl-svelte-app.dev/schema/project.v1.json',
			template: 'tmpl-svelte-app',
			templateVersion: '0.1.0',
			bootstrapContract: 1,
			createdFromTemplateAt: null,
			projectSlug: null,
		});
	});

	it('fills null fields on first bootstrap and leaves populated metadata alone', () => {
		const rootDir = tempProject();
		const changed = materializeTemplateProjectJson(
			rootDir,
			'Ready Site',
			() => new Date('2026-05-02T12:00:00.000Z')
		);
		const first = readFileSync(join(rootDir, '.template/project.json'), 'utf8');
		const secondChanged = materializeTemplateProjectJson(
			rootDir,
			'different-site',
			() => new Date('2026-05-03T12:00:00.000Z')
		);
		const second = readFileSync(join(rootDir, '.template/project.json'), 'utf8');

		expect(changed).toBe(true);
		expect(secondChanged).toBe(false);
		expect(second).toBe(first);
		expect(JSON.parse(first)).toMatchObject({
			createdFromTemplateAt: '2026-05-02T12:00:00.000Z',
			projectSlug: 'ready-site',
		});
	});
});
