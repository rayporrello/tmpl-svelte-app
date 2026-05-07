import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostProbeRunner } from '../../scripts/lib/health-engine';
import { recordRelease, type Release } from '../../scripts/lib/release-state';
import { main, parseArgs, runHealthLive } from '../../scripts/health-live';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;
const previousPublicSiteUrl = process.env.PUBLIC_SITE_URL;

function memoryStream() {
	let output = '';
	return {
		stream: { write: (chunk: string) => (output += chunk) },
		get output() {
			return output;
		},
	};
}

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

function host(active = true): HostProbeRunner {
	return {
		systemctlIsActive: vi.fn(async () => ({ active, sub: active ? 'active' : 'failed' })),
		diskFree: vi.fn(async () => ({ bytesAvailable: 500, bytesTotal: 1_000 })),
		certExpiry: vi.fn(async () => ({ expiresAt: '2026-06-07T00:00:00.000Z' })),
	};
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'health-cli-'));
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

describe('health:live CLI', () => {
	it('parses source and events flags', () => {
		expect(parseArgs(['--source=ledger', '--events=2', '--json'])).toMatchObject({
			source: 'ledger',
			events: 2,
			json: true,
		});
	});

	it('skips host probes for --source=ledger and honors event limit', async () => {
		recordRelease(release('1'));
		recordRelease(release('2'));
		const runner = host();
		const result = await runHealthLive({
			argv: ['--source=ledger', '--events=1'],
			hostRunner: runner,
		});

		expect(runner.systemctlIsActive).not.toHaveBeenCalled();
		expect(
			result.results.find((item) => item.id === 'HEALTH-EVENTS-001')?.detail?.split('\n')
		).toHaveLength(1);
	});

	it('emits parseable JSON with source tags', async () => {
		const stdout = memoryStream();
		const stderr = memoryStream();
		const code = await main({
			argv: ['--source=ledger', '--json'],
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		const parsed = JSON.parse(stdout.output) as Array<{ id: string; source?: string }>;
		expect(code).toBe(0);
		expect(parsed.length).toBeGreaterThan(0);
		expect(parsed.every((item) => item.source)).toBe(true);
	});

	it('exits 1 when the worst severity is fail', async () => {
		const result = await runHealthLive({
			argv: ['--source=live'],
			hostRunner: host(false),
		});

		expect(result.exitCode).toBe(1);
		expect(result.results.some((item) => item.severity === 'fail')).toBe(true);
	});
});
