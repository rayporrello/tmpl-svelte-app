import { describe, expect, it } from 'vitest';

import { nextBackoffSeconds, parseWorkerArgs } from '../../scripts/automation-worker';

describe('automation worker helpers', () => {
	it('uses capped exponential backoff', () => {
		expect(nextBackoffSeconds(0)).toBe(60);
		expect(nextBackoffSeconds(1)).toBe(120);
		expect(nextBackoffSeconds(5)).toBe(1920);
		expect(nextBackoffSeconds(20)).toBe(3600);
	});

	it('parses worker options', () => {
		const options = parseWorkerArgs([
			'--batch-size=25',
			'--stale-after-seconds',
			'120',
			'--worker-id',
			'worker-a',
		]);

		expect(options).toMatchObject({
			batchSize: 25,
			staleAfterSeconds: 120,
			workerId: 'worker-a',
			help: false,
		});
	});

	it('rejects invalid numeric options', () => {
		expect(() => parseWorkerArgs(['--batch-size=0'])).toThrow(/positive integer/);
		expect(() => parseWorkerArgs(['--stale-after-seconds=abc'])).toThrow(/positive integer/);
	});
});
