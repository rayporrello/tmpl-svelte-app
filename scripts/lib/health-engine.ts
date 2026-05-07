import { existsSync, readFileSync } from 'node:fs';
import { basename, join, parse } from 'node:path';
import tls from 'node:tls';

import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import {
	automationDeadLetters,
	automationEvents,
	contactSubmissions,
} from '../../src/lib/server/db/schema';
import { fail, info, pass, warn, worstSeverity, type OpsResult } from './ops-result';
import { readChannel, resolveStateDir, type OpsChannelSnapshot } from './ops-status';
import { ALL_QUADLETS } from './quadlets';
import { isBackupStale, readLastBackup, type BackupSnapshot } from './backup-state';
import { getCurrentRelease, getPreviousRollbackSafeRelease, type Release } from './release-state';
import { isDrillStale, readLastDrill, type RestoreDrillSnapshot } from './restore-drill-state';

export type HealthSource = 'ledger' | 'live-host' | 'live-db';

export interface HealthFacts {
	currentRelease: Release | null;
	previousRelease: Release | null;
	backup: BackupSnapshot | null;
	drill: RestoreDrillSnapshot | null;
	recentEvents: Array<{ kind: string; at: string; summary: string }>;
	systemdUnits?: Array<{ unit: string; active: boolean; sub: string; description?: string }>;
	diskFree?: { mountPoint: string; bytesAvailable: number; bytesTotal: number };
	certExpiry?: Array<{ domain: string; expiresAt: string; daysRemaining: number }>;
	outboxDepth?: number;
	outboxDeadLetters?: number;
	smokeBacklog?: number;
}

export interface HostProbeRunner {
	systemctlIsActive(unit: string): Promise<{ active: boolean; sub: string }>;
	diskFree(mountPoint: string): Promise<{ bytesAvailable: number; bytesTotal: number }>;
	certExpiry(domain: string): Promise<{ expiresAt: string }>;
}

export interface DbHandle {
	countOutboxPending(): Promise<number>;
	countOutboxDeadLetters(): Promise<number>;
	countSmokeBacklog(): Promise<number>;
}

type HealthResultOptions = Omit<OpsResult, 'id' | 'severity' | 'summary' | 'source'>;

type EventRecord = Record<string, unknown>;

const PROBE_TIMEOUT_MS = 5_000;
const DISK_WARN_FREE_RATIO = 0.15;
const CERT_WARN_DAYS = 14;
const OUTBOX_WARN_DEPTH = 25;
const SMOKE_BACKLOG_WARN = 80;
const SMOKE_RETENTION_HOURS = 24;
const EVENTS_FILE = 'events.ndjson';
const EVENT_ROTATIONS = 2;

function withSource(result: OpsResult, source: HealthSource): OpsResult {
	return { ...result, source };
}

function healthPass(
	source: HealthSource,
	id: string,
	summary: string,
	opts: HealthResultOptions = {}
): OpsResult {
	return withSource(pass(id, summary, opts), source);
}

function healthInfo(
	source: HealthSource,
	id: string,
	summary: string,
	opts: HealthResultOptions = {}
): OpsResult {
	return withSource(info(id, summary, opts), source);
}

function healthWarn(
	source: HealthSource,
	id: string,
	summary: string,
	opts: HealthResultOptions = {}
): OpsResult {
	return withSource(warn(id, summary, opts), source);
}

function healthFail(
	source: HealthSource,
	id: string,
	summary: string,
	opts: HealthResultOptions = {}
): OpsResult {
	return withSource(fail(id, summary, opts), source);
}

function unitNameFor(quadletFilename: string): string {
	return `${parse(basename(quadletFilename)).name}.service`;
}

function streamToText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	return stream ? new Response(stream).text() : Promise.resolve('');
}

async function spawnText(
	cmd: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const bun = (
		globalThis as typeof globalThis & {
			Bun?: {
				spawn(
					command: string[],
					options?: object
				): {
					stdout: ReadableStream<Uint8Array> | null;
					stderr: ReadableStream<Uint8Array> | null;
					exited: Promise<number>;
				};
			};
		}
	).Bun;
	if (!bun) throw new Error('Bun runtime is required for host live probes.');

	const proc = bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		streamToText(proc.stdout),
		streamToText(proc.stderr),
	]);
	return { exitCode, stdout, stderr };
}

