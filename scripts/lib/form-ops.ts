import type postgres from 'postgres';
import { getBusinessFormEntry } from '../../src/lib/server/forms/registry';

export type FormOpsCommand =
	| 'list'
	| 'inspect'
	| 'automation:pending'
	| 'dead-letters'
	| 'dead-letter:requeue';

export interface ParsedFormOpsArgs {
	command: FormOpsCommand | 'help';
	formId?: string;
	id?: string;
	limit: number;
	showPii: boolean;
	confirm: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/u;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readFlagValue(args: string[], index: number, flag: string): [string | undefined, number] {
	const current = args[index];
	const prefix = `${flag}=`;
	if (current.startsWith(prefix)) return [current.slice(prefix.length), index];
	if (current === flag) return [args[index + 1], index + 1];
	return [undefined, index];
}

function parseLimit(raw: string | undefined): number {
	if (!raw || !/^\d+$/u.test(raw)) throw new Error('--limit must be a positive integer.');
	const limit = Number(raw);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		throw new Error(`--limit must be between 1 and ${MAX_LIMIT}.`);
	}
	return limit;
}

function normalizeCommand(command: string | undefined): FormOpsCommand | 'help' {
	if (!command || command === '--help' || command === '-h' || command === 'help') return 'help';
	if (
		command === 'list' ||
		command === 'inspect' ||
		command === 'automation:pending' ||
		command === 'dead-letters' ||
		command === 'dead-letter:requeue'
	) {
		return command;
	}
	throw new Error(`Unknown forms:ops command: ${command}`);
}

export function parseFormOpsArgs(args: string[]): ParsedFormOpsArgs {
	const command = normalizeCommand(args[0]);
	const parsed: ParsedFormOpsArgs = {
		command,
		limit: DEFAULT_LIMIT,
		showPii: false,
		confirm: false,
	};
	if (command === 'help') return parsed;

	for (let index = 1; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === '--help' || arg === '-h') {
			parsed.command = 'help';
			continue;
		}
		if (arg === '--show-pii') {
			parsed.showPii = true;
			continue;
		}
		if (arg === '--confirm') {
			parsed.confirm = true;
			continue;
		}

		let value: string | undefined;
		[value, index] = readFlagValue(args, index, '--form');
		if (value !== undefined) {
			parsed.formId = value.trim();
			if (!parsed.formId) throw new Error('--form must not be empty.');
			continue;
		}

		[value, index] = readFlagValue(args, index, '--id');
		if (value !== undefined) {
			parsed.id = value.trim();
			if (!parsed.id) throw new Error('--id must not be empty.');
			continue;
		}

		[value, index] = readFlagValue(args, index, '--limit');
		if (value !== undefined) {
			parsed.limit = parseLimit(value);
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	if (parsed.command === 'list' && !parsed.formId) throw new Error('list requires --form.');
	if (parsed.command === 'inspect' && (!parsed.formId || !parsed.id)) {
		throw new Error('inspect requires --form and --id.');
	}
	if (parsed.command === 'dead-letter:requeue' && !parsed.id) {
		throw new Error('dead-letter:requeue requires --id.');
	}
	if (parsed.command === 'dead-letter:requeue' && !parsed.confirm) {
		throw new Error('dead-letter:requeue requires --confirm.');
	}

	return parsed;
}

export function usage(): string {
	return `Usage: bun run forms:ops -- <command> [options]

Commands:
  list --form=FORM [--limit=N] [--show-pii]
  inspect --form=FORM --id=UUID [--show-pii]
  automation:pending [--limit=N]
  dead-letters [--limit=N]
  dead-letter:requeue --id=UUID --confirm

PII is redacted by default. Pass --show-pii only when you intentionally need the raw submitted values.
`;
}

export function redactEmail(value: string): string {
	const [local = '', domain = ''] = value.split('@');
	if (!domain) return '[redacted]';
	const visible = local.slice(0, 1);
	return `${visible}${local.length > 1 ? '***' : '*'}@${domain}`;
}

function redactScalar(key: string, value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (key.toLowerCase().includes('email') && typeof value === 'string') return redactEmail(value);
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string') return '[redacted]';
	return '[redacted]';
}

export function redactRecord(
	record: Record<string, unknown>,
	piiFields: readonly string[],
	showPii: boolean
): Record<string, unknown> {
	const pii = new Set(piiFields);
	const output: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		output[key] = !showPii && pii.has(key) ? redactScalar(key, value) : value;
	}
	return output;
}

