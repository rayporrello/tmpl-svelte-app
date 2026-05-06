import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	appendEvent,
	isStale,
	readChannel,
	readEvents,
	resolveStateDir,
	writeChannel,
} from '../../scripts/lib/ops-status';

let tempDir: string;
const previousOpsStateDir = process.env.OPS_STATE_DIR;

async function collectEvents(opts?: Parameters<typeof readEvents>[0]): Promise<object[]> {
	const events: object[] = [];
	for await (const event of readEvents(opts)) events.push(event);
	return events;
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'ops-status-'));
	process.env.OPS_STATE_DIR = tempDir;
});

afterEach(() => {
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe('ops status ledger', () => {
	it('round-trips channel JSON through the state directory', () => {
		writeChannel('smoke', { status: 'pass', detail: { url: 'https://example.com' } });

		expect(resolveStateDir()).toBe(tempDir);
		expect(readChannel('smoke')).toEqual({
			status: 'pass',
			detail: { url: 'https://example.com' },
		});
	});

	it('leaves the channel intact when an interrupted temp write is present', () => {
		writeChannel('smoke', { status: 'pass', detail: { run: 1 } });
		writeFileSync(join(tempDir, 'smoke.json.tmp'), '{"status":"fail"');

		expect(readChannel('smoke')).toEqual({ status: 'pass', detail: { run: 1 } });
	});

	it('serializes two writers without torn JSON', async () => {
		await Promise.all([
			Promise.resolve().then(() => writeChannel('smoke', { writer: 'one' })),
			Promise.resolve().then(() => writeChannel('smoke', { writer: 'two' })),
		]);

		expect(readChannel('smoke')).toSatisfy((value: unknown) => {
			return (
				JSON.stringify(value) === JSON.stringify({ writer: 'one' }) ||
				JSON.stringify(value) === JSON.stringify({ writer: 'two' })
			);
		});
		expect(existsSync(join(tempDir, 'smoke.lock'))).toBe(false);
	});

	it('rotates NDJSON events at 10MB and keeps two rotated copies', async () => {
		const payload = 'x'.repeat(10 * 1024 * 1024);

		appendEvent({ channel: 'release', marker: 'first', payload });
		appendEvent({ channel: 'release', marker: 'second', payload });
		appendEvent({ channel: 'release', marker: 'third', payload });
		appendEvent({ channel: 'release', marker: 'fourth', payload });

		expect(existsSync(join(tempDir, 'events.ndjson'))).toBe(true);
		expect(existsSync(join(tempDir, 'events.ndjson.1'))).toBe(true);
		expect(existsSync(join(tempDir, 'events.ndjson.2'))).toBe(true);
		expect(existsSync(join(tempDir, 'events.ndjson.3'))).toBe(false);
		expect(readFileSync(join(tempDir, 'events.ndjson.2'), 'utf8')).toContain('"marker":"second"');

		const events = await collectEvents({ limit: 2, channel: 'release' });
		expect(events.map((event) => (event as { marker: string }).marker)).toEqual([
			'fourth',
			'third',
		]);
	});

	it('reports stale channels when success is missing or older than the configured window', () => {
		expect(isStale('missing', new Date('2026-05-06T12:00:00Z'))).toBe(true);

		writeChannel('backup', {
			last_success_at: '2026-05-06T11:00:00.000Z',
			stale_after_seconds: 120,
		});

		expect(isStale('backup', new Date('2026-05-06T11:01:00Z'))).toBe(false);
		expect(isStale('backup', new Date('2026-05-06T11:03:01Z'))).toBe(true);
	});
});
