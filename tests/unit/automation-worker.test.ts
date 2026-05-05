import { describe, expect, it, vi } from 'vitest';

import {
	nextBackoffSeconds,
	parseWorkerArgs,
	warnIfAutomationConfigIncomplete,
} from '../../scripts/automation-worker';

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

describe('warnIfAutomationConfigIncomplete', () => {
	it('warns when n8n provider is missing webhook config', () => {
		const logger = { warn: vi.fn(), info: vi.fn() };
		warnIfAutomationConfigIncomplete({ AUTOMATION_PROVIDER: 'n8n' } as NodeJS.ProcessEnv, logger);

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.warn.mock.calls[0][0]).toMatch(/N8N_WEBHOOK_URL/u);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it('logs an info note for explicit noop and stays quiet otherwise', () => {
		const logger = { warn: vi.fn(), info: vi.fn() };
		warnIfAutomationConfigIncomplete({ AUTOMATION_PROVIDER: 'noop' } as NodeJS.ProcessEnv, logger);

		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info.mock.calls[0][0]).toMatch(/noop/u);
	});

	it('stays silent for fully configured n8n', () => {
		const logger = { warn: vi.fn(), info: vi.fn() };
		warnIfAutomationConfigIncomplete(
			{
				AUTOMATION_PROVIDER: 'n8n',
				N8N_WEBHOOK_URL: 'https://n8n.example/webhook/lead',
				N8N_WEBHOOK_SECRET: 'shared',
			} as unknown as NodeJS.ProcessEnv,
			logger
		);

		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.info).not.toHaveBeenCalled();
	});

	it('does not warn for console provider (worker dev mode)', () => {
		const logger = { warn: vi.fn(), info: vi.fn() };
		warnIfAutomationConfigIncomplete(
			{ AUTOMATION_PROVIDER: 'console' } as NodeJS.ProcessEnv,
			logger
		);

		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info.mock.calls[0][0]).toMatch(/console/u);
	});
});