export function redactAutomationPayload(value: unknown, showPii: boolean): unknown {
	if (showPii || value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map((item) => redactAutomationPayload(item, showPii));
	if (typeof value !== 'object') return value;
	const output: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		if (/email|name|phone|message|body|text|user_agent/iu.test(key)) {
			output[key] = redactScalar(key, nested);
		} else {
			output[key] = redactAutomationPayload(nested, showPii);
		}
	}
	return output;
}

function assertSafeTableName(tableName: string): void {
	if (!SAFE_IDENTIFIER.test(tableName)) throw new Error(`Unsafe source table name: ${tableName}`);
}

function assertSafeId(id: string): void {
	if (!UUID_LIKE.test(id)) throw new Error(`Expected a UUID id, received: ${id}`);
}

export async function listFormSubmissions(
	sql: postgres.Sql,
	formId: string,
	options: { limit: number; showPii: boolean }
): Promise<Record<string, unknown>[]> {
	const form = getBusinessFormEntry(formId);
	assertSafeTableName(form.sourceTable);
	const rows = (await sql`
		select *
		from ${sql(form.sourceTable)}
		order by created_at desc
		limit ${options.limit}
	`) as Record<string, unknown>[];
	return rows.map((row) => redactRecord(row, form.piiFields, options.showPii));
}

export async function inspectFormSubmission(
	sql: postgres.Sql,
	formId: string,
	id: string,
	options: { showPii: boolean }
): Promise<Record<string, unknown> | null> {
	assertSafeId(id);
	const form = getBusinessFormEntry(formId);
	assertSafeTableName(form.sourceTable);
	const rows = (await sql`
		select *
		from ${sql(form.sourceTable)}
		where id = ${id}
		limit 1
	`) as Record<string, unknown>[];
	const row = rows[0];
	return row ? redactRecord(row, form.piiFields, options.showPii) : null;
}

export async function listPendingAutomationEvents(
	sql: postgres.Sql,
	limit: number
): Promise<Record<string, unknown>[]> {
	return (await sql`
		select id, created_at, event_type, status, attempt_count, max_attempts, next_attempt_at, last_error
		from automation_events
		where status in ('pending', 'processing')
		order by created_at asc
		limit ${limit}
	`) as Record<string, unknown>[];
}

export async function listDeadLetters(
	sql: postgres.Sql,
	limit: number
): Promise<Record<string, unknown>[]> {
	return (await sql`
		select id, created_at, event_id, event_type, error
		from automation_dead_letters
		order by created_at desc
		limit ${limit}
	`) as Record<string, unknown>[];
}

export async function requeueDeadLetter(
	sql: postgres.Sql,
	deadLetterId: string
): Promise<Record<string, unknown>> {
	assertSafeId(deadLetterId);
	const deadLetters = (await sql`
		select id, event_id, event_type
		from automation_dead_letters
		where id = ${deadLetterId}
		limit 1
	`) as Array<{ id: string; event_id: string | null; event_type: string }>;
	const deadLetter = deadLetters[0];
	if (!deadLetter) throw new Error(`Dead letter not found: ${deadLetterId}`);
	if (!deadLetter.event_id) {
		throw new Error(`Dead letter ${deadLetterId} has no source event_id to requeue.`);
	}

	const updated = (await sql`
		update automation_events
		set
			status = 'pending',
			attempt_count = 0,
			last_error = null,
			next_attempt_at = now(),
			locked_at = null,
			locked_by = null,
			updated_at = now()
		where id = ${deadLetter.event_id}
			and status = 'failed'
		returning id, event_type, status, next_attempt_at
	`) as Record<string, unknown>[];
	if (!updated[0]) {
		throw new Error(
			`Source event ${deadLetter.event_id} was not found or is not currently failed.`
		);
	}
	return updated[0];
}
