#!/usr/bin/env bun
/**
 * backup:restore:drill — non-destructive PITR restore drill.
 *
 * Ships as a script the operator runs (manually or from cron quarterly),
 * NOT as a systemd timer. An automated restore drill that fails silently is
 * worse than no drill — operator visibility is the load-bearing piece.
 *
 * What it does:
 *   1. Pulls the same Postgres+WAL-G image the production container uses.
 *   2. Starts a temporary container with a scratch volume + R2 credentials
 *      copied from the prod env, on a non-conflicting loopback port.
 *   3. Runs `wal-g backup-fetch` to restore the latest base backup.
 *   4. Replays WAL up to "now - 1 hour" (PITR target).
 *   5. Runs read-only sanity SELECTs against the restored database.
 *   6. Tears the container + volume down whether the drill passed or failed.
 *
 * Exit codes:
 *   0 — drill passed; PITR is reproducible.
 *   1 — drill failed; PITR is at risk. Operator pages themselves.
 *
 * Usage: bun run backup:restore:drill [--keep] [--target-time=ISO]
 *   --keep                Don't tear down on success (debugging).
 *   --target-time=ISO     Override the recovery_target_time (default: now-1h).
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run as defaultRunner, type RunResult } from './lib/run';
import { sanitizeProjectSlug } from './lib/postgres-dev';

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

export interface RestoreDrillOptions {
	rootDir?: string;
	projectSlug?: string;
	keepContainer?: boolean;
	targetTimeIso?: string;
	tempPort?: number;
	runner?: typeof defaultRunner;
	now?: () => Date;
	env?: NodeJS.ProcessEnv;
}

export interface RestoreDrillResult {
	exitCode: number;
	steps: Array<{ id: string; status: 'pass' | 'fail' | 'skip'; detail: string }>;
	tempContainer: string;
}

function readProjectSlug(rootDir: string, override?: string): string {
	if (override) return sanitizeProjectSlug(override);
	try {
		const manifestPath = join(rootDir, 'site.project.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			project?: { projectSlug?: string };
		};
		const slug = manifest.project?.projectSlug?.trim();
		if (slug) return sanitizeProjectSlug(slug);
	} catch {
		// fall through
	}
	throw new Error(
		'Could not determine project slug. Set --project=<slug> or fix site.project.json.'
	);
}

function defaultTargetTime(now: () => Date): string {
	const t = new Date(now().getTime() - 60 * 60 * 1000);
	return t.toISOString();
}

function step(
	id: string,
	status: 'pass' | 'fail' | 'skip',
	detail: string
): RestoreDrillResult['steps'][number] {
	return { id, status, detail };
}

async function execOk(
	runner: typeof defaultRunner,
	command: string,
	args: readonly string[],
	cwd: string
): Promise<RunResult> {
	return runner(command, args, { cwd, capture: true });
}

export async function runRestoreDrill(
	options: RestoreDrillOptions = {}
): Promise<RestoreDrillResult> {
	const rootDir = options.rootDir ?? ROOT_DIR;
	const runner = options.runner ?? defaultRunner;
	const now = options.now ?? (() => new Date());
	const env = options.env ?? process.env;

	const slug = readProjectSlug(rootDir, options.projectSlug);
	const sourceContainer = `${slug}-postgres`;
	const tempContainer = `${slug}-postgres-restore-drill-${Date.now()}`;
	const targetTime = options.targetTimeIso ?? defaultTargetTime(now);
	const tempPort = options.tempPort ?? 55432;
	const steps: RestoreDrillResult['steps'] = [];

	// 1. Source container exists (drill needs the same image to run with).
	const exists = await runner('podman', ['container', 'exists', sourceContainer], {
		cwd: rootDir,
		capture: true,
	});
	if (exists.code !== 0) {
		steps.push(
			step(
				'DRILL-001',
				'fail',
				`Source container ${sourceContainer} not found. Cannot determine the image to drill against.`
			)
		);
		return { exitCode: 1, steps, tempContainer };
	}
	steps.push(step('DRILL-001', 'pass', `Source container ${sourceContainer} present.`));

	// 2. Look up the source image so the drill runs on the same WAL-G binary.
	const inspect = await runner(
		'podman',
		['inspect', '--format', '{{.ImageName}}', sourceContainer],
		{ cwd: rootDir, capture: true }
	);
	if (inspect.code !== 0 || !inspect.stdout.trim()) {
		steps.push(step('DRILL-002', 'fail', `Could not read image for ${sourceContainer}.`));
		return { exitCode: 1, steps, tempContainer };
	}
	const image = inspect.stdout.trim();
	steps.push(step('DRILL-002', 'pass', `Image: ${image}`));

	// 3. Copy R2 credentials from the source container's env. WAL-G needs
	//    them to fetch the base backup + WAL chain. We pass them through
	//    as -e flags to the temp container.
	const r2EnvKeys = [
		'AWS_ACCESS_KEY_ID',
		'AWS_SECRET_ACCESS_KEY',
		'AWS_ENDPOINT',
		'AWS_REGION',
		'AWS_S3_FORCE_PATH_STYLE',
		'WALG_S3_PREFIX',
		'WALG_COMPRESSION_METHOD',
	];
	const credExports: string[] = [];
	for (const key of r2EnvKeys) {
		const value = env[key];
		if (!value) continue;
		credExports.push('-e', `${key}=${value}`);
	}
	if (credExports.length === 0) {
		steps.push(
			step(
				'DRILL-003',
				'fail',
				'No R2/WAL-G env vars in current shell. Source the prod env file before running the drill.'
			)
		);
		return { exitCode: 1, steps, tempContainer };
	}
	steps.push(step('DRILL-003', 'pass', `Forwarding ${credExports.length / 2} R2/WAL-G env vars.`));

	// 4. Start the temp container without auto-starting Postgres so we can
	//    run wal-g backup-fetch into the empty PGDATA volume first. We mount
	//    a scratch named volume so the host PGDATA isn't touched.
	const tempVolume = `${tempContainer}-data`;
	steps.push(step('DRILL-004', 'pass', `Drill container=${tempContainer} volume=${tempVolume}.`));

	const startResult = await runner(
		'podman',
		[
			'run',
			'-d',
			'--name',
			tempContainer,
			'--rm',
			'-p',
			`127.0.0.1:${tempPort}:5432`,
			'-v',
			`${tempVolume}:/var/lib/postgresql/data`,
			'-e',
			'POSTGRES_PASSWORD=drill-temp-password',
			...credExports,
			'--entrypoint',
			'/bin/sh',
			image,
			'-c',
			'sleep infinity',
		],
		{ cwd: rootDir, capture: true }
	);
	if (startResult.code !== 0) {
		steps.push(step('DRILL-005', 'fail', `podman run failed: ${startResult.stderr.trim()}`));
		return { exitCode: 1, steps, tempContainer };
	}
	steps.push(step('DRILL-005', 'pass', 'Temp container running.'));

	const teardown = async (): Promise<void> => {
		await runner('podman', ['rm', '-f', tempContainer], { cwd: rootDir, capture: true });
		await runner('podman', ['volume', 'rm', '-f', tempVolume], { cwd: rootDir, capture: true });
	};

	try {
		// 5. wal-g backup-fetch latest base into PGDATA.
		const fetchResult = await execOk(
			runner,
			'podman',
			[
				'exec',
				tempContainer,
				'/usr/local/bin/wal-g',
				'backup-fetch',
				'/var/lib/postgresql/data',
				'LATEST',
			],
			rootDir
		);
		if (fetchResult.code !== 0) {
			steps.push(
				step('DRILL-006', 'fail', `wal-g backup-fetch failed: ${fetchResult.stderr.trim()}`)
			);
			return { exitCode: 1, steps, tempContainer };
		}
		steps.push(step('DRILL-006', 'pass', 'Base backup restored from R2.'));

		// 6. Write recovery.signal + restore_command + recovery_target_time.
		//    Postgres will replay WAL up to the target on startup.
		const recoveryConf = [
			"restore_command = '/usr/local/bin/wal-g wal-fetch %f %p'",
			`recovery_target_time = '${targetTime}'`,
			"recovery_target_action = 'pause'",
		].join('\n');
		const writeRecovery = await runner(
			'podman',
			[
				'exec',
				tempContainer,
				'sh',
				'-c',
				`echo "${recoveryConf}" >> /var/lib/postgresql/data/postgresql.auto.conf && touch /var/lib/postgresql/data/recovery.signal && chown postgres:postgres /var/lib/postgresql/data/postgresql.auto.conf /var/lib/postgresql/data/recovery.signal`,
			],
			{ cwd: rootDir, capture: true }
		);
		if (writeRecovery.code !== 0) {
			steps.push(
				step('DRILL-007', 'fail', `Could not write recovery signal: ${writeRecovery.stderr.trim()}`)
			);
			return { exitCode: 1, steps, tempContainer };
		}
		steps.push(step('DRILL-007', 'pass', `recovery_target_time=${targetTime} written.`));

		// 7. Start Postgres in recovery mode.
		const startPg = await runner(
			'podman',
			[
				'exec',
				'-u',
				'postgres',
				'-d',
				tempContainer,
				'sh',
				'-c',
				'/usr/local/bin/docker-entrypoint.sh postgres &',
			],
			{ cwd: rootDir, capture: true }
		);
		if (startPg.code !== 0) {
			steps.push(
				step('DRILL-008', 'fail', `Postgres recovery start failed: ${startPg.stderr.trim()}`)
			);
			return { exitCode: 1, steps, tempContainer };
		}

		// Poll until pg_isready accepts connections (recovery complete enough
		// to serve read-only queries).
		const deadline = Date.now() + 90_000;
		let ready = false;
		while (Date.now() < deadline) {
			const probe = await runner(
				'podman',
				[
					'exec',
					tempContainer,
					'pg_isready',
					'-U',
					'postgres',
					'-d',
					'postgres',
					'-h',
					'127.0.0.1',
				],
				{ cwd: rootDir, capture: true }
			);
			if (probe.code === 0) {
				ready = true;
				break;
			}
			await new Promise((r) => setTimeout(r, 1000));
		}
		if (!ready) {
			steps.push(step('DRILL-008', 'fail', 'Postgres did not become ready within 90s.'));
			return { exitCode: 1, steps, tempContainer };
		}
		steps.push(step('DRILL-008', 'pass', 'Postgres reached ready state in recovery mode.'));

		// 8. Read-only sanity check: confirm the contact_submissions table
		//    exists and SELECT count(*) succeeds. We don't assert on count
		//    because a fresh deployment legitimately has zero leads.
		const sanity = await runner(
			'podman',
			[
				'exec',
				'-u',
				'postgres',
				tempContainer,
				'psql',
				'-d',
				'postgres',
				'-tAc',
				'SELECT count(*) FROM contact_submissions',
			],
			{ cwd: rootDir, capture: true }
		);
		if (sanity.code !== 0) {
			steps.push(
				step(
					'DRILL-009',
					'fail',
					`Sanity SELECT failed: ${sanity.stderr.trim() || sanity.stdout.trim()}`
				)
			);
			return { exitCode: 1, steps, tempContainer };
		}
		steps.push(
			step('DRILL-009', 'pass', `contact_submissions count=${sanity.stdout.trim()} (read-only).`)
		);

		return { exitCode: 0, steps, tempContainer };
	} finally {
		if (!options.keepContainer) await teardown();
	}
}

function parseArgs(args: string[]): {
	keep: boolean;
	targetTime?: string;
	help: boolean;
} {
	const out = { keep: false, targetTime: undefined as string | undefined, help: false };
	for (const arg of args) {
		if (arg === '--help' || arg === '-h') out.help = true;
		else if (arg === '--keep') out.keep = true;
		else if (arg.startsWith('--target-time=')) out.targetTime = arg.slice('--target-time='.length);
	}
	return out;
}

function usage(): string {
	return `Usage: bun run backup:restore:drill -- [options]

Options:
  --keep                  Don't tear down the temp container on success.
  --target-time=ISO       Override recovery target (default: now - 1h).
  --help                  Show this help.

Run quarterly per docs/operations/pitr-restore.md.
`;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
	const options = parseArgs(argv);
	if (options.help) {
		console.log(usage());
		return 0;
	}

	const result = await runRestoreDrill({
		keepContainer: options.keep,
		targetTimeIso: options.targetTime,
	});

	for (const item of result.steps) {
		const prefix = item.status === 'pass' ? 'OK  ' : item.status === 'skip' ? 'SKIP' : 'FAIL';
		const stream = item.status === 'fail' ? console.error : console.log;
		stream(`${prefix} ${item.id} ${item.detail}`);
	}

	if (result.exitCode === 0) console.log('\nbackup:restore:drill passed.\n');
	else console.error('\nbackup:restore:drill FAILED — PITR is at risk.\n');

	return result.exitCode;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	process.exit(await main());
}
