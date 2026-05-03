#!/usr/bin/env bun
import { automationEventHandlers } from '../src/lib/server/automation/registry';
import { businessFormRegistry } from '../src/lib/server/forms/registry';

let errors = 0;

function fail(message: string): void {
	console.error(`✗ ${message}`);
	errors += 1;
}

const seenIds = new Set<string>();
const seenRoutes = new Set<string>();
const knownEvents = new Set(Object.keys(automationEventHandlers));

for (const form of businessFormRegistry) {
	if (!/^[a-z][a-z0-9-]*$/u.test(form.id)) {
		fail(`Form id "${form.id}" must use kebab-case.`);
	}

	if (seenIds.has(form.id)) fail(`Duplicate form id "${form.id}".`);
	seenIds.add(form.id);

	if (!form.route.startsWith('/')) fail(`Form "${form.id}" route must start with "/".`);
	if (seenRoutes.has(form.route)) fail(`Duplicate form route "${form.route}".`);
	seenRoutes.add(form.route);

	if (!form.schemaPath.startsWith('src/lib/forms/')) {
		fail(`Form "${form.id}" schemaPath must live under src/lib/forms/.`);
	}

	if (!form.serverRoutePath.endsWith('+page.server.ts')) {
		fail(`Form "${form.id}" serverRoutePath must point to a +page.server.ts file.`);
	}

	if (!form.clientRoutePath.endsWith('+page.svelte')) {
		fail(`Form "${form.id}" clientRoutePath must point to a +page.svelte file.`);
	}

	if (!/^[a-z][a-z0-9_]*$/u.test(form.sourceTable)) {
		fail(`Form "${form.id}" sourceTable must be a snake_case table name.`);
	}

	if (form.outboxEvent !== null && !knownEvents.has(form.outboxEvent)) {
		fail(
			`Form "${form.id}" references outboxEvent "${form.outboxEvent}", but no automation handler is registered.`
		);
	}

	if (form.storesPii && form.piiFields.length === 0) {
		fail(`Form "${form.id}" stores PII but has no piiFields listed.`);
	}

	if (!form.retentionPolicy) fail(`Form "${form.id}" must name a retentionPolicy.`);
	if (form.inspection.length === 0) fail(`Form "${form.id}" needs at least one inspection hint.`);
}

if (errors > 0) {
	console.error(`forms:check failed with ${errors} error(s).`);
	process.exit(1);
}

console.log(`Forms registry check passed (${businessFormRegistry.length} form(s)).`);
