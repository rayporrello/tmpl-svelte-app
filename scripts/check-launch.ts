#!/usr/bin/env bun
/**
 * Structural pre-launch validation. Release-grade check — runs in validate:launch,
 * not in validate (PR-grade). The launch-blockers manifest is the single source
 * of truth for LAUNCH-* checks.
 *
 * Run: bun run check:launch
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateLaunchBlockers, type LaunchBlockerEvaluation } from './lib/launch-blockers';

export type CheckLaunchOptions = {
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	stdout?: Pick<NodeJS.WriteStream, 'write'>;
	stderr?: Pick<NodeJS.WriteStream, 'write'>;
};

export type CheckLaunchResult = {
	results: LaunchBlockerEvaluation[];
	exitCode: number;
};

function statusIcon(status: LaunchBlockerEvaluation['status']): string {
	switch (status) {
		case 'pass':
			return '✓';
		case 'warn':
			return '⚠';
		case 'fail':
			return '✗';
	}
}

function renderGroup(
	label: string,
	results: readonly LaunchBlockerEvaluation[],
	lines: string[]
): void {
	lines.push(label);
	for (const result of results) {
		lines.push(`  ${statusIcon(result.status)} ${result.id} ${result.detail ?? result.label}`);
		if (result.status !== 'pass') lines.push(`      ${result.fixHint}`);
	}
	lines.push('');
}

export async function runCheckLaunch(options: CheckLaunchOptions = {}): Promise<CheckLaunchResult> {
	const results = await evaluateLaunchBlockers({
		rootDir: options.rootDir ?? process.cwd(),
		env: options.env ?? process.env,
		envSource: 'prod',
	});
	const requiredFailures = results.filter(
		(result) => result.severity === 'required' && result.status === 'fail'
	);

	return {
		results,
		exitCode: requiredFailures.length > 0 ? 1 : 0,
	};
}

export async function main(options: CheckLaunchOptions = {}): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const result = await runCheckLaunch(options);
	const required = result.results.filter((item) => item.severity === 'required');
	const recommended = result.results.filter((item) => item.severity === 'recommended');
	const lines: string[] = [];

	renderGroup('Required launch blockers', required, lines);
	renderGroup('Recommended launch checks', recommended, lines);

	const output = lines.join('\n');
	if (result.exitCode === 0) {
		stdout.write(output);
		stdout.write('✓ check:launch passed — no required launch blockers detected.\n');
		if (recommended.some((item) => item.status !== 'pass')) {
			stdout.write('  Recommended launch checks still have warnings.\n');
		}
	} else {
		stderr.write(output);
		stderr.write('check:launch failed — fix required LAUNCH-* blockers before launch.\n');
	}

	return result.exitCode;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
