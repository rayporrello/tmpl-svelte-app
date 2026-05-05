#!/usr/bin/env bun
/**
 * Process pending automation outbox events.
 *
 * Run one batch (CI / manual replay):
 *   bun run automation:worker
 *
 * Run as long-lived daemon (per-site worker.container default):
 *   bun run automation:worker:daemon
 *   bun run automation:worker -- --daemon [--poll-interval-seconds=30]
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

export interface AutomationDaemonOptions {
	pollIntervalSeconds: number;
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

const DEFAULT_OPTIONS: AutomationWorkerOptions = {
	batchSize: 10,
	staleAfterSeconds: 15 * 60,
	workerId: `automation-worker-${randomUUID()}`,
};

const DEFAULT_DAEMON_OPTIONS: AutomationDaemonOptions = {
	pollIntervalSeconds: 30,
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

export type ParsedWorkerArgs = AutomationWorkerOptions &
	AutomationDaemonOptions & { help: boolean; daemon: boolean };

export function parseWorkerArgs(args: string[]): ParsedWorkerArgs {
	const options: ParsedWorkerArgs = {
		...DEFAULT_OPTIONS,
		...DEFAULT_DAEMON_OPTIONS,
		help: false,
		daemon: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === '--help' || arg === '-h') {
			options.help = true;
			continue;
		}

		if (arg === '--daemon') {
			options.daemon = true;
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

		[value, index] = readFlagValue(args, index, '--poll-interval-seconds');
		if (value !== undefined) {
			options.pollIntervalSeconds = parsePositiveInteger(value, '--poll-interval-seconds');
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

function usage(): string {
	return `Usage: bun run automation:worker -- [options]

Modes:
  (default)                  One-shot — claim a batch, deliver, exit.
  --daemon                   Long-lived poll loop — claim batches forever
                             until SIGTERM/SIGINT. Used by worker.container.

Options:
  --batch-size=N             Events to claim in one run (default: 10)
  --stale-after-seconds=N    Recover processing rows older than N seconds
                             (default: 900)
  --worker-id=ID             Lock owner label (default: generated UUID)
  --poll-interval-seconds=N  Daemon poll cadence (default: 30; ignored
                             unless --daemon is set)
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

/**
 * Long-lived poll loop. Runs `runAutomationWorker` every `pollIntervalSeconds`
 * until SIGTERM/SIGINT. Each batch's outcome is logged as one line so
 * journald / Podman log capture works without buffering surprises. Finishes
 * the in-flight batch on shutdown signal so we never abort a delivery
 * mid-flight.
 */
export async function runAutomationWorkerDaemon(
	sql: postgres.Sql,
	options: AutomationWorkerOptions & AutomationDaemonOptions,
	logger: Pick<Console, 'log' | 'error'> = console
): Promise<number> {
	let stopRequested = false;
	const onSignal = (signal: NodeJS.Signals): void => {
		if (stopRequested) return;
		stopRequested = true;
		logger.log(`automation:worker:daemon received ${signal}; finishing current batch and exiting.`);
	};
	process.on('SIGTERM', onSignal);
	process.on('SIGINT', onSignal);

	logger.log(
		`automation:worker:daemon start poll_interval_seconds=${options.pollIntervalSeconds} batch_size=${options.batchSize} worker_id=${options.workerId}`
	);

	const exitCode = 0;
	try {
		while (!stopRequested) {
			try {
				const result = await runAutomationWorker(sql, options);
				logger.log(
					`automation:worker:daemon claimed=${result.claimed} delivered=${result.delivered} skipped=${result.skipped} retried=${result.retried} dead_lettered=${result.deadLettered}`
				);
			} catch (error) {
				logger.error(
					`automation:worker:daemon batch failed: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
				// Don't exit — a single failed batch shouldn't kill the worker.
				// systemd / Podman would restart us anyway, but staying up means
				// transient DB blips don't cascade into worker restarts.
			}

			if (stopRequested) break;
			await sleep(options.pollIntervalSeconds * 1000, () => stopRequested);
		}
	} finally {
		process.off('SIGTERM', onSignal);
		process.off('SIGINT', onSignal);
		logger.log('automation:worker:daemon stopped cleanly.');
	}

	return exitCode;
}

function sleep(ms: number, abort: () => boolean): Promise<void> {
	return new Promise((resolve) => {
		const start = Date.now();
		const tick = (): void => {
			if (abort() || Date.now() - start >= ms) resolve();
			else setTimeout(tick, Math.min(500, ms));
		};
		tick();
	});
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
		if (options.daemon) {
			return await runAutomationWorkerDaemon(sql, options);
		}
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
