import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getTableName } from 'drizzle-orm';
import * as dbSchema from '../../src/lib/server/db/schema';
import { automationEventHandlers } from '../../src/lib/server/automation/registry';
import {
	businessFormRegistry,
	type BusinessFormRegistryEntry,
} from '../../src/lib/server/forms/registry';
import { RETENTION_DEFAULTS_DAYS } from '../../src/lib/server/privacy/retention';
import { routePolicyEntries, type RoutePolicyEntry } from '../../src/lib/seo/route-policy';
import { routes } from '../../src/lib/seo/routes';

export interface FormsCheckIssue {
	formId?: string;
	message: string;
}

export interface FormsCheckResult {
	formCount: number;
	issues: FormsCheckIssue[];
}

function issue(message: string, formId?: string): FormsCheckIssue {
	return { formId, message };
}

function existingTableNames(): Set<string> {
	const names = new Set<string>();
	for (const value of Object.values(dbSchema)) {
		try {
			names.add(getTableName(value as never));
		} catch {
			// Non-table exports are ignored.
		}
	}
	return names;
}

function entryMatches(entry: RoutePolicyEntry, path: string): boolean {
	if (entry.path.endsWith('/*')) {
		const prefix = entry.path.slice(0, -2);
		return path === prefix || path.startsWith(`${prefix}/`);
	}
	return entry.path === path;
}

function policyForPath(path: string): RoutePolicyEntry | null {
	const entries = routePolicyEntries();
	const exact = entries.find((entry) => !entry.path.endsWith('/*') && entry.path === path);
	if (exact) return exact;
	return entries.find((entry) => entryMatches(entry, path)) ?? null;
}

function tableHasCreatedAt(rootDir: string, tableName: string): boolean {
	const schemaPath = join(rootDir, 'src/lib/server/db/schema.ts');
	if (!existsSync(schemaPath)) return false;
	const schemaText = readFileSync(schemaPath, 'utf8');
	const tableStart = schemaText.indexOf(`'${tableName}'`);
	if (tableStart === -1) return false;
	const nextTable = schemaText.indexOf('pgTable(', tableStart + tableName.length);
	const tableText =
		nextTable === -1 ? schemaText.slice(tableStart) : schemaText.slice(tableStart, nextTable);
	return /createdAt:\s*timestamp\('created_at'/u.test(tableText);
}

export function evaluateFormsRegistry(rootDir = process.cwd()): FormsCheckResult {
	const root = resolve(rootDir);
	const issues: FormsCheckIssue[] = [];
	const seenIds = new Set<string>();
	const seenRoutes = new Set<string>();
	const knownEvents = new Set(Object.keys(automationEventHandlers));
	const knownTables = existingTableNames();
	const retentionPolicies = new Set(Object.keys(RETENTION_DEFAULTS_DAYS));
	const forms: readonly BusinessFormRegistryEntry[] = businessFormRegistry;

	for (const form of forms) {
		if (!/^[a-z][a-z0-9-]*$/u.test(form.id)) {
			issues.push(issue(`Form id "${form.id}" must use kebab-case.`, form.id));
		}

		if (seenIds.has(form.id)) issues.push(issue(`Duplicate form id "${form.id}".`, form.id));
		seenIds.add(form.id);

		if (!form.label.trim()) issues.push(issue('Form label must not be empty.', form.id));
		if (!form.description.trim() && !form.docsPath.trim()) {
			issues.push(issue('Form needs a description or docsPath.', form.id));
		}

		if (!form.route.startsWith('/')) {
			issues.push(issue(`Form route "${form.route}" must start with "/".`, form.id));
		}
		if (seenRoutes.has(form.route)) {
			issues.push(issue(`Duplicate form route "${form.route}".`, form.id));
		}
		seenRoutes.add(form.route);

		for (const pathField of ['schemaPath', 'serverRoutePath', 'clientRoutePath'] as const) {
			if (!existsSync(join(root, form[pathField]))) {
				issues.push(issue(`${pathField} does not exist: ${form[pathField]}`, form.id));
			}
		}

		if (!form.schemaPath.startsWith('src/lib/forms/')) {
			issues.push(issue('schemaPath must live under src/lib/forms/.', form.id));
		}

		if (!form.serverRoutePath.endsWith('+page.server.ts')) {
			issues.push(issue('serverRoutePath must point to a +page.server.ts file.', form.id));
		}

		if (!form.clientRoutePath.endsWith('+page.svelte')) {
			issues.push(issue('clientRoutePath must point to a +page.svelte file.', form.id));
		}

		if (!/^[a-z][a-z0-9_]*$/u.test(form.sourceTable)) {
			issues.push(issue(`sourceTable "${form.sourceTable}" must be snake_case.`, form.id));
		} else {
			if (!knownTables.has(form.sourceTable)) {
				issues.push(
					issue(`sourceTable "${form.sourceTable}" is not exported from schema.ts.`, form.id)
				);
			}
			if (!tableHasCreatedAt(root, form.sourceTable)) {
				issues.push(issue(`sourceTable "${form.sourceTable}" must include created_at.`, form.id));
			}
		}

		if (form.outboxEvent !== null && !knownEvents.has(form.outboxEvent)) {
			issues.push(
				issue(`outboxEvent "${form.outboxEvent}" has no automation handler registered.`, form.id)
			);
		}

		if (!['none', 'contact', 'sensitive'].includes(form.piiClassification)) {
			issues.push(issue(`Unknown PII classification "${form.piiClassification}".`, form.id));
		}
		if (form.storesPii && form.piiFields.length === 0) {
			issues.push(issue('storesPii is true but piiFields is empty.', form.id));
		}
		if (form.storesPii && form.piiClassification === 'none') {
			issues.push(issue('storesPii is true but piiClassification is none.', form.id));
		}

		if (!retentionPolicies.has(form.retentionPolicy)) {
			issues.push(issue(`Unknown retentionPolicy "${form.retentionPolicy}".`, form.id));
		}
		if (!Number.isSafeInteger(form.retentionDays) || form.retentionDays < 1) {
			issues.push(issue('retentionDays must be a positive integer.', form.id));
		}

		if (form.docsPath && !existsSync(join(root, form.docsPath))) {
			issues.push(issue(`docsPath does not exist: ${form.docsPath}`, form.id));
		}

		if (form.inspection.length === 0) {
			issues.push(issue('Form needs at least one operator inspection command.', form.id));
		}
		if (!form.inspection.some((command) => command.includes('forms:ops'))) {
			issues.push(issue('Form inspection commands should use forms:ops.', form.id));
		}

		const policy = policyForPath(form.route);
		if (!policy) {
			issues.push(issue(`No route policy entry covers ${form.route}.`, form.id));
		} else if (policy.policy === 'indexable') {
			const route = routes.find((entry) => entry.path === form.route);
			if (!route || route.indexable !== true) {
				issues.push(issue(`Indexable form route ${form.route} must be in routes.ts.`, form.id));
			}
		}
	}

	const contact = forms.find((form) => form.id === 'contact');
	if (!contact) {
		issues.push(issue('Contact form must remain registered as the canonical example.'));
	} else {
		if (contact.route !== '/contact')
			issues.push(issue('Contact route must remain /contact.', 'contact'));
		if (contact.sourceTable !== 'contact_submissions') {
			issues.push(issue('Contact source table must remain contact_submissions.', 'contact'));
		}
		if (contact.outboxEvent !== 'lead.created') {
			issues.push(issue('Contact outbox event must remain lead.created.', 'contact'));
		}
	}

	return { formCount: forms.length, issues };
}
