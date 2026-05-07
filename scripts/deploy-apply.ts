#!/usr/bin/env bun
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDeploy, planDeploy, type MigrationSafety } from './lib/deploy-engine';
import {
	fail,
	printOpsResults,
	severityToExitCode,
	worstSeverity,
	type OpsResult,
} from './lib/ops-result';

type CliOptions = {
	image?: string;
	sha?: string;
	safety?: MigrationSafety;
	dryRun: boolean;
	noColor: boolean;
};

const SAFETY_VALUES = new Set<MigrationSafety>(['rollback-safe', 'rollback-blocked']);

function parseArgs(argv: readonly string[]): CliOptions {
	const options: CliOptions = { dryRun: false, noColor: false };

	for (const arg of argv) {
		if (arg.startsWith('--image=')) {
			options.image = arg.slice('--image='.length);
		} else if (arg.startsWith('--sha=')) {
			options.sha = arg.slice('--sha='.length);
		} else if (arg.startsWith('--safety=')) {
			const value = arg.slice('--safety='.length);
			if (!SAFETY_VALUES.has(value as MigrationSafety)) {
				throw new Error('--safety must be rollback-safe or rollback-blocked.');
			}
			options.safety = value as MigrationSafety;
		} else if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--no-color') {
			options.noColor = true;
		} else {
			throw new Error(`Unknown deploy:apply option: ${arg}`);
		}
	}

	return options;
}

function missingFlagResults(options: CliOptions): OpsResult[] {
	const results: OpsResult[] = [];
	if (!options.image) {
		results.push(
			fail('DEPLOY-ARGS-001', 'Missing required --image flag', {
				remediation: ['NEXT: Pass --image=ghcr.io/owner/repo:sha-abc123.'],
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	}
	if (!options.sha) {
		results.push(
			fail('DEPLOY-ARGS-002', 'Missing required --sha flag', {
				remediation: ['NEXT: Pass --sha=<git sha> for the commit being deployed.'],
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	}
	if (!options.safety) {
		results.push(
			fail('DEPLOY-ARGS-003', 'Missing required --safety flag', {
				detail: 'Migration safety is operator-declared and has no default.',
				remediation: [
					'NEXT: Choose --safety=rollback-safe only when the previous image can run against the post-migration schema.',
					'NEXT: Choose --safety=rollback-blocked when rollback would require PITR or a roll-forward fix.',
				],
				runbook: 'docs/planning/adrs/ADR-028-deploy-apply-semantics.md',
			})
		);
	}
	return results;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	let options: CliOptions;
	try {
		options = parseArgs(argv);
	} catch (error) {
		const results = [
			fail('DEPLOY-ARGS-000', 'Invalid deploy:apply arguments', {
				detail: error instanceof Error ? error.message : String(error),
				runbook: 'docs/operations/deploy-apply.md',
			}),
		];
		printOpsResults(results, { noColor: true });
		return 1;
	}

	const missing = missingFlagResults(options);
	if (missing.length) {
		printOpsResults(missing, { noColor: options.noColor });
		return severityToExitCode(worstSeverity(missing));
	}

	const planned = await planDeploy({
		image: options.image!,
		sha: options.sha!,
		migrationSafety: options.safety!,
	});
	const results = [...planned.results];

	if (planned.plan) {
		results.push(...(await applyDeploy(planned.plan, { dryRun: options.dryRun })));
	}

	printOpsResults(results, { noColor: options.noColor });
	return severityToExitCode(worstSeverity(results));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
