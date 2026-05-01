import { describe, expect, it } from 'vitest';

import { BootstrapScriptError } from '../../scripts/lib/errors';
import {
	POSTGRES_IMAGE,
	allocatePostgresPort,
	postgresIdentifiers,
	provisionLocalPostgres,
	sanitizeProjectSlug,
} from '../../scripts/lib/postgres-dev';
import type { RunResult } from '../../scripts/lib/run';

const okResult: RunResult = { code: 0, stdout: '', stderr: '', durationMs: 1 };

describe('postgres-dev helper', () => {
	it('sanitizes container slug and Postgres identifiers', () => {
		expect(sanitizeProjectSlug('Acme Studio!')).toBe('acme-studio');
		expect(postgresIdentifiers('acme-studio')).toEqual({
			database: 'acme_studio',
			user: 'acme_studio_user',
			container: 'acme-studio-pg',
		});
	});

	it('allocates ports from the deterministic hash range and fails on exhaustion', async () => {
		const occupied: number[] = [];
		const port = await allocatePostgresPort('acme-studio', async (candidate) => {
			occupied.push(candidate);
			return occupied.length === 3;
		});
		expect(port).toBeGreaterThanOrEqual(50000);
		expect(port).toBeLessThanOrEqual(55000);
		expect(occupied).toHaveLength(3);

		await expect(allocatePostgresPort('acme-studio', async () => false)).rejects.toMatchObject({
			code: 'BOOT-PG-003',
		});
	});

	it('returns an existing reachable DATABASE_URL without provisioning a container', async () => {
		const result = await provisionLocalPostgres({
			projectSlug: 'acme-studio',
			existingDatabaseUrl: 'postgres://user:pw@db:5432/app',
			isDatabaseReachable: async () => true,
			runtime: null,
		});

		expect(result).toEqual({
			runtime: 'external',
			container: null,
			port: null,
			databaseUrl: 'postgres://user:pw@db:5432/app',
		});
	});

	it('throws BOOT-PG-001 when no runtime is available', async () => {
		await expect(
			provisionLocalPostgres({ projectSlug: 'acme-studio', runtime: null })
		).rejects.toBeInstanceOf(BootstrapScriptError);
		await expect(
			provisionLocalPostgres({ projectSlug: 'acme-studio', runtime: null })
		).rejects.toMatchObject({
			code: 'BOOT-PG-001',
		});
	});

	it('pulls and starts a labeled container, then waits with runtime exec pg_isready', async () => {
		const calls: Array<{ command: string; args: readonly string[] }> = [];
		const result = await provisionLocalPostgres({
			projectSlug: 'acme-studio',
			runtime: 'podman',
			password: 'b'.repeat(64),
			readinessIntervalMs: 1,
			isPortAvailable: async () => true,
			commandRunner: async (command, args) => {
				calls.push({ command, args });
				if (args[0] === 'inspect') return { ...okResult, code: 1 };
				return okResult;
			},
		});

		expect(result.runtime).toBe('podman');
		expect(result.container).toBe('acme-studio-pg');
		expect(result.databaseUrl).toContain('postgres://acme_studio_user:');
		expect(calls).toEqual(
			expect.arrayContaining([
				{ command: 'podman', args: ['pull', POSTGRES_IMAGE] },
				expect.objectContaining({
					command: 'podman',
					args: expect.arrayContaining([
						'run',
						'--label',
						'tmpl-svelte-app.bootstrap=true',
						'--label',
						'tmpl-svelte-app.project-slug=acme-studio',
						'-p',
						expect.stringMatching(/^127\.0\.0\.1:\d+:5432$/u),
						'-e',
						'POSTGRES_DB=acme_studio',
						'-e',
						'POSTGRES_USER=acme_studio_user',
						POSTGRES_IMAGE,
					]),
				}),
				{
					command: 'podman',
					args: [
						'exec',
						'acme-studio-pg',
						'pg_isready',
						'-U',
						'acme_studio_user',
						'-d',
						'acme_studio',
					],
				},
			])
		);
	});

	it('refuses to reuse a container whose labels do not match', async () => {
		await expect(
			provisionLocalPostgres({
				projectSlug: 'acme-studio',
				runtime: 'docker',
				commandRunner: async () => ({
					...okResult,
					stdout: JSON.stringify({ 'tmpl-svelte-app.bootstrap': 'false' }),
				}),
			})
		).rejects.toMatchObject({ code: 'BOOT-PG-002' });
	});

	it('reuses a bootstrap-owned container without replacing the existing DATABASE_URL', async () => {
		const result = await provisionLocalPostgres({
			projectSlug: 'acme-studio',
			runtime: 'docker',
			existingDatabaseUrl: 'postgres://acme_studio_user:old@127.0.0.1:55555/acme_studio',
			isDatabaseReachable: async () => false,
			readinessIntervalMs: 1,
			commandRunner: async (_command, args) => {
				if (args[0] === 'inspect') {
					return {
						...okResult,
						stdout: JSON.stringify({
							'tmpl-svelte-app.bootstrap': 'true',
							'tmpl-svelte-app.project-slug': 'acme-studio',
							'tmpl-svelte-app.contract-version': '1',
						}),
					};
				}
				if (args[0] === 'port') return { ...okResult, stdout: '127.0.0.1:55555\n' };
				return okResult;
			},
		});

		expect(result.databaseUrl).toBe('postgres://acme_studio_user:old@127.0.0.1:55555/acme_studio');
		expect(result.port).toBe(55555);
	});
});
