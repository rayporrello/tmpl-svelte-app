#!/usr/bin/env bun
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	readHostLiveFacts,
	readLedgerFacts,
	summarize,
	type HealthFacts,
	type HostProbeRunner,
} from './lib/health-engine';
import {
	printOpsResults,
	severityToExitCode,
	worstSeverity,
	type OpsResult,
} from './lib/ops-result';
import type { PrintStream } from './lib/print';

export type HealthSourceFilter = 'all' | 'ledger' | 'live';

export interface HealthLiveCliOptions {
	noColor: boolean;
	json: boolean;
	events: number;
	source: HealthSourceFilter;
}

export interface RunHealthLiveOptions {
	argv?: readonly string[];
	stdout?: PrintStream;
	stderr?: PrintStream;
	hostRunner?: HostProbeRunner;
	probeTimeoutMs?: number;
}

export interface RunHealthLiveResult {
	results: OpsResult[];
	exitCode: number;
}

function usage(message: string): Error {
	return new Error(
		`${message}\nUsage: bun run health:live -- [--no-color] [--json] [--events=N] [--source=all|ledger|live]`
	);
}

export function parseArgs(argv: readonly string[]): HealthLiveCliOptions {
	const options: HealthLiveCliOptions = { noColor: false, json: false, events: 10, source: 'all' };

	for (const arg of argv) {
		if (arg === '--no-color') {
			options.noColor = true;
		} else if (arg === '--json') {
			options.json = true;
		} else if (arg.startsWith('--events=')) {
			const value = Number(arg.slice('--events='.length));
			if (!Number.isInteger(value) || value < 0)
				throw usage('--events must be a non-negative integer.');
			options.events = value;
		} else if (arg.startsWith('--source=')) {
			const value = arg.slice('--source='.length);
			if (value !== 'all' && value !== 'ledger' && value !== 'live') {
				throw usage('--source must be one of all, ledger, live.');
			}
			options.source = value;
		} else {
			throw usage(`Unknown health:live option: ${arg}`);
		}
	}

	return options;
}

export async function runHealthLive(
	options: RunHealthLiveOptions = {}
): Promise<RunHealthLiveResult> {
	const cli = parseArgs(options.argv ?? []);
	const results: OpsResult[] = [];
	const facts: HealthFacts = {
		currentRelease: null,
		previousRelease: null,
		backup: null,
		drill: null,
		recentEvents: [],
	};

	if (cli.source === 'all' || cli.source === 'ledger') {
		const ledger = readLedgerFacts({ eventsLimit: cli.events });
		Object.assign(facts, ledger.facts);
		results.push(...ledger.results);
	}

	if (cli.source === 'all' || cli.source === 'live') {
		const host = await readHostLiveFacts({
			runner: options.hostRunner,
			timeoutMs: options.probeTimeoutMs,
		});
		Object.assign(facts, host.facts);
		results.push(...host.results);
	}

	const outputResults = [...summarize(facts, results), ...results];
	return {
		results: outputResults,
		exitCode: severityToExitCode(worstSeverity(outputResults)),
	};
}

export async function main(options: RunHealthLiveOptions = {}): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const result = await runHealthLive(options);
		const cli = parseArgs(options.argv ?? []);
		if (cli.json) {
			stdout.write(`${JSON.stringify(result.results, null, 2)}\n`);
		} else {
			printOpsResults(result.results, {
				stream: worstSeverity(result.results) === 'fail' ? stderr : stdout,
				noColor: cli.noColor,
			});
		}
		return result.exitCode;
	} catch (error) {
		stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main({ argv: process.argv.slice(2) }));
}
