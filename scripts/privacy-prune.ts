/**
 * Prune expired runtime records containing or linking to personal data.
 *
 * Dry-run is the default. Pass --apply to delete matching rows.
 *
 * Run:
 *   bun run privacy:prune
 *   bun run privacy:prune -- --apply
 */
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { businessFormRegistry } from '../src/lib/server/forms/registry';
import { RETENTION_DEFAULTS_DAYS } from '../src/lib/server/privacy/retention';

export const DEFAULT_RETENTION_DAYS = RETENTION_DEFAULTS_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

interface PruneConfig {
	apply: boolean;
	contactDays: number;
	automationCompletedDays: number;
	automationFailedDays: number;
	deadLetterDays: number;
	includeStalePendingDays?: number;
	help: boolean;
}

interface PruneResult {
	label: string;
	days: number;
	cutoff: Date;
	matched: number;
	deleted: number;
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/u;

function usage(): string {
	return `Usage: bun run privacy:prune -- [options]

Dry-run is the default. Pass --apply to delete matching rows.

Options:
  --apply                         Delete matching rows
  --contact-days=N                contact_submissions retention (default: ${DEFAULT_RETENTION_DAYS.contactSubmissions})
  --automation-completed-days=N   completed automation_events retention (default: ${DEFAULT_RETENTION_DAYS.automationEventsCompleted})
  --automation-failed-days=N      failed automation_events retention (default: ${DEFAULT_RETENTION_DAYS.automationEventsFailed})
  --dead-letter-days=N            automation_dead_letters retention (default: ${DEFAULT_RETENTION_DAYS.automationDeadLetters})
  --include-stale-pending-days=N  Also prune pending/processing automation_events older than N days
  --help                          Show this help
`;
}

function parsePositiveDays(raw: string | undefined, flag: string): number {
	if (!raw || !/^\d+$/.test(raw)) {
		throw new Error(`${flag} must be a positive integer day count.`);
	}
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`${flag} must be a positive integer day count.`);
	}
	return value;
}

function readFlagValue(args: string[], index: number, flag: string): [string | undefined, number] {
	const current = args[index];
	const prefix = `${flag}=`;
	if (current.startsWith(prefix)) return [current.slice(prefix.length), index];
	if (current === flag) return [args[index + 1], index + 1];
	return [undefined, index];
}