function createHostProbeRunner(): HostProbeRunner {
	return {
		async systemctlIsActive(unit: string) {
			const result = await spawnText(['systemctl', '--user', 'is-active', unit]);
			const sub = result.stdout.trim() || result.stderr.trim() || `exit ${result.exitCode}`;
			return { active: result.exitCode === 0 && sub === 'active', sub };
		},
		async diskFree(mountPoint: string) {
			const result = await spawnText(['df', '-kP', mountPoint]);
			if (result.exitCode !== 0) {
				throw new Error(result.stderr.trim() || result.stdout.trim() || 'df failed');
			}
			const [, row] = result.stdout.trim().split(/\r?\n/u);
			const columns = row?.trim().split(/\s+/u) ?? [];
			const totalKb = Number(columns[1]);
			const availableKb = Number(columns[3]);
			if (!Number.isFinite(totalKb) || !Number.isFinite(availableKb)) {
				throw new Error(`Could not parse df output for ${mountPoint}.`);
			}
			return {
				bytesAvailable: availableKb * 1024,
				bytesTotal: totalKb * 1024,
			};
		},
		async certExpiry(domain: string) {
			return await new Promise<{ expiresAt: string }>((resolve, reject) => {
				const socket = tls.connect(
					{ host: domain, port: 443, servername: domain, timeout: PROBE_TIMEOUT_MS },
					() => {
						const cert = socket.getPeerCertificate();
						socket.end();
						if (!cert.valid_to) {
							reject(new Error(`No certificate expiry returned for ${domain}.`));
							return;
						}
						resolve({ expiresAt: new Date(cert.valid_to).toISOString() });
					}
				);
				socket.on('timeout', () => {
					socket.destroy();
					reject(new Error('TLS probe timed out.'));
				});
				socket.on('error', reject);
			});
		},
	};
}

function createDbHandle(): DbHandle {
	return {
		async countOutboxPending() {
			const { db } = await import('../../src/lib/server/db');
			const [row] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(automationEvents)
				.where(inArray(automationEvents.status, ['pending', 'processing', 'failed']));
			return Number((row as { count?: unknown } | undefined)?.count ?? 0);
		},
		async countOutboxDeadLetters() {
			const { db } = await import('../../src/lib/server/db');
			const [row] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(automationDeadLetters);
			return Number((row as { count?: unknown } | undefined)?.count ?? 0);
		},
		async countSmokeBacklog() {
			const { db } = await import('../../src/lib/server/db');
			const cutoff = new Date(Date.now() - SMOKE_RETENTION_HOURS * 60 * 60 * 1000);
			const [row] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(contactSubmissions)
				.where(
					and(eq(contactSubmissions.isSmokeTest, true), lt(contactSubmissions.createdAt, cutoff))
				);
			return Number((row as { count?: unknown } | undefined)?.count ?? 0);
		},
	};
}

function parseEventDate(event: EventRecord): string {
	for (const key of ['occurred_at', 'timestamp', 'at', 'deployedAt']) {
		const value = event[key];
		if (typeof value === 'string' && value.trim()) return value;
	}
	return 'unknown';
}

function eventSummary(event: EventRecord): string {
	const type = typeof event.type === 'string' ? event.type : 'event';
	if (type === 'release.recorded' && event.release && typeof event.release === 'object') {
		const release = event.release as { id?: unknown; sha?: unknown };
		return `release ${String(release.id ?? release.sha ?? 'unknown')} recorded`;
	}
	if (type === 'restore-drill') {
		return `restore drill ${String(event.status ?? 'unknown')}`;
	}
	if (type === 'backup') {
		return `backup ${String(event.kind ?? 'unknown')} ${String(event.status ?? 'unknown')}`;
	}
	if (type === 'deploy.smoke') {
		return `deploy smoke ${String(event.smoke_status ?? 'unknown')}`;
	}
	return type;
}

