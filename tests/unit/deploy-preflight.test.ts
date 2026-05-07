import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	checkAutomationProviderConfig,
	checkBackupConfigured,
	checkBackupPitrConfig,
	checkAutomationWorkerArtifact,
	checkCaddyfileDomain,
	checkDatabaseUrlShape,
	checkEnvExamples,
	checkGhcrImageShape,
	checkHttpsOrigins,
	checkPostgresArtifacts,
	checkPostgresEnvShape,
	checkProductionEnvFile,
	checkQuadletNetwork,
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
			'DATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app',
			'DATABASE_DIRECT_URL=postgres://ready_site_app_user:secret@127.0.0.1:5432/ready_site_app',
			'POSTGRES_DB=ready_site_app',
			'POSTGRES_USER=ready_site_app_user',
			'POSTGRES_PASSWORD=secret',
			'BACKUP_REMOTE=r2:bucket/ready',
			'POSTMARK_SERVER_TOKEN=token',
			'CONTACT_TO_EMAIL=hello@ready.example',
			'CONTACT_FROM_EMAIL=website@ready.example',
			'AUTOMATION_PROVIDER=n8n',
			'N8N_WEBHOOK_URL=https://n8n.ready.example/webhook/ready',
			'N8N_WEBHOOK_SECRET=ready-shared-secret',
			'HEALTH_ADMIN_PASSWORD_HASH=$2a$14$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY12',
			'R2_ACCESS_KEY_ID=ready-r2-key',
			'R2_SECRET_ACCESS_KEY=ready-r2-secret',
			'R2_ENDPOINT=https://accountid.r2.cloudflarestorage.com',
			'R2_BUCKET=ready-site-backups',
			'R2_PREFIX=ready-site/postgres',
			'PITR_RETENTION_DAYS=14',
			'',
		].join('\n')
	);
	write(
		rootDir,
		'.env.example',
		'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready_site_app_user:replace-me@ready-site-postgres:5432/ready_site_app\nDATABASE_DIRECT_URL=postgres://ready_site_app_user:replace-me@127.0.0.1:5432/ready_site_app\n'
	);
	write(
		rootDir,
		'deploy/env.example',
		'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready_site_app_user:replace-me@ready-site-postgres:5432/ready_site_app\nDATABASE_DIRECT_URL=postgres://ready_site_app_user:replace-me@127.0.0.1:5432/ready_site_app\n'
	);
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
			'Network=ready-site.network',
			'PublishPort=127.0.0.1:3000:3000',
			'HostName=ready-site-web',
			'StopTimeout=15',
			'',
		].join('\n')
	);
	write(
		rootDir,
		'deploy/quadlets/web.network',
		'[Unit]\nDescription=Project network - ready-site\n\n[Network]\nInternal=false\n'
	);
	write(
		rootDir,
		'deploy/quadlets/postgres.container',
		[
			'[Container]',
			'Image=ghcr.io/acme/ready-site-postgres:abc123',
			'EnvironmentFile=%h/secrets/ready-site.prod.env',
			'Network=ready-site.network',
			'HostName=ready-site-postgres',
			'PublishPort=127.0.0.1:5432:5432',
			'Volume=ready-site-postgres-data:/var/lib/postgresql/data',
			'HealthCmd=pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
			"Exec=postgres -c archive_mode=on -c archive_command='/usr/local/bin/wal-g wal-push %p'",
			'',
		].join('\n')
	);
	write(
		rootDir,
		'deploy/quadlets/postgres.volume',
		'[Volume]\nVolumeName=ready-site-postgres-data\n'
	);
	write(
		rootDir,
		'deploy/Containerfile.postgres',
		[
			'FROM docker.io/library/postgres:18-bookworm',
			'ARG WAL_G_VERSION=3.0.8',
			'RUN wal-g --version',
			'',
		].join('\n')
	);
	write(
		rootDir,
		'deploy/quadlets/worker.container',
		[
			'[Container]',
			'Image=ghcr.io/acme/ready-site:abc123',
			'Exec=bun run scripts/automation-worker.ts -- --daemon',
			'EnvironmentFile=%h/secrets/ready-site.prod.env',
			'Network=ready-site.network',
			'HostName=ready-site-worker',
			'',
			'[Service]',
			'Restart=on-failure',
			'',
		].join('\n')
	);
	write(
		rootDir,
		'deploy/systemd/backup-base.service',
		'[Service]\nWorkingDirectory=%h/ready-site\nExecStart=%h/ready-site/scripts/backup-base.sh\n'
	);
	write(
		rootDir,
		'deploy/systemd/backup-base.timer',
		'[Timer]\nUnit=ready-site-backup-base.service\n'
	);
	write(
		rootDir,
		'deploy/systemd/backup-check.service',
		'[Service]\nWorkingDirectory=%h/ready-site\nExecStart=%h/ready-site/scripts/backup-pitr-check.sh\n'
	);
	write(
		rootDir,
		'deploy/systemd/backup-check.timer',
		'[Timer]\nUnit=ready-site-backup-check.service\n'
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
	it('passes all checks for a prepared project', async () => {
		const result = await runDeployPreflight({ rootDir: writeReadyProject(), env: {} });

		expect(result.exitCode).toBe(0);
		expect(result.results.every((item) => item.severity === 'pass')).toBe(true);
	});

	it('fails with multiple reasons for a placeholder project', async () => {
		const rootDir = tempProject();
		write(rootDir, 'package.json', JSON.stringify({ name: 'tmpl-svelte-app' }, null, 2));
		write(
			rootDir,
			'src/lib/config/site.ts',
			"export const site = { url: 'https://example.com', defaultTitle: 'Your Site Name' };\n"
		);
		write(rootDir, 'deploy/Caddyfile.example', 'example.com {\n}\nwww.example.com {\n}\n');
		write(
			rootDir,
			'deploy/quadlets/web.container',
			'Image=ghcr.io/<owner>/<name>:<sha>\nEnvironmentFile=%h/secrets/<project>.prod.env\n'
		);
		write(rootDir, 'static/admin/config.yml', 'backend:\n  name: github\n  repo: <owner>/<repo>\n');
		write(rootDir, 'src/app.html', '<!doctype html><title>Your Site Name</title>\n');
		write(rootDir, 'static/og-default.png', TEMPLATE_OG_REPLACEMENT);

		const result = await runDeployPreflight({ rootDir, env: {} });

		expect(result.exitCode).toBe(1);
		expect(result.results.filter((item) => item.severity === 'fail').length).toBeGreaterThan(4);
		expect(result.results.find((item) => item.id === 'PREFLIGHT-ENV-001')).toMatchObject({
			severity: 'fail',
		});
		expect(result.results.find((item) => item.id === 'PREFLIGHT-CADDY-001')).toMatchObject({
			severity: 'fail',
		});
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
					'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready:secret@127.0.0.1:5432/ready\nBACKUP_REMOTE=r2:bucket/ready\n'
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
					'ORIGIN=http://ready.example\nPUBLIC_SITE_URL=https://wrong.example\nDATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app\nBACKUP_REMOTE=r2:bucket/ready\n'
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
					'Image=ghcr.io/acme/wrong-site:abc123\nEnvironmentFile=%h/secrets/wrong-site.prod.env\n'
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
					'Image=ghcr.io/acme/ready-site:abc123\nEnvironmentFile=%h/secrets/ready-site.prod.env\nNetwork=ready-site.network\nHostName=ready-site-web\n'
				),
			id: 'PREFLIGHT-RUNTIME-001',
		},
		{
			name: 'network Quadlet',
			check: checkQuadletNetwork,
			mutate: (rootDir: string) =>
				write(rootDir, 'deploy/quadlets/web.network', '[Unit]\nDescription=<project>\n'),
			id: 'PREFLIGHT-QUADLET-002',
		},
		{
			name: 'env examples',
			check: checkEnvExamples,
			mutate: (rootDir: string) =>
				write(rootDir, 'deploy/env.example', 'ORIGIN=https://ready.example\n'),
			id: 'PREFLIGHT-ENV-003',
		},
		{
			name: 'Postgres artifacts',
			check: checkPostgresArtifacts,
			mutate: (rootDir: string) =>
				write(rootDir, 'deploy/quadlets/postgres.container', 'HostName=wrong-postgres\n'),
			id: 'PREFLIGHT-POSTGRES-001',
		},
		{
			name: 'bundled Postgres env shape',
			check: checkPostgresEnvShape,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app\nBACKUP_REMOTE=r2:bucket/ready\n'
				),
			id: 'PREFLIGHT-POSTGRES-002',
		},
		{
			name: 'automation worker artifact',
			check: checkAutomationWorkerArtifact,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'deploy/quadlets/worker.container',
					'[Container]\nImage=ghcr.io/acme/ready-site:abc123\n'
				),
			id: 'PREFLIGHT-WORKER-001',
		},
		{
			name: 'GHCR image shape',
			check: checkGhcrImageShape,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'deploy/quadlets/web.container',
					'Image=ghcr.io/acme/wrong-site:abc123\nEnvironmentFile=%h/secrets/ready-site.prod.env\nNetwork=ready-site.network\nHostName=ready-site-web\n'
				),
			id: 'PREFLIGHT-GHCR-001',
		},
		{
			name: 'automation provider config — missing n8n URL',
			check: checkAutomationProviderConfig,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					[
						'ORIGIN=https://ready.example',
						'PUBLIC_SITE_URL=https://ready.example',
						'DATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app',
						'DATABASE_DIRECT_URL=postgres://ready_site_app_user:secret@127.0.0.1:5432/ready_site_app',
						'POSTGRES_DB=ready_site_app',
						'POSTGRES_USER=ready_site_app_user',
						'POSTGRES_PASSWORD=secret',
						'BACKUP_REMOTE=r2:bucket/ready',
						'AUTOMATION_PROVIDER=n8n',
						'',
					].join('\n')
				),
			id: 'PREFLIGHT-AUTOMATION-001',
		},
		{
			name: 'automation provider config — console mode in prod',
			check: checkAutomationProviderConfig,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					[
						'ORIGIN=https://ready.example',
						'PUBLIC_SITE_URL=https://ready.example',
						'DATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app',
						'DATABASE_DIRECT_URL=postgres://ready_site_app_user:secret@127.0.0.1:5432/ready_site_app',
						'POSTGRES_DB=ready_site_app',
						'POSTGRES_USER=ready_site_app_user',
						'POSTGRES_PASSWORD=secret',
						'BACKUP_REMOTE=r2:bucket/ready',
						'AUTOMATION_PROVIDER=console',
						'',
					].join('\n')
				),
			id: 'PREFLIGHT-AUTOMATION-001',
		},
		{
			name: 'backup configuration',
			check: checkBackupConfigured,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready:secret@db.ready.example:5432/ready\n'
				),
			id: 'PREFLIGHT-BACKUP-001',
		},
		{
			name: 'PITR backup config — missing R2 creds on bundled Postgres',
			check: checkBackupPitrConfig,
			mutate: (rootDir: string) =>
				write(
					rootDir,
					'production.env',
					[
						'ORIGIN=https://ready.example',
						'PUBLIC_SITE_URL=https://ready.example',
						'DATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app',
						'DATABASE_DIRECT_URL=postgres://ready_site_app_user:secret@127.0.0.1:5432/ready_site_app',
						'POSTGRES_DB=ready_site_app',
						'POSTGRES_USER=ready_site_app_user',
						'POSTGRES_PASSWORD=secret',
						'BACKUP_REMOTE=r2:bucket/ready',
						'AUTOMATION_PROVIDER=n8n',
						'N8N_WEBHOOK_URL=https://n8n.ready.example/webhook/ready',
						'N8N_WEBHOOK_SECRET=ready-shared-secret',
						'',
					].join('\n')
				),
			id: 'PREFLIGHT-BACKUP-PITR-001',
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

	it('allows an explicit backup waiver', async () => {
		const rootDir = writeReadyProject();
		write(
			rootDir,
			'production.env',
			'ORIGIN=https://ready.example\nPUBLIC_SITE_URL=https://ready.example\nDATABASE_URL=postgres://ready:secret@db.ready.example:5432/ready\nBACKUP_WAIVED=true\n'
		);

		await expect(checkBackupConfigured({ rootDir, env: {} })).resolves.toMatchObject({
			severity: 'pass',
		});
	});

	it('fails required launch blockers when Postmark production env is missing', async () => {
		const rootDir = writeReadyProject();
		write(
			rootDir,
			'production.env',
			[
				'ORIGIN=https://ready.example',
				'PUBLIC_SITE_URL=https://ready.example',
				'DATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app',
				'DATABASE_DIRECT_URL=postgres://ready_site_app_user:secret@127.0.0.1:5432/ready_site_app',
				'POSTGRES_DB=ready_site_app',
				'POSTGRES_USER=ready_site_app_user',
				'POSTGRES_PASSWORD=secret',
				'BACKUP_REMOTE=r2:bucket/ready',
				'AUTOMATION_PROVIDER=noop',
				'',
			].join('\n')
		);

		await expect(checkRequiredLaunchBlockers({ rootDir, env: {} })).resolves.toMatchObject({
			severity: 'fail',
			detail: expect.stringContaining('LAUNCH-EMAIL-001'),
		});
	});

	it('allows required launch blockers with an explicit console-email waiver', async () => {
		const rootDir = writeReadyProject();
		write(
			rootDir,
			'production.env',
			[
				'ORIGIN=https://ready.example',
				'PUBLIC_SITE_URL=https://ready.example',
				'DATABASE_URL=postgres://ready_site_app_user:secret@ready-site-postgres:5432/ready_site_app',
				'DATABASE_DIRECT_URL=postgres://ready_site_app_user:secret@127.0.0.1:5432/ready_site_app',
				'POSTGRES_DB=ready_site_app',
				'POSTGRES_USER=ready_site_app_user',
				'POSTGRES_PASSWORD=secret',
				'BACKUP_REMOTE=r2:bucket/ready',
				'AUTOMATION_PROVIDER=noop',
				'LAUNCH_ALLOW_CONSOLE_EMAIL=1',
				'HEALTH_ADMIN_PASSWORD_HASH=$2a$14$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY12',
				'',
			].join('\n')
		);

		await expect(checkRequiredLaunchBlockers({ rootDir, env: {} })).resolves.toMatchObject({
			severity: 'pass',
		});
	});

	it('runs SOPS decrypt read-only when secrets.yaml is configured', async () => {
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
