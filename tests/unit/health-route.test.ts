import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HealthPage from '../../src/routes/admin/health/+page.svelte';
import { _loadAdminHealthData } from '../../src/routes/admin/health/+page.server';
import { recordRelease, type Release } from '../../scripts/lib/release-state';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;

function release(id: string): Release {
	return {
		id,
		sha: `sha-${id}`,
		image: `ghcr.io/example/site:sha-${id}`,
		deployedAt: `2026-05-07T12:0${id}:00.000Z`,
		migrations: [],
		migrationSafety: 'rollback-safe',
	};
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'health-route-'));
	process.env.OPS_STATE_DIR = tempDir;
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
	rmSync(tempDir, { recursive: true, force: true });
});

describe('/admin/health route', () => {
	it('server load returns summary and source-tagged results', async () => {
		recordRelease(release('1'));
		const data = await _loadAdminHealthData({
			db: {
				countOutboxPending: vi.fn(async () => 0),
				countOutboxDeadLetters: vi.fn(async () => 1),
				countSmokeBacklog: vi.fn(async () => 0),
			},
		});

		expect(data.summary[0].id).toBe('HEALTH-OVERALL-001');
		expect(data.results.every((item) => item.source)).toBe(true);
		expect(data.results.find((item) => item.id === 'HEALTH-DB-DEAD-001')).toMatchObject({
			severity: 'warn',
			source: 'live-db',
		});
	});

	it('renders empty-ledger HTML with severity badges', async () => {
		const data = await _loadAdminHealthData({
			db: {
				countOutboxPending: vi.fn(async () => 0),
				countOutboxDeadLetters: vi.fn(async () => 0),
				countSmokeBacklog: vi.fn(async () => 0),
			},
		});
		const html = render(HealthPage, { props: { data: { ...data, devWarnings: [] } } }).body;

		expect(html).toContain('Admin Health');
		expect(html).toContain('HEALTH-RELEASE-001');
		expect(html).toContain('source-badge');
		expect(html).toContain('health-card--warn');
		expect(html).toContain('ledger');
		expect(html).toContain('live-db');
	});
});