function readEventFile(path: string): EventRecord[] {
	if (!existsSync(path)) return [];
	const lines = readFileSync(path, 'utf8')
		.split(/\r?\n/u)
		.filter((line) => line.trim().length > 0);

	return lines
		.flatMap((line) => {
			try {
				const parsed = JSON.parse(line) as unknown;
				return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
					? [parsed as EventRecord]
					: [];
			} catch {
				return [];
			}
		})
		.reverse();
}

function readRecentEvents(limit: number): Array<{ kind: string; at: string; summary: string }> {
	const stateDir = resolveStateDir();
	const files = [
		join(stateDir, EVENTS_FILE),
		...Array.from({ length: EVENT_ROTATIONS }, (_, index) =>
			join(stateDir, `${EVENTS_FILE}.${index + 1}`)
		),
	];
	const events: Array<{ kind: string; at: string; summary: string }> = [];
	for (const file of files) {
		for (const event of readEventFile(file)) {
			events.push({
				kind: typeof event.channel === 'string' ? event.channel : 'unknown',
				at: parseEventDate(event),
				summary: eventSummary(event),
			});
			if (events.length >= limit) return events;
		}
	}
	return events;
}

function releaseChannelExists(): boolean {
	return readChannel<OpsChannelSnapshot>('releases') !== null;
}

function drillDetail(drill: RestoreDrillSnapshot): string {
	return [
		`attempted_at=${drill.attemptedAt}`,
		`succeeded_at=${drill.succeededAt ?? 'never'}`,
		`target_time=${drill.targetTime}`,
		`duration_ms=${drill.durationMs}`,
	].join('\n');
}

function backupDetail(backup: BackupSnapshot): string {
	return [
		`attempted_at=${backup.attemptedAt}`,
		`succeeded_at=${backup.succeededAt ?? 'never'}`,
		`kind=${backup.kind}`,
		`source=${backup.backupSource}`,
		`duration_ms=${backup.durationMs}`,
	].join('\n');
}

function sourceTimeoutResult(source: HealthSource, id: string, label: string): OpsResult {
	return healthWarn(source, id, `${label} timed out`, {
		detail: 'probe timed out after 5s',
		remediation: ['NEXT: Inspect host or database load, then re-run bun run health:live.'],
		runbook: 'docs/operations/health.md',
	});
}

