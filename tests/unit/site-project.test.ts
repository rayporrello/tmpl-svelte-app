import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import {
	applyProjectUpdates,
	manifestFromAnswers,
	plannedProjectUpdates,
	validateProjectManifest,
	writeProjectManifest,
} from '../../scripts/lib/site-project';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'site-project-'));
	tempDirs.push(dir);
	mkdirSync(join(dir, 'src/lib/config'), { recursive: true });
	mkdirSync(join(dir, 'static/admin'), { recursive: true });
	writeFileSync(join(dir, 'package.json'), '{\n\t"name": "tmpl-svelte-app"\n}\n');
	writeFileSync(
		join(dir, 'src/lib/config/site.ts'),
		[
			'export const site = {',
			"\tname: 'Your Site Name',",
			"\turl: 'https://example.com',",
			"\tdefaultTitle: 'Your Site Name',",
			"\ttitleTemplate: '%s — Your Site Name',",
			"\tdefaultDescription: 'A short description of what this site is about.',",
			"\tdefaultOgImage: '/og-default.png',",
			"\torganization: { name: 'Your Site Name', logo: 'https://example.com/images/logo.png' },",
			"\tcontact: { email: 'support@example.com' }",
			'};\n',
		].join('\n')
	);
	writeFileSync(
		join(dir, 'static/admin/config.yml'),
		'backend:\n  repo: owner/repo-name\n  branch: main\n'
	);
	return dir;
}

describe('site.project.json manifest', () => {
	it('validates versioned manifest shape', () => {
		const manifest = manifestFromAnswers({
			packageName: 'acme-site',
			siteName: 'Acme Site',
			siteUrl: 'https://acme.example',
			description: 'A strong lead generation website.',
			ghOwner: 'acme',
			ghRepo: 'acme-site',
			contactEmail: 'hello@acme.example',
			project: 'acme-site',
			domain: 'acme.example',
			shortName: 'Acme',
		});

		expect(validateProjectManifest(manifest).errors).toEqual([]);
		expect(validateProjectManifest({ ...manifest, schemaVersion: 2 }).errors[0]).toContain(
			'schemaVersion'
		);
	});

	it('generates owned files idempotently from the manifest', () => {
		const root = tempProject();
		const manifest = manifestFromAnswers({
			packageName: 'acme-site',
			siteName: 'Acme Site',
			siteUrl: 'https://acme.example',
			description: 'A strong lead generation website.',
			ghOwner: 'acme',
			ghRepo: 'acme-site',
			contactEmail: 'hello@acme.example',
			project: 'acme-site',
			domain: 'acme.example',
			shortName: 'Acme',
		});
		writeProjectManifest(root, manifest);

		const first = plannedProjectUpdates(root, manifest);
		applyProjectUpdates(root, first);
		const second = plannedProjectUpdates(root, manifest);

		expect(first.map((update) => update.path)).toEqual([
			'package.json',
			'src/lib/config/site.ts',
			'static/admin/config.yml',
		]);
		expect(second).toEqual([]);
		expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"name": "acme-site"');
		expect(readFileSync(join(root, 'src/lib/config/site.ts'), 'utf8')).toContain(
			"name: 'Acme Site'"
		);
		expect(readFileSync(join(root, 'static/admin/config.yml'), 'utf8')).toContain(
			'repo: acme/acme-site'
		);
	});
});
