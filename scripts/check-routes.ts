#!/usr/bin/env bun
/**
 * Ensures every concrete SvelteKit route has an explicit publication/security
 * policy: indexable, noindex, private, api, feed, health, or ignored.
 *
 * Run: bun run routes:check
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRoutePolicyCoverage } from './lib/route-scanner';

export function main(rootDir = process.cwd()): number {
	const result = evaluateRoutePolicyCoverage(rootDir);
	if (result.issues.length > 0) {
		console.error('Route policy coverage failed:');
		for (const issue of result.issues) {
			console.error(`  - ${issue.path} (${issue.kind}, ${issue.file}): ${issue.message}`);
		}
		console.error('\nAdd or fix entries in src/lib/seo/route-policy.ts.');
		return 1;
	}

	console.log(`Route policy check passed (${result.routes.length} routes covered).`);
	return 0;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(main());
}
