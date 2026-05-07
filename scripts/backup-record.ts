#!/usr/bin/env bun
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordBackup, type BackupSnapshot } from './lib/backup-state';
import { fail, pass, warn, type OpsResult } from './lib/ops-result';

type CliStatus = 'pass' | 'warn' | 'fail';

interface CliOptions {
	kind: BackupSnapshot['kind'];
	status: CliStatus;
	source: string;
	durationMs: number;
	summary?: string;
}

function usage(message: string): Error {
	return new Error(
		`${message}\nUsage: bun scripts/backup-record.ts --kind=base|legacy-all --status=pass|warn|fail --source=<label> [--duration-ms=N] [--summary=<text>]`
	);
}

function parseKind(value: string): BackupSnapshot['kind'] {
	const allowed: BackupSnapshot['kind'][] = [
		'base',
		'legacy-all',
		'database',
		'uploads',
		'push',
		'verify',
		'pitr-check',
	];
	if (allowed.includes(value as BackupSnapshot['kind'])) return value as BackupSnapshot['kind'];
	throw usage(`Unknown backup kind: ${value}`);
}

function parseStatus(value: string): CliStatus {
	if (value === 'pass' || value === 'warn' || value === 'fail') return value;
	throw usage(`Unknown backup status: ${value}`);
}

export function parseArgs(argv: readonly string[]): CliOptions {
	let kind: BackupSnapshot['kind'] | undefined;
	let status: CliStatus | undefined;
	let source: string | undefined;
	let durationMs = 0;
	let summary: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const readValue = (name: string): string => {
			if (arg === name) {
				const value = argv[index + 1];
				if (!value) throw usage(`${name} requires a value.`);
				index += 1;
				return value;
			}
			return arg.slice(`${name}=`.length);
		};

		if (arg === '--kind' || arg.startsWith('--kind=')) {
			kind = parseKind(readValue('--kind'));
		} else if (arg === '--status' || arg.startsWith('--status=')) {
			status = parseStatus(readValue('--status'));
		} else if (arg === '--source' || arg.startsWith('--source=')) {
			source = readValue('--source').trim();
		} else if (arg === '--duration-ms' || arg.startsWith('--duration-ms=')) {
			durationMs = Number(readValue('--duration-ms'));
		} else if (arg === '--summary' || arg.startsWith('--summary=')) {
			summary = readValue('--summary').trim();
		} else {
			throw usage(`Unknown backup-record option: ${arg}`);
		}
	}

	if (!kind) throw usage('--kind is required.');
	if (!status) throw usage('--status is required.');
	if (!source) throw usage('--source is required.');
	if (!Number.isFinite(durationMs) || durationMs < 0) throw usage('--duration-ms must be >= 0.');

	return { kind, status, source, durationMs, summary };
}

function resultFor(options: CliOptions): OpsResult {
	const id = `BACKUP-${options.kind.toUpperCase().replace(/[^A-Z0-9]+/gu, '-')}-001`;
	const summary =
		options.summary ??
		(options.status === 'pass'
			? `Backup ${options.kind} completed`
			: `Backup ${options.kind} ${options.status === 'warn' ? 'completed with warnings' : 'failed'}`);
	const detail = `source=${options.source}\nduration_ms=${options.durationMs}`;
	if (options.status === 'pass') return pass(id, summary, { detail });
	if (options.status === 'warn') return warn(id, summary, { detail });
	return fail(id, summary, { detail });
}

export function recordFromArgs(argv: readonly string[]): void {
	const options = parseArgs(argv);
	const finishedAt = new Date();
	const startedAt = new Date(finishedAt.getTime() - options.durationMs);
	recordBackup({
		results: [resultFor(options)],
		kind: options.kind,
		backupSource: options.source,
		startedAt,
		finishedAt,
	});
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	try {
		recordFromArgs(argv);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(await main());
}
