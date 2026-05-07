import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	appendEvent,
	isStale,
	readChannel,
	writeChannel,
	type OpsChannelSnapshot,
} from './ops-status';
import { worstSeverity, type OpsResult, type OpsSeverity } from './ops-result';
import { redactSecrets } from './run';

const BACKUP_CHANNEL = 'backup';
const BACKUP_STALE_AFTER_SECONDS = 36 * 60 * 60;

export interface BackupSnapshot {
	attemptedAt: string;
	succeededAt: string | null;
	status: 'pass' | 'warn' | 'fail' | 'unknown';
	kind: 'base' | 'legacy-all' | 'database' | 'uploads' | 'push' | 'verify' | 'pitr-check';
	durationMs: number;
	backupSource: string;
	steps: OpsResult[];
}

type BackupChannelSnapshot = OpsChannelSnapshot<BackupSnapshot>;

function readProjectSlug(): string {
	try {
		const manifest = JSON.parse(
			readFileSync(resolve(process.cwd(), 'site.project.json'), 'utf8')
		) as {
			project?: { projectSlug?: unknown };
		};
		if (typeof manifest.project?.projectSlug === 'string') return manifest.project.projectSlug;
	} catch {
		// Backup state remains useful in tests and ad-hoc temp projects.
	}
	return 'project';
}

function channelStatus(severity: OpsSeverity): BackupSnapshot['status'] {
	if (severity === 'fail') return 'fail';
	if (severity === 'warn') return 'warn';
	if (severity === 'pass' || severity === 'info') return 'pass';
	return 'unknown';
}

function redactResult(result: OpsResult): OpsResult {
	return {
		...result,
		summary: redactSecrets(result.summary),
		detail: result.detail ? redactSecrets(result.detail) : undefined,
		remediation: result.remediation?.map((step) => redactSecrets(step)),
	};
}

export function recordBackup(opts: {
	results: OpsResult[];
	kind: BackupSnapshot['kind'];
	backupSource: string;
	startedAt: Date;
	finishedAt: Date;
}): void {
	const finishedAt = opts.finishedAt.toISOString();
	const severity = worstSeverity(opts.results);
	const status = channelStatus(severity);
	const prior = readChannel<BackupChannelSnapshot>(BACKUP_CHANNEL);
	const succeededAt = status === 'pass' ? finishedAt : (prior?.last_success_at ?? null);
	const steps = opts.results.map(redactResult);
	const snapshot: BackupSnapshot = {
		attemptedAt: finishedAt,
		succeededAt,
		status,
		kind: opts.kind,
		durationMs: Math.max(0, opts.finishedAt.getTime() - opts.startedAt.getTime()),
		backupSource: redactSecrets(opts.backupSource),
		steps,
	};

	writeChannel<BackupChannelSnapshot>(BACKUP_CHANNEL, {
		project: readProjectSlug(),
		last_attempt_at: finishedAt,
		last_success_at: succeededAt ?? undefined,
		status,
		stale_after_seconds: BACKUP_STALE_AFTER_SECONDS,
		detail: snapshot,
	});

	appendEvent({
		channel: BACKUP_CHANNEL,
		type: 'backup',
		occurred_at: finishedAt,
		status,
		kind: opts.kind,
		duration_ms: snapshot.durationMs,
		backup_source: snapshot.backupSource,
		steps: steps.map((step) => ({
			id: step.id,
			severity: step.severity,
			summary: step.summary,
		})),
	});
}

export function readLastBackup(): BackupSnapshot | null {
	try {
		const snapshot = readChannel<BackupChannelSnapshot>(BACKUP_CHANNEL);
		if (!snapshot?.detail) return null;
		return snapshot.detail;
	} catch {
		return null;
	}
}

export function isBackupStale(now?: Date): boolean {
	try {
		return isStale(BACKUP_CHANNEL, now);
	} catch {
		return true;
	}
}
