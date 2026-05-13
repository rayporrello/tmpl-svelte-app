import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	checkCaddyfileDomain,
	checkDatabaseUrlShape,
	checkEnvExamples,
	checkGhcrImageShape,
	checkHttpsOrigins,
	checkProductionEnvFile,
	checkQuadletProject,
	checkRequiredLaunchBlockers,
	checkRuntimeReachability,
	checkSopsRender,
	runDeployPreflight,
} from '../../scripts/deploy-preflight';

const TEMPLATE_OG_REPLACEMENT = 'not-the-template-og';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'deploy-preflight-'));
	tempDirs.push(dir);
	return dir;
}

function write(rootDir: string, path: string, content: string): void {
	const target = join(rootDir, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function writeReadyProject(): string {
	const rootDir = tempProject();
	write(rootDir, 'package.json', JSON.stringify({ name: 'ready-site' }, null, 2));
	write(
		rootDir,
		'site.project.json',
		JSON.stringify(
			{
				schemaVersion: 1,
				project: {
					packageName: 'ready-site',
					projectSlug: 'ready-site',
					githubOwner: 'acme',
					githubRepo: 'ready-site',
				},
				site: {
					name: 'Ready Site',
					productionUrl: 'https://ready.example',
					productionDomain: 'ready.example',
					defaultDescription: 'Ready site fixture.',
					supportEmail: 'support@ready.example',
					pwaShortName: 'Ready',
					themeColor: '#0B1120',
				},
				deployment: {
					unitName: 'ready-site-web',
					containerImage: 'ghcr.io/acme/ready-site:abc123',
					loopbackPort: 3000,
				},
				cms: {
					backendRepo: 'acme/ready-site',
					branch: 'main',
				},
				assets: {
					defaultOgImage: '/og-default.png',
					organizationLogoPath: '/images/logo.png',
				},
			},
			null,
			'\t'
		)
	);
	write(
		rootDir,
		'src/lib/config/site.ts',
		"export const site = { url: 'https://ready.example', defaultTitle: 'Ready Site' };\n"
	);
	write(
		rootDir,
		'production.env',
		[
			'ORIGIN=https://ready.example',
			'PUBLIC_SITE_URL=https://ready.example',
			'CLIENT_SLUG=ready-site',
			'DATABASE_URL=postgres://ready_site_app_user:secret@web-platform-postgres:5432/ready_site_app',
			'POSTMARK_SERVER_TOKEN=token',
			'CONTACT_TO_EMAIL=hello@ready.example',
			'CONTACT_FROM_EMAIL=website@ready.example',
			'HEALTH_ADMIN_PASSWORD_HASH=$2a$14$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY12',
			'',
		].join('\n')
	);
	const envExample =
		'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nCLIENT_SLUG=ready-site\nDATABASE_URL=postgres://ready_site_app_user:replace-me@web-platform-postgres:5432/ready_site_app\nDATABASE_POOL_MAX=5\nDATABASE_STATEMENT_TIMEOUT_MS=5000\n';
	write(rootDir, '.env.example', envExample);
	write(rootDir, 'deploy/env.example', envExample);
	write(
		rootDir,
		'deploy/Caddyfile.example',
		'ready.example {\n  reverse_proxy 127.0.0.1:3000\n}\nwww.ready.example {\n  redir https://ready.example{uri} permanent\n}\n'
	);
	write(
		rootDir,
		'deploy/quadlets/web.container',
		[
			'[Container]',
			'Image=ghcr.io/acme/ready-site:abc123',
			'EnvironmentFile=%h/secrets/ready-site.prod.env',
			'Network=web-platform.network',
			'PublishPort=127.0.0.1:3000:3000',
			'HostName=ready-site-web',
			'StopTimeout=30',
			'',
		].join('\n')
	);
	write(
		rootDir,
		'static/admin/config.yml',
		'backend:\n  name: github\n  repo: acme/ready-site\n  branch: main\n'
	);
	write(rootDir, 'src/app.html', '<!doctype html><title>Ready Site</title>\n');
	write(rootDir, 'static/og-default.png', TEMPLATE_OG_REPLACEMENT);
	return rootDir;
}

describe('deploy preflight', () => {
	it('passes all checks for a prepared web-only project', async () => {
		const result = await runDeployPreflight({ rootDir: writeReadyProject(), env: {} });

		expect(result.exitCode).toBe(0);
		expect(result.results.every((item) => item.severity === 'pass')).toBe(true);
		expect(result.results.map((item) => item.id)).not.toContain('PREFLIGHT-WORKER-001');
		expect(result.results.map((item) => item.id)).not.toContain('PREFLIGHT-BACKUP-001');
	});

	it.each([
		{
			name: 'production env file',
			check: checkProductionEnvFile,
			mutate: (rootDir: string) => rmSync(join(rootDir, 'production.env')),
			id: 'PREFLIGHT-ENV-001',
		},
		{
			name: 'database URL shape',
			check: checkDatabaseUrlShape,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready:secret@127.0.0.1:5432/ready\n'
				),
			id: 'PREFLIGHT-DB-001',
		},
		{
			name: 'HTTPS origins',
			check: checkHttpsOrigins,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					'ORIGIN=http://ready.example\nPUBLIC_SITE_URL=https://wrong.example\nDATABASE_URL=postgres://ready_site_app_user:secret@web-platform-postgres:5432/ready_site_app\n'
				),
			id: 'PREFLIGHT-ENV-002',
		},
		{
			name: 'Caddyfile domain',
			check: checkCaddyfileDomain,
			mutate: (rootDir: string) => write(rootDir, 'deploy/Caddyfile.example', 'example.com {}\n'),
			id: 'PREFLIGHT-CADDY-001',
		},
		{
			name: 'Quadlet project names',
			check: checkQuadletProject,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'deploy/quadlets/web.container',
					'Image=ghcr.io/acme/wrong-site:abc123\nEnvironmentFile=%h/secrets/wrong-site.prod.env\nNetwork=web-platform.network\nPublishPort=127.0.0.1:3000:3000\nHostName=wrong-site-web\nStopTimeout=30\n'
				),
			id: 'PREFLIGHT-QUADLET-001',
		},
		{
			name: 'runtime reachability',
			check: checkRuntimeReachability,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'deploy/quadlets/web.container',
					'Image=ghcr.io/acme/ready-site:abc123\nEnvironmentFile=%h/secrets/ready-site.prod.env\nNetwork=web-platform.network\nHostName=ready-site-web\n'
				),
			id: 'PREFLIGHT-RUNTIME-001',
		},
		{
			name: 'env examples',
			check: checkEnvExamples,
			mutate: (rootDir: string) =>
				write(rootDir, 'deploy/env.example', 'ORIGIN=https://ready.example\n'),
			id: 'PREFLIGHT-ENV-003',
		},
		{
			name: 'GHCR image shape',
			check: checkGhcrImageShape,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'deploy/quadlets/web.container',
					'Image=ghcr.io/acme/wrong-site:abc123\nEnvironmentFile=%h/secrets/ready-site.prod.env\nNetwork=web-platform.network\nHostName=ready-site-web\n'
				),
			id: 'PREFLIGHT-GHCR-001',
		},
		{
			name: 'required launch blockers',
			check: checkRequiredLaunchBlockers,
			mutate: (rootDir: string) =>
				write(rootDir, 'src/app.html', '<title>Your Site Name</title>\n'),
			id: 'PREFLIGHT-LAUNCH-001',
		},
	])('fails the $name check when its input is wrong', async ({ check, mutate, id }) => {
		const rootDir = writeReadyProject();
		mutate(rootDir);

		const result = await check({ rootDir, env: {} });

		expect(result).toMatchObject({ id, severity: 'fail' });
		expect(result.remediation?.join('\n')).toContain('NEXT:');
	});

	it('fails required launch blockers when Postmark production env is missing', async () => {
		const rootDir = writeReadyProject();
		write(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready_site_app_user:secret@web-platform-postgres:5432/ready_site_app\nHEALTH_ADMIN_PASSWORD_HASH=$2a$14$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY12\n'
		);

		await expect(checkRequiredLaunchBlockers({ rootDir, env: {} })).resolves.toMatchObject({
			severity: 'fail',
			detail: expect.stringContaining('LAUNCH-EMAIL-001'),
		});
	});

	it('runs SOPS decrypt read-only when dev secrets.yaml is configured', async () => {
		const rootDir = writeReadyProject();
		write(rootDir, 'secrets.yaml', 'sops:\n  version: 3.8.0\nORIGIN: ENC[AES256_GCM,data:x]\n');
		const runner = vi.fn().mockResolvedValue({
			code: 0,
			stdout: 'ORIGIN=https://ready.example\n',
			stderr: '',
			durationMs: 1,
		});

		const result = await checkSopsRender({ rootDir, env: {}, runner });

		expect(result.severity).toBe('pass');
		expect(runner).toHaveBeenCalledWith(
			'sops',
			['--decrypt', '--output-type', 'dotenv', join(rootDir, 'secrets.yaml')],
			expect.objectContaining({ capture: true, cwd: rootDir })
		);
	});

	it('fails SOPS check for plaintext secrets.yaml', async () => {
		const rootDir = writeReadyProject();
		write(rootDir, 'secrets.yaml', 'ORIGIN: https://ready.example\n');

		await expect(checkSopsRender({ rootDir, env: {} })).resolves.toMatchObject({
			severity: 'fail',
		});
	});
});
