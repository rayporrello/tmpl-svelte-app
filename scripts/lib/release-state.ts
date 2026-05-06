import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appendEvent, readChannel, writeChannel, type OpsChannelSnapshot } from './ops-status';

const RELEASES_CHANNEL = 'releases';
const RELEASES_STALE_AFTER_SECONDS = 365 * 24 * 60 * 60;

export interface Release {
	id: string;
	sha: string;
	image: string;
	deployedAt: string;
	migrations: string[];
	migrationSafety: 'rollback-safe' | 'rollback-blocked';
}

interface ReleaseStateDetail {
	releases: Release[];
}

type ReleaseStateSnapshot = OpsChannelSnapshot<ReleaseStateDetail>;

function readProjectSlug(): string {
	try {
		const manifest = JSON.parse(
			readFileSync(resolve(process.cwd(), 'site.project.json'), 'utf8')
		) as {
			project?: { projectSlug?: unknown };
		};
		if (typeof manifest.project?.projectSlug === 'string') return manifest.project.projectSlug;
	} catch {
		// Release state remains useful in tests or ad-hoc temp projects.
	}
	return 'project';
}

function readReleaseState(): ReleaseStateSnapshot | null {
	const snapshot = readChannel<ReleaseStateSnapshot>(RELEASES_CHANNEL);
	if (!snapshot?.detail || !Array.isArray(snapshot.detail.releases)) return snapshot;
	return snapshot;
}

function releaseHistory(): Release[] {
	return readReleaseState()?.detail?.releases ?? [];
}

export function recordRelease(r: Release): void {
	const now = new Date().toISOString();
	const history = [...releaseHistory(), r];

	writeChannel<ReleaseStateSnapshot>(RELEASES_CHANNEL, {
		project: readProjectSlug(),
		last_attempt_at: now,
		last_success_at: now,
		status: 'pass',
		stale_after_seconds: RELEASES_STALE_AFTER_SECONDS,
		detail: { releases: history },
	});

	appendEvent({
		channel: RELEASES_CHANNEL,
		type: 'release.recorded',
		occurred_at: now,
		release: r,
	});
}

export function listReleases(opts: { limit?: number } = {}): Release[] {
	const releases = [...releaseHistory()].reverse();
	return typeof opts.limit === 'number' ? releases.slice(0, opts.limit) : releases;
}

export function getCurrentRelease(): Release | null {
	return listReleases({ limit: 1 })[0] ?? null;
}

export function getPreviousRollbackSafeRelease(): Release | null {
	const [, ...previous] = listReleases();
	return previous.find((release) => release.migrationSafety === 'rollback-safe') ?? null;
}
