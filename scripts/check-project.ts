#!/usr/bin/env bun
/**
 * Validates site.project.json and generated-file drift.
 *
 * Run: bun run project:check
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateProjectManifest, SITE_PROJECT_PATH } from './lib/site-project';

export type CheckProjectResult = {
	exitCode: number;
	errors: string[];
	driftFiles: string[];
};

export function runCheckProject(rootDir = process.cwd()): CheckProjectResult {
	const result = evaluateProjectManifest(rootDir);
	return {
		exitCode: result.errors.length > 0 || result.updates.length > 0 ? 1 : 0,
		errors: result.errors,
		driftFiles: result.updates.map((update) => update.path),
	};
}

export function main(rootDir = process.cwd()): number {
	const result = runCheckProject(rootDir);

	if (result.errors.length > 0) {
		console.error(`Invalid ${SITE_PROJECT_PATH}:`);
		for (const error of result.errors) console.error(`  - ${error}`);
	}

	if (result.driftFiles.length > 0) {
		console.error(`${SITE_PROJECT_PATH} drift detected in generated project files:`);
		for (const file of result.driftFiles) console.error(`  - ${file}`);
		console.error('\nRun: bun run init:site -- --write');
	}

	if (result.exitCode === 0) {
		console.log(`Project manifest check passed (${SITE_PROJECT_PATH}).`);
	}

	return result.exitCode;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(main());
}
