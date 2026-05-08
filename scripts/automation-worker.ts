#!/usr/bin/env bun
/**
 * Process pending automation outbox events.
 *
 * Run one batch (CI / manual replay):
 *   bun run automation:worker
 *
 * Production fleet delivery is owned by platform-infrastructure. This script
 * stays as a one-shot local-dev tool for a single website clone.
 */

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';
import {
	readAutomationProviderConfig,
	resolveAutomationProvider,
	validateAutomationProviderConfig,
} from '../src/lib/server/automation/providers';
import {
	getAutomationEventHandler,
	type AutomationOutboxRow,
} from '../src/lib/server/automation/registry';

export interface AutomationWorkerOptions {
	batchSize: number;
	staleAfterSeconds: number;
	workerId: string;
}

export interface AutomationWorkerResult {
	claimed: number;
	delivered: number;
	retried: number;
	deadLettered: number;
	skipped: number;
}

interface ClaimedEventRow extends AutomationOutboxRow {
	id: string;
	created_at: Date;
	event_type: string;
	payload: unknown;
	attempt_count: number;
	max_attempts: number;
	idempotency_key: string;
}

function leadCreatedSubmissionId(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as Record<string, unknown>;
	return typeof record.submission_id === 'string' && record.submission_id.length > 0
		? record.submission_id
		: null;
}

const DEFAULT_OPTIONS: AutomationWorkerOptions = {
	batchSize: 10,
	staleAfterSeconds: 15 * 60,
	workerId: `automation-worker-${randomUUID()}`,
};

export function nextBackoffSeconds(attemptCount: number): number {
	const baseSeconds = 60;
	const maxSeconds = 60 * 60;
	return Math.min(maxSeconds, baseSeconds * 2 ** Math.max(0, attemptCount));
}

function parsePositiveInteger(raw: string | undefined, flag: string): number {
	if (!raw || !/^\d+$/u.test(raw)) throw new Error(`${flag} must be a positive integer.`);
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`${flag} must be a positive integer.`);
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

export type ParsedWorkerArgs = AutomationWorkerOptions & { help: boolean };

