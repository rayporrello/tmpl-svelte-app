import { describe, expect, it } from 'vitest';

import {
	fail,
	info,
	pass,
	printOpsResult,
	printOpsResults,
	severityToExitCode,
	warn,
	worstSeverity,
	type OpsResult,
} from '../../scripts/lib/ops-result';
import type { PrintStream } from '../../scripts/lib/print';

function memoryStream(): { chunks: string[]; stream: PrintStream } {
	const chunks: string[] = [];
	return {
		chunks,
		stream: {
			write(chunk: string) {
				chunks.push(chunk);
			},
		},
	};
}

describe('ops result helpers', () => {
	it('builds stable result shapes with constructor helpers', () => {
		expect(
			fail('OPS-001', 'Database is reachable', {
				detail: 'connection refused',
				remediation: ['NEXT: Check DATABASE_URL.'],
				runbook: 'docs/operations/health.md',
			})
		).toEqual({
			id: 'OPS-001',
			severity: 'fail',
			summary: 'Database is reachable',
			detail: 'connection refused',
			remediation: ['NEXT: Check DATABASE_URL.'],
			runbook: 'docs/operations/health.md',
		});

		expect(pass('OPS-002', 'Bun is installed').severity).toBe('pass');
		expect(info('OPS-003', 'Runtime check skipped').severity).toBe('info');
		expect(warn('OPS-004', 'Deployment placeholders remain').severity).toBe('warn');
	});

	it('computes the worst severity and canonical exit code', () => {
		const passing = [pass('OPS-001', 'One'), info('OPS-002', 'Two')];
		const warning = [...passing, warn('OPS-003', 'Three')];
		const failing = [...warning, fail('OPS-004', 'Four')];

		expect(worstSeverity([])).toBe('pass');
		expect(worstSeverity(passing)).toBe('info');
		expect(worstSeverity(warning)).toBe('warn');
		expect(worstSeverity(failing)).toBe('fail');

		expect(severityToExitCode('pass')).toBe(0);
		expect(severityToExitCode('info')).toBe(0);
		expect(severityToExitCode('warn')).toBe(0);
		expect(severityToExitCode('fail')).toBe(1);
	});

	it('prints a single result without color for non-TTY streams', () => {
		const { chunks, stream } = memoryStream();
		const output = printOpsResult(
			warn('OPS-001', 'Deployment placeholders remain', {
				detail: 'deploy/env.example contains <domain>',
				remediation: ['NEXT: Run bun run init:site.'],
			}),
			{ stream, isTty: false }
		);

		expect(output).toContain('! OPS-001 Deployment placeholders remain');
		expect(output).toContain('    deploy/env.example contains <domain>');
		expect(output).toContain('    NEXT: Run bun run init:site.');
		expect(output).not.toContain('\u001b[');
		expect(chunks.join('')).toBe(`${output}\n`);
	});

	it('prints color for TTY streams unless disabled', () => {
		const result = pass('OPS-001', 'Bun is installed');
		const colorOutput = printOpsResult(result, { stream: memoryStream().stream, isTty: true });
		const plainOutput = printOpsResult(result, {
			stream: memoryStream().stream,
			isTty: true,
			noColor: true,
		});

		expect(colorOutput).toContain('\u001b[32m');
		expect(plainOutput).not.toContain('\u001b[');
	});

	it('prints result batches with optional severity grouping', () => {
		const results: OpsResult[] = [
			pass('OPS-001', 'Bun is installed'),
			fail('OPS-002', 'Database is reachable', { remediation: ['NEXT: Start Postgres.'] }),
		];
		const output = printOpsResults(results, {
			stream: memoryStream().stream,
			isTty: false,
			groupBySeverity: true,
		});

		expect(output).toContain('Failures');
		expect(output).toContain('✗ OPS-002 Database is reachable');
		expect(output).toContain('Passing');
		expect(output).toContain('✓ OPS-001 Bun is installed');
	});
});
