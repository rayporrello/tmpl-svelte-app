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

	it('rewrites Caddy domains and reverse proxy port from the manifest', () => {
		const root = tempProject();
		mkdirSync(join(root, 'deploy'), { recursive: true });
		writeFileSync(
			join(root, 'deploy/Caddyfile.example'),
			[
				'# Replace example.com with the real domain before use.',
				'example.com {',
				'    reverse_proxy 127.0.0.1:3000 {',
				'        health_uri /healthz',
				'    }',
				'}',
				'www.example.com {',
				'    redir https://example.com{uri} permanent',
				'}',
				'',
			].join('\n')
		);
		const manifest = {
			...manifestFromAnswers({
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
			}),
			deployment: {
				unitName: 'acme-site-web',
				containerImage: 'ghcr.io/acme/acme-site:<sha>',
				loopbackPort: 3207,
			},
		};

		applyProjectUpdates(root, plannedProjectUpdates(root, manifest));

		const caddy = readFileSync(join(root, 'deploy/Caddyfile.example'), 'utf8');
		expect(caddy).toContain('Configured for acme.example.');
		expect(caddy).toContain('acme.example {');
		expect(caddy).toContain('www.acme.example {');
		expect(caddy).toContain('redir https://acme.example{uri} permanent');
		expect(caddy).toContain('reverse_proxy 127.0.0.1:3207 {');
		expect(caddy).not.toContain('example.com');
	});

	it('creates CLAUDE.md from CLAUDE.md.template on first write', () => {
		const root = tempProject();
		writeFileSync(
			join(root, 'CLAUDE.md.template'),
			[
				'# CLAUDE.md — [PROJECT NAME]',
				'',
				'> Copy this file to `CLAUDE.md` at the project root. Fill in the bracketed values.',
				'> Read by Claude Code at session start. Keep it accurate — stale info causes mistakes.',
				'',
				'## Deployment',
				'',
				'- Container image: [image name]',
				'',
			].join('\n')
		);
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

		const updates = plannedProjectUpdates(root, manifest);
		applyProjectUpdates(root, updates);

		const written = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
		expect(written).toContain('# CLAUDE.md — Acme Site');
		expect(written).toContain('Container image: ghcr.io/acme/acme-site:<sha>');
		expect(written).toContain('<!-- BEGIN AUTO: site.project.json -->');
		expect(written).toContain('<!-- END AUTO -->');
		expect(written).toContain('**Site name:** Acme Site');
		expect(written).toContain('**Production URL:** https://acme.example');
		expect(written).toContain('**GitHub repo:** acme/acme-site');
		expect(written).not.toContain('Copy this file to');

		// Idempotent — running again is a no-op for CLAUDE.md.
		expect(
			plannedProjectUpdates(root, manifest).find((u) => u.path === 'CLAUDE.md')
		).toBeUndefined();
	});

	it('preserves human edits outside the AUTO block on re-run', () => {
		const root = tempProject();
		writeFileSync(
			join(root, 'CLAUDE.md.template'),
			'# CLAUDE.md — [PROJECT NAME]\n\n## Deployment\n\nContainer: [image name]\n'
		);
		const manifest = manifestFromAnswers({
			packageName: 'acme-site',
			siteName: 'Acme Site',
			siteUrl: 'https://acme.example',
			description: 'Lead-gen site.',
			ghOwner: 'acme',
			ghRepo: 'acme-site',
			contactEmail: 'hello@acme.example',
			project: 'acme-site',
			domain: 'acme.example',
			shortName: 'Acme',
		});
		writeProjectManifest(root, manifest);
		applyProjectUpdates(root, plannedProjectUpdates(root, manifest));

		// Operator hand-edits the file outside the AUTO block.
		const created = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
		const edited = created.replace(
			'## Deployment',
			'## Deployment\n\nProject-specific note: do not touch the worker queue without on-call approval.\n\n## Other section'
		);
		writeFileSync(join(root, 'CLAUDE.md'), edited);

		// Manifest changes — production URL gets renamed.
		const updatedManifest = manifestFromAnswers({
			packageName: 'acme-site',
			siteName: 'Acme Site',
			siteUrl: 'https://acmecorp.example',
			description: 'Lead-gen site.',
			ghOwner: 'acme',
			ghRepo: 'acme-site',
			contactEmail: 'hello@acme.example',
			project: 'acme-site',
			domain: 'acmecorp.example',
			shortName: 'Acme',
		});
		writeProjectManifest(root, updatedManifest);
		applyProjectUpdates(root, plannedProjectUpdates(root, updatedManifest));

		const after = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
		// AUTO block reflects the new production URL.
		expect(after).toContain('**Production URL:** https://acmecorp.example');
		// Human edit survives.
		expect(after).toContain('do not touch the worker queue without on-call approval');
		expect(after).toContain('## Other section');
	});

	it('does nothing for CLAUDE.md when neither file nor template exists', () => {
		const root = tempProject();
		const manifest = manifestFromAnswers({
			packageName: 'acme-site',
			siteName: 'Acme Site',
			siteUrl: 'https://acme.example',
			description: 'Lead-gen site.',
			ghOwner: 'acme',
			ghRepo: 'acme-site',
			contactEmail: 'hello@acme.example',
			project: 'acme-site',
			domain: 'acme.example',
			shortName: 'Acme',
		});
		writeProjectManifest(root, manifest);
		const updates = plannedProjectUpdates(root, manifest);
		expect(updates.find((u) => u.path === 'CLAUDE.md')).toBeUndefined();
	});
});