async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	onTimeout: () => OpsResult
): Promise<{ ok: true; value: T } | { ok: false; result: OpsResult }> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<{ ok: false; result: OpsResult }>((resolve) => {
		timeout = setTimeout(() => resolve({ ok: false, result: onTimeout() }), ms);
	});
	const wrapped = promise.then(
		(value) => ({ ok: true as const, value }),
		(error) => {
			throw error;
		}
	);
	try {
		return await Promise.race([wrapped, timeoutPromise]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function certDomainFromEnv(): string | null {
	const raw = process.env.PUBLIC_SITE_URL?.trim() || process.env.ORIGIN?.trim();
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		return parsed.protocol === 'https:' && parsed.hostname ? parsed.hostname : null;
	} catch {
		return null;
	}
}

function daysRemaining(expiresAt: string): number {
	return Math.floor((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function readLedgerFacts(opts: { eventsLimit?: number } = {}): {
	facts: Pick<
		HealthFacts,
		'currentRelease' | 'previousRelease' | 'backup' | 'drill' | 'recentEvents'
	>;
	results: OpsResult[];
} {
	const eventsLimit = opts.eventsLimit ?? 10;
	let currentRelease: Release | null = null;
	let previousRelease: Release | null = null;
	let backup: BackupSnapshot | null = null;
	let drill: RestoreDrillSnapshot | null = null;
	let recentEvents: HealthFacts['recentEvents'] = [];
	let releasesPresent = false;
	const results: OpsResult[] = [];

	try {
		currentRelease = getCurrentRelease();
		previousRelease = getPreviousRollbackSafeRelease();
		releasesPresent = releaseChannelExists();
		backup = readLastBackup();
		drill = readLastDrill();
		recentEvents = readRecentEvents(eventsLimit);
	} catch (error) {
		const ledgerError = error instanceof Error ? error.message : String(error);
		results.push(
			healthWarn('ledger', 'HEALTH-LEDGER-001', 'Ops-status ledger could not be read', {
				detail: ledgerError,
				remediation: ['NEXT: Confirm OPS_STATE_DIR is writable by the operator user.'],
				runbook: 'docs/operations/ops-status-ledger.md',
			})
		);
	}

	if (currentRelease) {
		results.push(
			healthPass('ledger', 'HEALTH-RELEASE-001', 'Current release is recorded', {
				detail: `id=${currentRelease.id}\nsha=${currentRelease.sha}\ndeployed_at=${currentRelease.deployedAt}\nimage=${currentRelease.image}`,
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	} else if (releasesPresent) {
		results.push(
			healthWarn('ledger', 'HEALTH-RELEASE-001', 'Release ledger has no current release', {
				remediation: ['NEXT: Run bun run deploy:apply after the first production deploy.'],
				runbook: 'docs/operations/deploy-apply.md',
			})
		);
	} else {
		results.push(
			healthWarn('ledger', 'HEALTH-RELEASE-001', 'Release ledger channel is missing', {
				detail: 'releases.json was not found in the ops-status ledger.',
				remediation: ['NEXT: Run a successful deploy to record the first release.'],
				runbook: 'docs/operations/ops-status-ledger.md',
			})
		);
	}

	if (previousRelease) {
		results.push(
			healthPass('ledger', 'HEALTH-RELEASE-002', 'Rollback-safe previous release exists', {
				detail: `id=${previousRelease.id}\nsha=${previousRelease.sha}\ndeployed_at=${previousRelease.deployedAt}`,
				runbook: 'docs/operations/rollback.md',
			})
		);
	} else {
		results.push(
			healthInfo('ledger', 'HEALTH-RELEASE-002', 'No rollback-safe previous release recorded', {
				remediation: [
					'NEXT: This is expected before the second rollback-safe deploy; use restore docs if rollback is unavailable.',
				],
				runbook: 'docs/operations/restore.md',
			})
		);
	}

	if (!backup) {
		results.push(
			healthWarn('ledger', 'HEALTH-BACKUP-001', 'Backup has never run', {
				detail: 'backup.json was not found in the ops-status ledger.',
				remediation: ['NEXT: Run bun run backup:base or bun run backup:all.'],
				runbook: 'docs/operations/backups.md',
			})
		);
	} else if (backup.status === 'fail') {
		results.push(
			healthFail('ledger', 'HEALTH-BACKUP-001', 'Last backup failed', {
				detail: backupDetail(backup),
				remediation: ['NEXT: Inspect the backup job logs and rerun the backup after fixing it.'],
				runbook: 'docs/operations/backups.md',
			})
		);
	} else if (backup.status === 'warn' || backup.status === 'unknown') {
		results.push(
			healthWarn('ledger', 'HEALTH-BACKUP-001', 'Last backup completed with warnings', {
				detail: backupDetail(backup),
				remediation: ['NEXT: Inspect backup.json and the backup job output before relying on it.'],
				runbook: 'docs/operations/backups.md',
			})
		);
	} else if (isBackupStale()) {
		results.push(
			healthWarn('ledger', 'HEALTH-BACKUP-001', 'Last backup is stale', {
				detail: backupDetail(backup),
				remediation: ['NEXT: Run bun run backup:base or confirm the backup timer is enabled.'],
				runbook: 'docs/operations/backups.md',
			})
		);
	} else {
		results.push(
			healthPass('ledger', 'HEALTH-BACKUP-001', 'Last backup is fresh', {
				detail: backupDetail(backup),
				runbook: 'docs/operations/backups.md',
			})
		);
	}

	if (!drill) {
		results.push(
			healthWarn('ledger', 'HEALTH-DRILL-001', 'Restore drill has never run', {
				detail: 'restore-drill.json was not found in the ops-status ledger.',
				remediation: ['NEXT: Run bun run backup:restore:drill.'],
				runbook: 'docs/operations/restore-drill.md',
			})
		);
	} else if (drill.status === 'fail') {
		results.push(
			healthFail('ledger', 'HEALTH-DRILL-001', 'Last restore drill failed', {
				detail: drillDetail(drill),
				remediation: ['NEXT: Inspect the drill step evidence and rerun the drill after fixing it.'],
				runbook: 'docs/operations/restore-drill.md',
			})
		);
	} else if (isDrillStale()) {
		results.push(
			healthWarn('ledger', 'HEALTH-DRILL-001', 'Last restore drill is stale', {
				detail: drillDetail(drill),
				remediation: ['NEXT: Run bun run backup:restore:drill.'],
				runbook: 'docs/operations/restore-drill.md',
			})
		);
	} else {
		results.push(
			healthPass('ledger', 'HEALTH-DRILL-001', 'Last restore drill is fresh', {
				detail: drillDetail(drill),
				runbook: 'docs/operations/restore-drill.md',
			})
		);
	}

	if (recentEvents.length > 0) {
		results.push(
			healthPass('ledger', 'HEALTH-EVENTS-001', 'Recent ledger events are readable', {
				detail: recentEvents
					.map((event) => `${event.at} ${event.kind}: ${event.summary}`)
					.join('\n'),
				runbook: 'docs/operations/ops-status-ledger.md',
			})
		);
	} else {
		results.push(
			healthInfo('ledger', 'HEALTH-EVENTS-001', 'No recent ledger events recorded', {
				detail: 'events.ndjson is empty or missing.',
				runbook: 'docs/operations/ops-status-ledger.md',
			})
		);
	}

	return { facts: { currentRelease, previousRelease, backup, drill, recentEvents }, results };
}

export async function readHostLiveFacts(
	opts: { runner?: HostProbeRunner; timeoutMs?: number } = {}
): Promise<{
	facts: Pick<HealthFacts, 'systemdUnits' | 'diskFree' | 'certExpiry'>;
	results: OpsResult[];
}> {
	const runner = opts.runner ?? createHostProbeRunner();
	const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
	const results: OpsResult[] = [];
	const systemdUnits: NonNullable<HealthFacts['systemdUnits']> = [];
	const certExpiry: NonNullable<HealthFacts['certExpiry']> = [];
	let diskFree: HealthFacts['diskFree'];

	for (const unit of ALL_QUADLETS.map(unitNameFor)) {
		try {
			const probed = await withTimeout(runner.systemctlIsActive(unit), timeoutMs, () =>
				sourceTimeoutResult('live-host', `HEALTH-HOST-UNIT-${unit}`, `Unit ${unit}`)
			);
			if (!probed.ok) {
				results.push(probed.result);
				continue;
			}
			systemdUnits.push({ unit, active: probed.value.active, sub: probed.value.sub });
			results.push(
				probed.value.active
					? healthPass('live-host', `HEALTH-HOST-UNIT-${unit}`, `Unit ${unit} is active`, {
							detail: `sub=${probed.value.sub}`,
						})
					: healthFail('live-host', `HEALTH-HOST-UNIT-${unit}`, `Unit ${unit} is not active`, {
							detail: `sub=${probed.value.sub}`,
							remediation: [
								`systemctl --user status ${unit}`,
								`journalctl --user -u ${unit} -n 100`,
							],
							runbook: 'docs/deployment/runbook.md',
						})
			);
		} catch (error) {
			results.push(
				healthFail('live-host', `HEALTH-HOST-UNIT-${unit}`, `Unit ${unit} probe failed`, {
					detail: error instanceof Error ? error.message : String(error),
					remediation: [`systemctl --user status ${unit}`],
					runbook: 'docs/deployment/runbook.md',
				})
			);
		}
	}

	try {
		const probed = await withTimeout(runner.diskFree('/'), timeoutMs, () =>
			sourceTimeoutResult('live-host', 'HEALTH-HOST-DISK-001', 'Disk free probe')
		);
		if (!probed.ok) {
			results.push(probed.result);
		} else {
			diskFree = { mountPoint: '/', ...probed.value };
			const ratio = probed.value.bytesTotal
				? probed.value.bytesAvailable / probed.value.bytesTotal
				: 0;
			const detail = `mount=/\navailable_bytes=${probed.value.bytesAvailable}\ntotal_bytes=${probed.value.bytesTotal}`;
			results.push(
				ratio < DISK_WARN_FREE_RATIO
					? healthWarn('live-host', 'HEALTH-HOST-DISK-001', 'Disk free space is low', {
							detail,
							remediation: [
								'NEXT: Free disk space or expand the volume before backups/deploys fail.',
							],
							runbook: 'docs/operations/backups.md',
						})
					: healthPass('live-host', 'HEALTH-HOST-DISK-001', 'Disk free space is healthy', {
							detail,
						})
			);
		}
	} catch (error) {
		results.push(
			healthWarn('live-host', 'HEALTH-HOST-DISK-001', 'Disk free probe failed', {
				detail: error instanceof Error ? error.message : String(error),
				remediation: ['df -h /'],
				runbook: 'docs/deployment/runbook.md',
			})
		);
	}

	const domain = certDomainFromEnv();
	if (!domain) {
		results.push(
			healthInfo('live-host', 'HEALTH-HOST-CERT-001', 'Certificate probe skipped', {
				detail: 'PUBLIC_SITE_URL or ORIGIN is missing or not HTTPS.',
				runbook: 'docs/deployment/runbook.md',
			})
		);
	} else {
		try {
			const probed = await withTimeout(runner.certExpiry(domain), timeoutMs, () =>
				sourceTimeoutResult('live-host', 'HEALTH-HOST-CERT-001', `Certificate for ${domain}`)
			);
			if (!probed.ok) {
				results.push(probed.result);
			} else {
				const remaining = daysRemaining(probed.value.expiresAt);
				certExpiry.push({ domain, expiresAt: probed.value.expiresAt, daysRemaining: remaining });
				const detail = `domain=${domain}\nexpires_at=${probed.value.expiresAt}\ndays_remaining=${remaining}`;
				if (remaining < 0) {
					results.push(
						healthFail(
							'live-host',
							'HEALTH-HOST-CERT-001',
							`Certificate for ${domain} is expired`,
							{
								detail,
								remediation: ['NEXT: Inspect Caddy ACME logs and DNS for the site domain.'],
								runbook: 'docs/deployment/runbook.md',
							}
						)
					);
				} else if (remaining <= CERT_WARN_DAYS) {
					results.push(
						healthWarn(
							'live-host',
							'HEALTH-HOST-CERT-001',
							`Certificate for ${domain} expires soon`,
							{
								detail,
								remediation: ['NEXT: Confirm Caddy can complete ACME renewal for this domain.'],
								runbook: 'docs/deployment/runbook.md',
							}
						)
					);
				} else {
					results.push(
						healthPass('live-host', 'HEALTH-HOST-CERT-001', `Certificate for ${domain} is fresh`, {
							detail,
						})
					);
				}
			}
		} catch (error) {
			results.push(
				healthWarn('live-host', 'HEALTH-HOST-CERT-001', `Certificate probe for ${domain} failed`, {
					detail: error instanceof Error ? error.message : String(error),
					remediation: ['NEXT: Confirm Caddy has issued a certificate for the production domain.'],
					runbook: 'docs/deployment/runbook.md',
				})
			);
		}
	}

	return { facts: { systemdUnits, diskFree, certExpiry }, results };
}

export async function readDbLiveFacts(opts: { db?: DbHandle; timeoutMs?: number } = {}): Promise<{
	facts: Pick<HealthFacts, 'outboxDepth' | 'outboxDeadLetters' | 'smokeBacklog'>;
	results: OpsResult[];
}> {
	const db = opts.db ?? createDbHandle();
	const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
	const results: OpsResult[] = [];
	let outboxDepth: number | undefined;
	let outboxDeadLetters: number | undefined;
	let smokeBacklog: number | undefined;

	try {
		const probed = await withTimeout(db.countOutboxPending(), timeoutMs, () =>
			sourceTimeoutResult('live-db', 'HEALTH-DB-OUTBOX-001', 'Outbox depth probe')
		);
		if (!probed.ok) {
			results.push(probed.result);
		} else {
			outboxDepth = probed.value;
			results.push(
				outboxDepth > OUTBOX_WARN_DEPTH
					? healthWarn('live-db', 'HEALTH-DB-OUTBOX-001', 'Automation outbox depth is high', {
							detail: `pending_or_processing=${outboxDepth}`,
							remediation: ['NEXT: Run or inspect bun run automation:worker.'],
							runbook: 'docs/automations/README.md',
						})
					: healthPass('live-db', 'HEALTH-DB-OUTBOX-001', 'Automation outbox depth is normal', {
							detail: `pending_or_processing=${outboxDepth}`,
						})
			);
		}
	} catch (error) {
		results.push(
			healthFail('live-db', 'HEALTH-DB-OUTBOX-001', 'Outbox depth probe failed', {
				detail: error instanceof Error ? error.message : String(error),
				runbook: 'docs/database/README.md',
			})
		);
	}

	try {
		const probed = await withTimeout(db.countOutboxDeadLetters(), timeoutMs, () =>
			sourceTimeoutResult('live-db', 'HEALTH-DB-DEAD-001', 'Dead-letter probe')
		);
		if (!probed.ok) {
			results.push(probed.result);
		} else {
			outboxDeadLetters = probed.value;
			results.push(
				outboxDeadLetters > 0
					? healthWarn('live-db', 'HEALTH-DB-DEAD-001', 'Automation dead letters are present', {
							detail: `dead_letters=${outboxDeadLetters}`,
							remediation: [
								'NEXT: Inspect automation_dead_letters and retry or repair the receiver.',
							],
							runbook: 'docs/automations/README.md',
						})
					: healthPass('live-db', 'HEALTH-DB-DEAD-001', 'No automation dead letters', {
							detail: 'dead_letters=0',
						})
			);
		}
	} catch (error) {
		results.push(
			healthFail('live-db', 'HEALTH-DB-DEAD-001', 'Dead-letter probe failed', {
				detail: error instanceof Error ? error.message : String(error),
				runbook: 'docs/database/README.md',
			})
		);
	}

	try {
		const probed = await withTimeout(db.countSmokeBacklog(), timeoutMs, () =>
			sourceTimeoutResult('live-db', 'HEALTH-DB-SMOKE-001', 'Smoke backlog probe')
		);
		if (!probed.ok) {
			results.push(probed.result);
		} else {
			smokeBacklog = probed.value;
			results.push(
				smokeBacklog >= SMOKE_BACKLOG_WARN
					? healthWarn(
							'live-db',
							'HEALTH-DB-SMOKE-001',
							'Smoke backlog is approaching fail-closed threshold',
							{
								detail: `old_smoke_rows=${smokeBacklog}\nwarn_threshold=${SMOKE_BACKLOG_WARN}\nfail_closed_threshold=100`,
								remediation: ['bun run privacy:prune -- --apply'],
								runbook: 'docs/operations/smoke.md',
							}
						)
					: healthPass('live-db', 'HEALTH-DB-SMOKE-001', 'Smoke backlog is below alarm threshold', {
							detail: `old_smoke_rows=${smokeBacklog}`,
						})
			);
		}
	} catch (error) {
		results.push(
			healthFail('live-db', 'HEALTH-DB-SMOKE-001', 'Smoke backlog probe failed', {
				detail: error instanceof Error ? error.message : String(error),
				runbook: 'docs/operations/smoke.md',
			})
		);
	}

	return { facts: { outboxDepth, outboxDeadLetters, smokeBacklog }, results };
}

export function summarize(facts: HealthFacts, results: readonly OpsResult[] = []): OpsResult[] {
	const severity = worstSeverity(results);
	const total = results.length;
	const detail = [
		`current_release=${facts.currentRelease?.id ?? 'none'}`,
		`previous_release=${facts.previousRelease?.id ?? 'none'}`,
		`backup=${facts.backup?.status ?? 'missing'}`,
		`restore_drill=${facts.drill?.status ?? 'missing'}`,
		`recent_events=${facts.recentEvents.length}`,
		`systemd_units=${facts.systemdUnits?.length ?? 'not-probed'}`,
		`outbox_depth=${facts.outboxDepth ?? 'not-probed'}`,
	].join('\n');

	return [
		withSource(
			{
				id: 'HEALTH-OVERALL-001',
				severity,
				summary:
					severity === 'fail'
						? 'Site health has failures'
						: severity === 'warn'
							? 'Site health has warnings'
							: 'Site health is passing',
				detail: `${detail}\nresults=${total}`,
				runbook: 'docs/operations/health.md',
			},
			'ledger'
		),
	];
}