export function parsePruneArgs(args: string[]): PruneConfig {
	const config: PruneConfig = {
		apply: false,
		contactDays: DEFAULT_RETENTION_DAYS.contactSubmissions,
		automationCompletedDays: DEFAULT_RETENTION_DAYS.automationEventsCompleted,
		automationFailedDays: DEFAULT_RETENTION_DAYS.automationEventsFailed,
		deadLetterDays: DEFAULT_RETENTION_DAYS.automationDeadLetters,
		help: false,
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === '--apply') {
			config.apply = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			config.help = true;
			continue;
		}

		let value: string | undefined;
		[value, i] = readFlagValue(args, i, '--contact-days');
		if (value !== undefined) {
			config.contactDays = parsePositiveDays(value, '--contact-days');
			continue;
		}

		[value, i] = readFlagValue(args, i, '--automation-completed-days');
		if (value !== undefined) {
			config.automationCompletedDays = parsePositiveDays(value, '--automation-completed-days');
			continue;
		}

		[value, i] = readFlagValue(args, i, '--automation-failed-days');
		if (value !== undefined) {
			config.automationFailedDays = parsePositiveDays(value, '--automation-failed-days');
			continue;
		}

		[value, i] = readFlagValue(args, i, '--dead-letter-days');
		if (value !== undefined) {
			config.deadLetterDays = parsePositiveDays(value, '--dead-letter-days');
			continue;
		}

		[value, i] = readFlagValue(args, i, '--include-stale-pending-days');
		if (value !== undefined) {
			config.includeStalePendingDays = parsePositiveDays(value, '--include-stale-pending-days');
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return config;
}

function cutoffForDays(days: number): Date {
	return new Date(Date.now() - days * DAY_MS);
}

function asCount(rows: Array<Record<string, unknown>>): number {
	return Number(rows[0]?.count ?? 0);
}

async function countContactSubmissions(sql: postgres.Sql, cutoff: Date): Promise<number> {
	return await countSourceTableRows(sql, 'contact_submissions', cutoff);
}

async function deleteContactSubmissions(sql: postgres.Sql, cutoff: Date): Promise<number> {
	return await deleteSourceTableRows(sql, 'contact_submissions', cutoff);
}

function assertSafeIdentifier(identifier: string): void {
	if (!SAFE_IDENTIFIER.test(identifier)) {
		throw new Error(`Unsafe database identifier in form registry: ${identifier}`);
	}
}

async function countSourceTableRows(
	sql: postgres.Sql,
	tableName: string,
	cutoff: Date
): Promise<number> {
	assertSafeIdentifier(tableName);
	const rows = await sql`
		select count(*)::int as count
		from ${sql(tableName)}
		where created_at < ${cutoff}
	`;
	return asCount(rows);
}

async function deleteSourceTableRows(
	sql: postgres.Sql,
	tableName: string,
	cutoff: Date
): Promise<number> {
	assertSafeIdentifier(tableName);
	const rows = await sql`
		with deleted as (
			delete from ${sql(tableName)}
			where created_at < ${cutoff}
			returning 1
		)
		select count(*)::int as count from deleted
	`;
	return asCount(rows);
}

async function countAutomationEvents(
	sql: postgres.Sql,
	statuses: string[],
	cutoff: Date
): Promise<number> {
	const rows = await sql`
		select count(*)::int as count
		from automation_events
		where status in ${sql(statuses)}
			and created_at < ${cutoff}
	`;
	return asCount(rows);
}

async function deleteAutomationEvents(
	sql: postgres.Sql,
	statuses: string[],
	cutoff: Date
): Promise<number> {
	const rows = await sql`
		with deleted as (
			delete from automation_events
			where status in ${sql(statuses)}
				and created_at < ${cutoff}
			returning 1
		)
		select count(*)::int as count from deleted
	`;
	return asCount(rows);
}

async function countDeadLetters(sql: postgres.Sql, cutoff: Date): Promise<number> {
	const rows = await sql`
		select count(*)::int as count
		from automation_dead_letters
		where created_at < ${cutoff}
	`;
	return asCount(rows);
}

async function deleteDeadLetters(sql: postgres.Sql, cutoff: Date): Promise<number> {
	const rows = await sql`
		with deleted as (
			delete from automation_dead_letters
			where created_at < ${cutoff}
			returning 1
		)
		select count(*)::int as count from deleted
	`;
	return asCount(rows);
}

async function collectResult(
	label: string,
	days: number,
	apply: boolean,
	countRows: (cutoff: Date) => Promise<number>,
	deleteRows: (cutoff: Date) => Promise<number>
): Promise<PruneResult> {
	const cutoff = cutoffForDays(days);
	const matched = await countRows(cutoff);
	const deleted = apply ? await deleteRows(cutoff) : 0;
	return { label, days, cutoff, matched, deleted };
}

function printResults(config: PruneConfig, results: PruneResult[]): void {
	const mode = config.apply ? 'apply' : 'dry run';
	console.log(`Privacy prune (${mode})`);
	console.log('Retention defaults source: src/lib/server/privacy/retention.ts');
	console.log('');
	console.log('Cutoffs:');
	for (const result of results) {
		console.log(
			`  ${result.label}: ${result.days} days; older than ${result.cutoff.toISOString()}`
		);
	}
	if (config.includeStalePendingDays === undefined) {
		console.log('  automation_events pending/processing: excluded');
	}
	console.log('');
	console.log(config.apply ? 'Matched / deleted rows:' : 'Matching rows (no deletes in dry-run):');
	for (const result of results) {
		const deleted = config.apply ? `; deleted ${result.deleted}` : '';
		console.log(`  ${result.label}: matched ${result.matched}${deleted}`);
	}
	if (!config.apply) {
		console.log('');
		console.log('Pass --apply to delete matching rows.');
	}
}

export async function runPrune(config: PruneConfig): Promise<PruneResult[]> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

	const sql = postgres(databaseUrl, { max: 1 });
	try {
		const results: PruneResult[] = [];

		for (const form of businessFormRegistry) {
			const days = form.id === 'contact' ? config.contactDays : form.retentionDays;
			results.push(
				await collectResult(
					`${form.sourceTable} (${form.id})`,
					days,
					config.apply,
					(cutoff) =>
						form.id === 'contact'
							? countContactSubmissions(sql, cutoff)
							: countSourceTableRows(sql, form.sourceTable, cutoff),
					(cutoff) =>
						form.id === 'contact'
							? deleteContactSubmissions(sql, cutoff)
							: deleteSourceTableRows(sql, form.sourceTable, cutoff)
				)
			);
		}
		results.push(
			await collectResult(
				'automation_events completed',
				config.automationCompletedDays,
				config.apply,
				(cutoff) => countAutomationEvents(sql, ['completed'], cutoff),
				(cutoff) => deleteAutomationEvents(sql, ['completed'], cutoff)
			)
		);
		results.push(
			await collectResult(
				'automation_events failed',
				config.automationFailedDays,
				config.apply,
				(cutoff) => countAutomationEvents(sql, ['failed'], cutoff),
				(cutoff) => deleteAutomationEvents(sql, ['failed'], cutoff)
			)
		);
		results.push(
			await collectResult(
				'automation_dead_letters',
				config.deadLetterDays,
				config.apply,
				(cutoff) => countDeadLetters(sql, cutoff),
				(cutoff) => deleteDeadLetters(sql, cutoff)
			)
		);

		if (config.includeStalePendingDays !== undefined) {
			results.push(
				await collectResult(
					'automation_events pending/processing',
					config.includeStalePendingDays,
					config.apply,
					(cutoff) => countAutomationEvents(sql, ['pending', 'processing'], cutoff),
					(cutoff) => deleteAutomationEvents(sql, ['pending', 'processing'], cutoff)
				)
			);
		}

		return results;
	} finally {
		await sql.end();
	}
}

export async function main(args = process.argv.slice(2)): Promise<void> {
	const config = parsePruneArgs(args);
	if (config.help) {
		console.log(usage());
		return;
	}

	const results = await runPrune(config);
	printResults(config, results);
}

const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (isMain) {
	main().catch((err) => {
		console.error(`privacy:prune failed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
}
