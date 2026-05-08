import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	readDbLiveFacts,
	readHostLiveFacts,
	readLedgerFacts,
	summarize,
	type DbHandle,
	type HostProbeRunner,
} from '../../scripts/lib/health-engine';
import { appendEvent } from '../../scripts/lib/ops-status';
import { recordRelease, type Release } from '../../scripts/lib/release-state';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;
const previousPublicSiteUrl = process.env.PUBLIC_SITE_URL;

function release(id: string, migrationSafety: Release['migrationSafety']): Release {
	return {
		id,
		sha: `sha-${id}`,
		image: `ghcr.io/example/site:sha-${id}`,
		deployedAt: `2026-05-07T12:0${id}:00.000Z`,
		migrations: [`000${id}_migration.sql`],
		migrationSafety,
	};
}

function mockHost(overrides: Partial<HostProbeRunner> = {}): HostProbeRunner {
	return {
		systemctlIsActive: vi.fn(async (unit: string) => ({
			active: unit !== 'web.service',
			sub: unit === 'web.service' ? 'failed' : 'active',
		})),
		diskFree: vi.fn(async () => ({
			bytesAvailable: 500,
			bytesTotal: 1_000,
		})),
		certExpiry: vi.fn(async () => ({ expiresAt: '2026-06-07T00:00:00.000Z' })),
		...overrides,
	};
}

function mockDb(overrides: Partial<DbHandle> = {}): DbHandle {
	return {
		countOutboxPending: vi.fn(async () => 0),
		countOutboxDeadLetters: vi.fn(async () => 0),
		countSmokeBacklog: vi.fn(async () => 0),
		...overrides,
	};
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'health-engine-'));
	process.env.OPS_STATE_DIR = tempDir;
	process.env.PUBLIC_SITE_URL = 'https://example.com';
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
	if (previousPublicSiteUrl === undefined) {
		delete process.env.PUBLIC_SITE_URL;
	} else {
		process.env.PUBLIC_SITE_URL = previousPublicSiteUrl;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe('health engine', () => {
	it('reads ledger facts and caps recent events', () => {
		recordRelease(release('1', 'rollback-safe'));
		recordRelease(release('2', 'rollback-safe'));
		appendEvent({ channel: 'custom', type: 'custom.event', occurred_at: '2026-05-07T04:00:00Z' });
		appendEvent({ channel: 'smoke', type: 'deploy.smoke', occurred_at: '2026-05-07T05:00:00Z' });

		const result = readLedgerFacts({ eventsLimit: 2 });

		expect(result.facts.currentRelease?.id).toBe('2');
		expect(result.facts.previousRelease?.id).toBe('1');
		expect(result.facts.recentEvents).toHaveLength(2);
		expect(result.results.every((item) => item.source === 'ledger')).toBe(true);
		expect(result.results.map((item) => item.id)).not.toContain('HEALTH-BACKUP-001');
		expect(result.results.map((item) => item.id)).not.toContain('HEALTH-DRILL-001');
	});

	it('reports the web unit independently', async () => {
		const result = await readHostLiveFacts({ runner: mockHost() });

		expect(result.results.find((item) => item.id.includes('web.service'))).toMatchObject({
			severity: 'fail',
			source: 'live-host',
		});
		expect(result.results.some((item) => item.id.includes('worker.service'))).toBe(false);
		expect(result.results.some((item) => item.id.includes('postgres.service'))).toBe(false);
	});

	it('warns for low disk and expiring certificates, and fails expired certificates', async () => {
		const expiring = await readHostLiveFacts({
			runner: mockHost({
				systemctlIsActive: vi.fn(async () => ({ active: true, sub: 'active' })),
				diskFree: vi.fn(async () => ({ bytesAvailable: 100, bytesTotal: 1_000 })),
				certExpiry: vi.fn(async () => ({ expiresAt: '2026-05-14T12:00:00.000Z' })),
			}),
		});
		expect(expiring.results.find((item) => item.id === 'HEALTH-HOST-DISK-001')).toMatchObject({
			severity: 'warn',
		});
		expect(expiring.results.find((item) => item.id === 'HEALTH-HOST-CERT-001')).toMatchObject({
			severity: 'warn',
		});

		const expired = await readHostLiveFacts({
			runner: mockHost({
				systemctlIsActive: vi.fn(async () => ({ active: true, sub: 'active' })),
				certExpiry: vi.fn(async () => ({ expiresAt: '2026-05-01T00:00:00.000Z' })),
			}),
		});
		expect(expired.results.find((item) => item.id === 'HEALTH-HOST-CERT-001')).toMatchObject({
			severity: 'fail',
		});
	});

	it('warns for DB outbox alarms and smoke backlog', async () => {
		const result = await readDbLiveFacts({
			db: mockDb({
				countOutboxPending: vi.fn(async () => 30),
				countOutboxDeadLetters: vi.fn(async () => 1),
				countSmokeBacklog: vi.fn(async () => 90),
			}),
		});

		expect(result.facts).toMatchObject({
			outboxDepth: 30,
			outboxDeadLetters: 1,
			smokeBacklog: 90,
		});
		expect(result.results.every((item) => item.source === 'live-db')).toBe(true);
		expect(result.results.map((item) => item.severity)).toEqual(['warn', 'warn', 'warn']);
	});

	it('times out one slow probe without blocking the rest', async () => {
		const resultPromise = readHostLiveFacts({
			timeoutMs: 5,
			runner: mockHost({
				systemctlIsActive: vi.fn(async () => {
					return await new Promise<{ active: boolean; sub: string }>(() => undefined);
				}),
				diskFree: vi.fn(async () => ({ bytesAvailable: 500, bytesTotal: 1_000 })),
			}),
		});
		await vi.advanceTimersByTimeAsync(6);
		const result = await resultPromise;

		expect(result.results.find((item) => item.id.includes('web.service'))).toMatchObject({
			severity: 'warn',
			detail: 'probe timed out after 5s',
		});
		expect(result.results.find((item) => item.id === 'HEALTH-HOST-DISK-001')).toMatchObject({
			severity: 'pass',
		});
	});

	it('summarizes to the worst input severity', () => {
		const summary = summarize({ currentRelease: null, previousRelease: null, recentEvents: [] }, [
			{ id: 'one', severity: 'pass', summary: 'ok', source: 'ledger' },
			{ id: 'two', severity: 'fail', summary: 'bad', source: 'live-db' },
		]);

		expect(summary[0]).toMatchObject({
			id: 'HEALTH-OVERALL-001',
			severity: 'fail',
			source: 'ledger',
		});
	});
});
