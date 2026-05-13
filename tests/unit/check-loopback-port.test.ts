import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCheckLoopbackPort } from '../../scripts/check-loopback-port';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

type Workspace = { root: string; site: string; platform: string };

function makeWorkspace(): Workspace {
	const root = mkdtempSync(join(tmpdir(), 'check-loopback-port-'));
	tempDirs.push(root);
	const site = join(root, 'site');
	const platform = join(root, 'web-data-platform');
	mkdirSync(site, { recursive: true });
	mkdirSync(platform, { recursive: true });
	return { root, site, platform };
}

function writeRealisticSiteProject(
	siteDir: string,
	overrides: Partial<{ loopbackPort: number }> = {}
): void {
	const loopbackPort = overrides.loopbackPort ?? 3007;
	const manifest = {
		schemaVersion: 1,
		project: {
			packageName: 'acme-site',
			projectSlug: 'acme-site',
			githubOwner: 'acme',
			githubRepo: 'acme-site',
		},
		site: {
			name: 'Acme',
			productionUrl: 'https://acme.example.com',
			productionDomain: 'acme.example.com',
			defaultDescription: 'Acme website',
			supportEmail: 'hello@acme.example.com',
			pwaShortName: 'Acme',
			themeColor: '#0B1120',
		},
		deployment: {
			unitName: 'acme-site-web',
			containerImage: 'ghcr.io/acme/acme-site:<sha>',
			loopbackPort,
		},
		cms: { backendRepo: 'acme/acme-site', branch: 'main' },
		assets: { defaultOgImage: '/og-default.png', organizationLogoPath: '/images/logo.png' },
	};
	writeFileSync(join(siteDir, 'site.project.json'), JSON.stringify(manifest, null, '\t') + '\n');
}

function writeTemplateSiteProject(siteDir: string): void {
	const manifest = {
		schemaVersion: 1,
		project: {
			packageName: 'tmpl-svelte-app',
			projectSlug: 'project',
			githubOwner: 'owner',
			githubRepo: 'repo-name',
		},
		site: {
			name: 'Your Site Name',
			productionUrl: 'https://example.com',
			productionDomain: 'example.com',
			defaultDescription: 'A short description.',
			supportEmail: 'support@example.com',
			pwaShortName: 'Site',
			themeColor: '#0B1120',
		},
		deployment: {
			unitName: 'project-web',
			containerImage: 'ghcr.io/owner/repo-name:<sha>',
			loopbackPort: 3000,
		},
		cms: { backendRepo: 'owner/repo-name', branch: 'main' },
		assets: { defaultOgImage: '/og-default.png', organizationLogoPath: '/images/logo.png' },
	};
	writeFileSync(join(siteDir, 'site.project.json'), JSON.stringify(manifest, null, '\t') + '\n');
}

function writeClientsJson(platformDir: string, clients: unknown[]): void {
	writeFileSync(
		join(platformDir, 'clients.json'),
		JSON.stringify({ schemaVersion: 1, clients }, null, '\t') + '\n'
	);
}

function withEnv<T>(value: string | undefined, fn: () => T): T {
	const previous = process.env.WEB_DATA_PLATFORM_PATH;
	if (value === undefined) delete process.env.WEB_DATA_PLATFORM_PATH;
	else process.env.WEB_DATA_PLATFORM_PATH = value;
	try {
		return fn();
	} finally {
		if (previous === undefined) delete process.env.WEB_DATA_PLATFORM_PATH;
		else process.env.WEB_DATA_PLATFORM_PATH = previous;
	}
}

describe('check:loopback-port', () => {
	it('skips when the manifest is still the template default', () => {
		const ws = makeWorkspace();
		writeTemplateSiteProject(ws.site);
		writeClientsJson(ws.platform, [{ slug: 'project', loopbackPort: 3009 }]);

		const result = withEnv(undefined, () => runCheckLoopbackPort(ws.site));
		expect(result.exitCode).toBe(0);
		expect(result.message).toContain('template manifest');
	});

	it('passes when site port matches platform allocation', () => {
		const ws = makeWorkspace();
		writeRealisticSiteProject(ws.site, { loopbackPort: 3007 });
		writeClientsJson(ws.platform, [{ slug: 'acme-site', loopbackPort: 3007 }]);

		const result = withEnv(undefined, () => runCheckLoopbackPort(ws.site));
		expect(result.exitCode).toBe(0);
		expect(result.message).toContain('aligned with platform');
	});

	it('fails with a remediation message when ports drift', () => {
		const ws = makeWorkspace();
		writeRealisticSiteProject(ws.site, { loopbackPort: 3009 });
		writeClientsJson(ws.platform, [{ slug: 'acme-site', loopbackPort: 3007 }]);

		const result = withEnv(undefined, () => runCheckLoopbackPort(ws.site));
		expect(result.exitCode).toBe(1);
		expect(result.message).toContain('loopbackPort=3009');
		expect(result.message).toContain('loopbackPort=3007');
		expect(result.message).toContain('Platform is authoritative');
	});

	it('skips silently when there is no platform checkout and no env override', () => {
		const ws = makeWorkspace();
		writeRealisticSiteProject(ws.site);
		// Remove the platform dir so the sibling-resolved path does not exist.
		rmSync(ws.platform, { recursive: true, force: true });

		const result = withEnv(undefined, () => runCheckLoopbackPort(ws.site));
		expect(result.exitCode).toBe(0);
		expect(result.message).toContain('no platform clients.json');
	});

	it('fails when WEB_DATA_PLATFORM_PATH points at a non-existent path', () => {
		const ws = makeWorkspace();
		writeRealisticSiteProject(ws.site);
		const bogus = join(ws.root, 'no-such-platform');

		const result = withEnv(bogus, () => runCheckLoopbackPort(ws.site));
		expect(result.exitCode).toBe(1);
		expect(result.message).toContain('does not exist');
	});

	it('skips when there is no clients.json entry for the slug yet', () => {
		const ws = makeWorkspace();
		writeRealisticSiteProject(ws.site);
		writeClientsJson(ws.platform, [{ slug: 'other-site', loopbackPort: 3001 }]);

		const result = withEnv(undefined, () => runCheckLoopbackPort(ws.site));
		expect(result.exitCode).toBe(0);
		expect(result.message).toContain('no clients.json entry for slug');
	});
});
