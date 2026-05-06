import {
	closeSync,
	constants,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const EVENTS_FILE = 'events.ndjson';
const EVENT_ROTATE_BYTES = 10 * 1024 * 1024;
const EVENT_ROTATIONS = 2;
const LOCK_ATTEMPTS = 100;
const LOCK_BACKOFF_MS = 10;

export interface OpsChannelSnapshot<T = unknown> {
	project?: string;
	last_attempt_at?: string;
	last_success_at?: string;
	status?: 'pass' | 'warn' | 'fail' | 'unknown' | string;
	stale_after_seconds?: number;
	detail?: T;
}

export interface ReadEventsOptions {
	limit?: number;
	channel?: string;
	since?: Date;
}

type SiteProjectManifest = {
	project?: {
		projectSlug?: unknown;
	};
};

const heldLocks = new Set<string>();
let exitHandlerRegistered = false;

function ensureExitHandler(): void {
	if (exitHandlerRegistered) return;
	exitHandlerRegistered = true;
	process.once('exit', () => {
		for (const lockPath of heldLocks) {
			try {
				unlinkSync(lockPath);
			} catch {
				// Process shutdown cleanup is best-effort.
			}
		}
	});
}

function sleepSync(ms: number): void {
	const buffer = new SharedArrayBuffer(4);
	const view = new Int32Array(buffer);
	Atomics.wait(view, 0, 0, ms);
}

function readProjectSlug(): string {
	try {
		const raw = readFileSync(resolve(process.cwd(), 'site.project.json'), 'utf8');
		const parsed = JSON.parse(raw) as SiteProjectManifest;
		const slug = parsed.project?.projectSlug;
		if (typeof slug === 'string' && slug.trim().length > 0) return slug.trim();
	} catch {
		// Fall through to the template-safe default below.
	}
	return 'project';
}

function channelPath(channel: string): string {
	if (!/^[A-Za-z0-9_-]+$/u.test(channel)) {
		throw new Error(`Invalid ops-status channel "${channel}". Use letters, numbers, "_" or "-".`);
	}
	return join(resolveStateDir(), `${channel}.json`);
}

function acquireLock(lockPath: string): () => void {
	ensureExitHandler();

	for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
		try {
			const fd = openSync(
				lockPath,
				constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
				0o600
			);
			writeFileSync(fd, `${process.pid}\n`);
			closeSync(fd);
			heldLocks.add(lockPath);
			return () => {
				heldLocks.delete(lockPath);
				unlinkSync(lockPath);
			};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'EEXIST') throw error;
			sleepSync(LOCK_BACKOFF_MS);
		}
	}

	throw new Error(`Timed out waiting for ops-status lock: ${lockPath}`);
}

function rotateEventsIfNeeded(nextBytes: number): void {
	const stateDir = resolveStateDir();
	const current = join(stateDir, EVENTS_FILE);
	if (!existsSync(current)) return;
	if (statSync(current).size + nextBytes <= EVENT_ROTATE_BYTES) return;

	const oldest = join(stateDir, `${EVENTS_FILE}.${EVENT_ROTATIONS}`);
	if (existsSync(oldest)) unlinkSync(oldest);

	for (let index = EVENT_ROTATIONS - 1; index >= 1; index -= 1) {
		const from = join(stateDir, `${EVENTS_FILE}.${index}`);
		if (existsSync(from)) renameSync(from, join(stateDir, `${EVENTS_FILE}.${index + 1}`));
	}

	renameSync(current, join(stateDir, `${EVENTS_FILE}.1`));
}

function parseEventDate(event: Record<string, unknown>): Date | null {
	for (const field of ['occurred_at', 'timestamp', 'at', 'deployedAt']) {
		const value = event[field];
		if (typeof value !== 'string') continue;
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) return parsed;
	}
	return null;
}

function readEventFile(path: string): object[] {
	if (!existsSync(path)) return [];
	const lines = readFileSync(path, 'utf8')
		.split(/\r?\n/u)
		.filter((line) => line.trim().length > 0);

	const events: object[] = [];
	for (const line of lines) {
		try {
			const event = JSON.parse(line) as unknown;
			if (event && typeof event === 'object' && !Array.isArray(event)) events.push(event);
		} catch {
			// A malformed event line should not make the whole ledger unreadable.
		}
	}
	return events;
}

export function resolveStateDir(opts: { projectSlug?: string } = {}): string {
	const stateDir =
		process.env.OPS_STATE_DIR ??
		join(homedir(), '.local/state', opts.projectSlug ?? readProjectSlug(), 'ops');
	mkdirSync(stateDir, { recursive: true });
	return stateDir;
}

export function readChannel<T>(channel: string): T | null {
	const path = channelPath(channel);
	if (!existsSync(path)) return null;

	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return null;
	}
}

export function writeChannel<T>(channel: string, value: T): void {
	const path = channelPath(channel);
	const lockPath = join(resolveStateDir(), `${channel}.lock`);
	const release = acquireLock(lockPath);
	const tmpPath = `${path}.tmp`;

	try {
		writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
		renameSync(tmpPath, path);
	} finally {
		try {
			release();
		} finally {
			if (existsSync(tmpPath)) unlinkSync(tmpPath);
		}
	}
}

export function appendEvent(event: object): void {
	const line = `${JSON.stringify(event)}\n`;
	rotateEventsIfNeeded(Buffer.byteLength(line));
	const fd = openSync(
		join(resolveStateDir(), EVENTS_FILE),
		constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY,
		0o600
	);
	try {
		writeFileSync(fd, line);
	} finally {
		closeSync(fd);
	}
}

export async function* readEvents(opts: ReadEventsOptions = {}): AsyncIterable<object> {
	const stateDir = resolveStateDir();
	const files = [
		join(stateDir, EVENTS_FILE),
		...Array.from({ length: EVENT_ROTATIONS }, (_, index) =>
			join(stateDir, `${EVENTS_FILE}.${index + 1}`)
		),
	];
	const sinceMs = opts.since?.getTime();
	let yielded = 0;

	for (const file of files) {
		const events = readEventFile(file).reverse();
		for (const event of events) {
			const record = event as Record<string, unknown>;
			if (opts.channel && record.channel !== opts.channel) continue;
			if (typeof sinceMs === 'number') {
				const eventDate = parseEventDate(record);
				if (!eventDate || eventDate.getTime() < sinceMs) continue;
			}
			yield event;
			yielded += 1;
			if (opts.limit && yielded >= opts.limit) return;
		}
	}
}

export function isStale(channel: string, now: Date = new Date()): boolean {
	const snapshot = readChannel<OpsChannelSnapshot>(channel);
	if (!snapshot?.last_success_at) return true;
	if (typeof snapshot.stale_after_seconds !== 'number') return true;

	const lastSuccess = new Date(snapshot.last_success_at);
	if (Number.isNaN(lastSuccess.getTime())) return true;

	return now.getTime() - lastSuccess.getTime() > snapshot.stale_after_seconds * 1000;
}
