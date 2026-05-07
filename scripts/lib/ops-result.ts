import type { PrintStream } from './print';

export type OpsSeverity = 'pass' | 'info' | 'warn' | 'fail';

export interface OpsResult {
	/** Stable identifier, e.g. 'DOCTOR-PG-001'. Used for grepping logs and tests. */
	id: string;
	severity: OpsSeverity;
	/** Data source for operator surfaces that merge ledger snapshots and live probes. */
	source?: string;
	/** Single-line headline, operator-readable. */
	summary: string;
	/** Multi-line detail, optional. */
	detail?: string;
	/** Ordered, copy-pasteable remediation steps. */
	remediation?: string[];
	/** Doc path or URL pointing to a runbook. */
	runbook?: string;
}

export type OpsResultOptions = Omit<OpsResult, 'id' | 'severity' | 'summary'>;

export type PrintOpsOptions = {
	stream?: PrintStream;
	noColor?: boolean;
	isTty?: boolean;
	groupBySeverity?: boolean;
};

const SEVERITY_RANK: Record<OpsSeverity, number> = {
	pass: 0,
	info: 1,
	warn: 2,
	fail: 3,
};

const SEVERITY_ORDER: OpsSeverity[] = ['fail', 'warn', 'info', 'pass'];

const SEVERITY_LABEL: Record<OpsSeverity, string> = {
	pass: 'Passing',
	info: 'Informational',
	warn: 'Warnings',
	fail: 'Failures',
};

const GLYPH: Record<OpsSeverity, string> = {
	pass: '✓',
	info: 'i',
	warn: '!',
	fail: '✗',
};

const COLOR: Record<OpsSeverity, string> = {
	pass: '\u001b[32m',
	info: '\u001b[36m',
	warn: '\u001b[33m',
	fail: '\u001b[31m',
};

const RESET = '\u001b[0m';

function result(
	severity: OpsSeverity,
	id: string,
	summary: string,
	opts: OpsResultOptions = {}
): OpsResult {
	return {
		id,
		severity,
		summary,
		...opts,
		remediation: opts.remediation?.filter((step) => step.trim().length > 0),
	};
}

export function pass(id: string, summary: string, opts: OpsResultOptions = {}): OpsResult {
	return result('pass', id, summary, opts);
}

export function info(id: string, summary: string, opts: OpsResultOptions = {}): OpsResult {
	return result('info', id, summary, opts);
}

export function warn(id: string, summary: string, opts: OpsResultOptions = {}): OpsResult {
	return result('warn', id, summary, opts);
}

export function fail(id: string, summary: string, opts: OpsResultOptions = {}): OpsResult {
	return result('fail', id, summary, opts);
}

export function worstSeverity(results: readonly OpsResult[]): OpsSeverity {
	let worst: OpsSeverity = 'pass';
	for (const item of results) {
		if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[worst]) worst = item.severity;
	}
	return worst;
}

export function severityToExitCode(severity: OpsSeverity): 0 | 1 {
	return severity === 'fail' ? 1 : 0;
}

function shouldColor(options: PrintOpsOptions): boolean {
	if (options.noColor) return false;
	if (typeof options.isTty === 'boolean') return options.isTty;
	const stream = options.stream ?? process.stdout;
	return Boolean((stream as typeof process.stdout).isTTY);
}

function colorize(value: string, severity: OpsSeverity, enabled: boolean): string {
	return enabled ? `${COLOR[severity]}${value}${RESET}` : value;
}

function renderOpsResult(result: OpsResult, options: PrintOpsOptions = {}): string {
	const color = shouldColor(options);
	const lines = [
		`${colorize(GLYPH[result.severity], result.severity, color)} ${result.id} ${result.summary}`,
	];

	if (result.source) lines.push(`    [${result.source}]`);

	if (result.detail) {
		for (const line of result.detail.split(/\r?\n/u)) lines.push(`    ${line}`);
	}

	if (result.remediation?.length) {
		for (const step of result.remediation) {
			for (const line of step.split(/\r?\n/u)) lines.push(`    ${line}`);
		}
	}

	if (result.runbook) lines.push(`    Runbook: ${result.runbook}`);

	return lines.join('\n');
}

function defaultStreamFor(severity: OpsSeverity): PrintStream {
	return severity === 'warn' || severity === 'fail' ? process.stderr : process.stdout;
}

export function printOpsResult(result: OpsResult, options: PrintOpsOptions = {}): string {
	const output = renderOpsResult(result, options);
	(options.stream ?? defaultStreamFor(result.severity)).write(`${output}\n`);
	return output;
}

export function printOpsResults(
	results: readonly OpsResult[],
	options: PrintOpsOptions = {}
): string {
	const rendered = options.groupBySeverity
		? SEVERITY_ORDER.flatMap((severity) => {
				const group = results.filter((result) => result.severity === severity);
				if (group.length === 0) return [];
				return [
					SEVERITY_LABEL[severity],
					...group.map((result) => renderOpsResult(result, options)),
				];
			})
		: results.map((result) => renderOpsResult(result, options));

	const output = rendered.join('\n\n');
	(options.stream ?? defaultStreamFor(worstSeverity(results))).write(output ? `${output}\n` : '');
	return output;
}
