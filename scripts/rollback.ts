#!/usr/bin/env bun
import {
	printOpsResults,
	severityToExitCode,
	worstSeverity,
	type OpsResult,
} from './lib/ops-result';
import { applyRollback, describeRollbackStatus, planRollback } from './lib/rollback-engine';

interface RollbackCliOptions {
	status: boolean;
	to?: 'previous';
	dryRun: boolean;
	noColor: boolean;
}

function usage(): string {
	return [
		'Usage:',
		'  bun run rollback --status',
		'  bun run rollback --to previous --dry-run',
		'  bun run rollback --to previous',
	].join('\n');
}

function parseArgs(argv: readonly string[]): RollbackCliOptions {
	const options: RollbackCliOptions = { status: false, dryRun: false, noColor: false };

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--status') {
			options.status = true;
		} else if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--no-color') {
			options.noColor = true;
		} else if (arg === '--to') {
			const value = argv[index + 1];
			if (value !== 'previous') throw new Error(`Unknown rollback target: ${value ?? '<missing>'}`);
			options.to = value;
			index += 1;
		} else if (arg.startsWith('--to=')) {
			const value = arg.slice('--to='.length);
			if (value !== 'previous') throw new Error(`Unknown rollback target: ${value}`);
			options.to = value;
		} else {
			throw new Error(`Unknown rollback option: ${arg}`);
		}
	}

	if (options.status && (options.to || options.dryRun)) {
		throw new Error('--status cannot be combined with --to or --dry-run.');
	}
	if (!options.status && options.to !== 'previous') {
		throw new Error('Rollback requires --status or --to previous.');
	}

	return options;
}

function errorResult(error: unknown): OpsResult {
	return {
		id: 'ROLLBACK-CLI-001',
		severity: 'fail',
		summary: 'Rollback command failed',
		detail: error instanceof Error ? error.message : String(error),
		remediation: [usage()],
		runbook: 'docs/operations/rollback.md',
	};
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
	let results: OpsResult[];
	let forceExitZero = false;

	try {
		const options = parseArgs(argv);
		if (options.status) {
			results = describeRollbackStatus();
			forceExitZero = true;
		} else {
			const planned = planRollback();
			results = [...planned.results];
			if (planned.plan) results.push(...applyRollback(planned.plan, { dryRun: options.dryRun }));
		}

		printOpsResults(results, { noColor: options.noColor });
		if (forceExitZero) return 0;
		return severityToExitCode(worstSeverity(results));
	} catch (error) {
		results = [errorResult(error)];
		printOpsResults(results);
		return 1;
	}
}

if (import.meta.main) {
	process.exitCode = main();
}