export function parseWorkerArgs(args: string[]): ParsedWorkerArgs {
	const options: ParsedWorkerArgs = {
		...DEFAULT_OPTIONS,
		help: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === '--help' || arg === '-h') {
			options.help = true;
			continue;
		}

		let value: string | undefined;
		[value, index] = readFlagValue(args, index, '--batch-size');
		if (value !== undefined) {
			options.batchSize = parsePositiveInteger(value, '--batch-size');
			continue;
		}

		[value, index] = readFlagValue(args, index, '--stale-after-seconds');
		if (value !== undefined) {
			options.staleAfterSeconds = parsePositiveInteger(value, '--stale-after-seconds');
			continue;
		}

		[value, index] = readFlagValue(args, index, '--worker-id');
		if (value !== undefined) {
			options.workerId = value.trim();
			if (!options.workerId) throw new Error('--worker-id must not be empty.');
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

function usage(): string {
	return `Usage: bun run automation:worker -- [options]

Options:
  --batch-size=N             Events to claim in one run (default: 10)
  --stale-after-seconds=N    Recover processing rows older than N seconds
                             (default: 900)
  --worker-id=ID             Lock owner label (default: generated UUID)
  --help                     Show this help
`;
}

async function recoverStaleProcessing(
	sql: postgres.Sql,
	staleAfterSeconds: number
): Promise<number> {
	const rows = await sql`
		with recovered as (
			update automation_events
			set
				status = 'pending',
				locked_at = null,
				locked_by = null,
				next_attempt_at = now(),
				updated_at = now()
			where status = 'processing'
				and locked_at < now() - (${staleAfterSeconds} * interval '1 second')
			returning 1
		)
		select count(*)::int as count from recovered
	`;
	return Number(rows[0]?.count ?? 0);
}

async function claimEvents(
	sql: postgres.Sql,
	options: AutomationWorkerOptions
): Promise<ClaimedEventRow[]> {
	return (await sql`
		with candidates as (
			select id
			from automation_events
			where status = 'pending'
				and next_attempt_at <= now()
				and attempt_count < max_attempts
			order by created_at asc
			for update skip locked
			limit ${options.batchSize}
		)
		update automation_events
		set
			status = 'processing',
			locked_at = now(),
			locked_by = ${options.workerId},
			updated_at = now()
		where id in (select id from candidates)
		returning id, created_at, event_type, payload, attempt_count, max_attempts, idempotency_key
	`) as ClaimedEventRow[];
}

async function markCompleted(
	sql: postgres.Sql,
	eventId: string,
	attemptCount: number
): Promise<void> {
	await sql`
		update automation_events
		set
			status = 'completed',
			attempt_count = ${attemptCount + 1},
			last_error = null,
			locked_at = null,
			locked_by = null,
			updated_at = now()
		where id = ${eventId}
	`;
}

async function markSmokeSkipped(
	sql: postgres.Sql,
	eventId: string,
	attemptCount: number
): Promise<void> {
	const metadata = {
		automation_skipped: true,
		automation_skip_reason: 'smoke_test',
		automation_skipped_at: new Date().toISOString(),
	};
	await sql`
		update automation_events
		set
			status = 'completed',
			attempt_count = ${attemptCount + 1},
			payload = payload || ${JSON.stringify(metadata)}::jsonb,
			last_error = null,
			locked_at = null,
			locked_by = null,
			updated_at = now()
		where id = ${eventId}
	`;
}

async function isSmokeLeadCreated(sql: postgres.Sql, row: ClaimedEventRow): Promise<boolean> {
	if (row.event_type !== 'lead.created') return false;
	const submissionId = leadCreatedSubmissionId(row.payload);
	if (!submissionId) return false;
	const rows = await sql`
		select is_smoke_test
		from contact_submissions
		where id = ${submissionId}
		limit 1
	`;
	return rows[0]?.is_smoke_test === true;
}

async function markFailedOrRetry(
	sql: postgres.Sql,
	row: ClaimedEventRow,
	error: string
): Promise<'retry' | 'dead-letter'> {
	const nextAttemptCount = row.attempt_count + 1;
	const exhausted = nextAttemptCount >= row.max_attempts;

	if (exhausted) {
		await sql.begin(async (tx) => {
			await tx`
				update automation_events
				set
					status = 'failed',
					attempt_count = ${nextAttemptCount},
					last_error = ${error},
					locked_at = null,
					locked_by = null,
					updated_at = now()
				where id = ${row.id}
			`;
			await tx`
				insert into automation_dead_letters (event_id, event_type, error)
				values (${row.id}, ${row.event_type}, ${error})
			`;
		});
		return 'dead-letter';
	}

	const backoffSeconds = nextBackoffSeconds(row.attempt_count);
	await sql`
		update automation_events
		set
			status = 'pending',
			attempt_count = ${nextAttemptCount},
			last_error = ${error},
			next_attempt_at = now() + (${backoffSeconds} * interval '1 second'),
			locked_at = null,
			locked_by = null,
			updated_at = now()
		where id = ${row.id}
	`;
	return 'retry';
}

async function deliverEvent(
	sql: postgres.Sql,
	row: ClaimedEventRow
): Promise<'delivered' | 'retry' | 'dead-letter' | 'skipped'> {
	if (await isSmokeLeadCreated(sql, row)) {
		await markSmokeSkipped(sql, row.id, row.attempt_count);
		return 'skipped';
	}

	const handler = getAutomationEventHandler(row.event_type);
	if (!handler) {
		return await markFailedOrRetry(
			sql,
			row,
			`Unsupported automation event type: ${row.event_type}`
		);
	}

	const built = await handler.buildEvent(sql, row);
	if (!built.ok) return await markFailedOrRetry(sql, row, built.error);

	const provider = resolveAutomationProvider();
	const result = await provider.send(built.event);

	if (result.ok) {
		await markCompleted(sql, row.id, row.attempt_count);
		return result.delivered ? 'delivered' : 'skipped';
	}

	return await markFailedOrRetry(sql, row, result.error);
}

/**
 * Surface a single, loud warning when the resolved provider cannot deliver.
 * The worker keeps running so the outbox is not blocked, but the operator sees
 * the misconfiguration in journald instead of silently skipped events.
 */
export function warnIfAutomationConfigIncomplete(
	env: NodeJS.ProcessEnv = process.env,
	logger: Pick<Console, 'warn' | 'info'> = console
): void {
	const config = readAutomationProviderConfig(env);
	const problems = validateAutomationProviderConfig(config, { allowConsoleProvider: true });

	if (problems.length > 0) {
		logger.warn(
			`[automation:worker] provider="${config.provider}" is misconfigured — events will be skipped or fail. ` +
				`Fix: ${problems.map((p) => p.message).join(' ')}`
		);
		return;
	}

	if (config.provider === 'noop') {
		logger.info(
			'[automation:worker] provider="noop" — events are marked delivered without sending.'
		);
	} else if (config.provider === 'console') {
		logger.info(
			'[automation:worker] provider="console" — events are logged, not delivered. Use noop to silence in production.'
		);
	}
}

export async function runAutomationWorker(
	sql: postgres.Sql,
	options: AutomationWorkerOptions = DEFAULT_OPTIONS
): Promise<AutomationWorkerResult> {
	await recoverStaleProcessing(sql, options.staleAfterSeconds);
	const rows = await claimEvents(sql, options);
	const result: AutomationWorkerResult = {
		claimed: rows.length,
		delivered: 0,
		retried: 0,
		deadLettered: 0,
		skipped: 0,
	};

	for (const row of rows) {
		const outcome = await deliverEvent(sql, row);
		if (outcome === 'delivered') result.delivered += 1;
		else if (outcome === 'retry') result.retried += 1;
		else if (outcome === 'dead-letter') result.deadLettered += 1;
		else result.skipped += 1;
	}

	return result;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
	const options = parseWorkerArgs(argv);
	if (options.help) {
		console.log(usage());
		return 0;
	}

	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
	warnIfAutomationConfigIncomplete();
	const sql = postgres(process.env.DATABASE_URL, { max: 2 });
	try {
		const result = await runAutomationWorker(sql, options);
		console.log(
			`automation:worker claimed ${result.claimed}; delivered ${result.delivered}; skipped ${result.skipped}; retried ${result.retried}; dead-lettered ${result.deadLettered}`
		);
		return 0;
	} finally {
		await sql.end();
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	main()
		.then((code) => process.exit(code))
		.catch((error) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}
