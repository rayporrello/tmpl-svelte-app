#!/usr/bin/env bun
import { evaluateFormsRegistry } from './lib/forms-check';

const result = evaluateFormsRegistry();

if (result.issues.length > 0) {
	for (const issue of result.issues) {
		const prefix = issue.formId ? `Form "${issue.formId}": ` : '';
		console.error(`✗ ${prefix}${issue.message}`);
	}
	console.error(`forms:check failed with ${result.issues.length} error(s).`);
	process.exit(1);
}

console.log(`Forms registry check passed (${result.formCount} form(s)).`);
