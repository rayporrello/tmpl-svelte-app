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

const RESTORE_DRILL_CHANNEL = 'restore-drill';
const RESTORE_DRILL_STALE_AFTER_SECONDS = 7 * 24 * 60 * 60;

export interface RestoreDrillSnapshot {
	/** ISO 8601. */
	attemptedAt: string;
	/** ISO 8601 if the drill passed; null otherwise. */
	succeededAt: string | null;
	/** Worst severity across all step results. */
	status: 'pass' | 'warn' | 'fail' | 'unknown';
	/** PITR target time the drill exercised. */
	targetTime: string;
	durationMs: number;
	/** Source backup window or file used for the drill. */
	backupSource: string;
	/** Per-step evidence; OpsResult shape. */
	steps: OpsResult[];
}

type RestoreDrillChannelSnapshot = OpsChannelSnapshot<RestoreDrillSnapshot>;

function readProjectSlug(): string {
	try {
		const manifest = JSON.parse(
			readFileSync(resolve(process.cwd(), 'site.project.json'), 'utf8')
		) as {
			project?: { projectSlug?: unknown };
		};
		if (typeof manifest.project?.projectSlug === 'string') return manifest.project.projectSlug;
	} catch {
		// Restore-drill state remains useful in tests and ad-hoc temp projects.
	}
	return 'project';
}

function channelStatus(severity: OpsSeverity): RestoreDrillSnapshot['status'] {
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

export function recordDrill(opts: {
	results: OpsResult[];
	targetTime: string;
	backupSource: string;
	startedAt: Date;
	finishedAt: Date;
}): void {
	const finishedAt = opts.finishedAt.toISOString();
	const severity = worstSeverity(opts.results);
	const status = channelStatus(severity);
	const prior = readChannel<RestoreDrillChannelSnapshot>(RESTORE_DRILL_CHANNEL);
	const succeededAt = status === 'pass' ? finishedAt : (prior?.last_success_at ?? null);
	const steps = opts.results.map(redactResult);
	const snapshot: RestoreDrillSnapshot = {
		attemptedAt: finishedAt,
		succeededAt,
		status,
		targetTime: redactSecrets(opts.targetTime),
		durationMs: Math.max(0, opts.finishedAt.getTime() - opts.startedAt.getTime()),
		backupSource: redactSecrets(opts.backupSource),
		steps,
	};

	writeChannel<RestoreDrillChannelSnapshot>(RESTORE_DRILL_CHANNEL, {
		project: readProjectSlug(),
		last_attempt_at: finishedAt,
		last_success_at: succeededAt ?? undefined,
		status,
		stale_after_seconds: RESTORE_DRILL_STALE_AFTER_SECONDS,
		detail: snapshot,
	});

	appendEvent({
		channel: RESTORE_DRILL_CHANNEL,
		type: 'restore-drill',
		occurred_at: finishedAt,
		status,
		duration_ms: snapshot.durationMs,
		target_time: snapshot.targetTime,
		steps: steps.map((step) => ({
			id: step.id,
			severity: step.severity,
			summary: step.summary,
		})),
	});
}

export function readLastDrill(): RestoreDrillSnapshot | null {
	try {
		const snapshot = readChannel<RestoreDrillChannelSnapshot>(RESTORE_DRILL_CHANNEL);
		if (!snapshot?.detail) return null;
		return snapshot.detail;
	} catch {
		return null;
	}
}

export function isDrillStale(now?: Date): boolean {
	try {
		return isStale(RESTORE_DRILL_CHANNEL, now);
	} catch {
		return true;
	}
}
