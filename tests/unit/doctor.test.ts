import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	type Dirent,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BootstrapScriptError } from '../../scripts/lib/errors';
import type { OpsResult } from '../../scripts/lib/ops-result';
import { recordDrill } from '../../scripts/lib/restore-drill-state';
import { main, parseArgs, runDoctor, type RunDoctorOptions } from '../../scripts/doctor';

const FIXTURE_ROOT = fileURLToPath(new URL('../fixtures/doctor', import.meta.url));

let tempDirs: string[] = [];
const previousOpsStateDir = process.env.OPS_STATE_DIR;

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
	if (previousOpsStateDir === undefined) {
		delete process.env.OPS_STATE_DIR;
	} else {
		process.env.OPS_STATE_DIR = previousOpsStateDir;
	}
});

function fixturePath(name: string): string {
	return join(FIXTURE_ROOT, name);
}

function copyFixture(name: string): string {
	const destination = mkdtempSync(join(tmpdir(), `doctor-${name}-`));
	tempDirs.push(destination);
	cpSync(fixturePath(name), destination, { recursive: true });
	const fixtureEnv = join(destination, 'env.json');
	if (existsSync(fixtureEnv)) {
		const parsed = JSON.parse(readFileSync(fixtureEnv, 'utf8')) as Record<string, string>;
		const content =
			parsed.__raw ??
			`${Object.entries(parsed)
				.map(([key, value]) => `${key}=${value}`)
				.join('\n')}\n`;
		writeFileSync(join(destination, '.env'), content, 'utf8');
	}
	return destination;
}

function memoryStream() {
	let output = '';
	return {
		stream: { write: (chunk: string) => (output += chunk) },
		get output() {
			return output;
		},
	};
}

function useTempOpsState(): void {
	const stateDir = mkdtempSync(join(tmpdir(), 'doctor-ops-state-'));
	tempDirs.push(stateDir);
	process.env.OPS_STATE_DIR = stateDir;
}

function recordSuccessfulDrill(finishedAt: string): void {
	recordDrill({
		results: [{ id: 'DRILL-001', severity: 'pass', summary: 'Source container present.' }],
		targetTime: '2026-05-07T02:00:00.000Z',
		backupSource: 'WAL-G LATEST via ready-site-postgres',
		startedAt: new Date(new Date(finishedAt).getTime() - 1000),
		finishedAt: new Date(finishedAt),
	});
}

function walkFiles(root: string, current = root): string[] {
	return readdirSync(current, { withFileTypes: true }).flatMap((entry: Dirent) => {
		const path = join(current, entry.name);
		if (entry.isDirectory()) return walkFiles(root, path);
		return [relative(root, path).replace(/\\/g, '/')];
	});
}

function hashTree(root: string): string {
	const hash = createHash('sha256');
	for (const file of walkFiles(root).sort()) {
		const path = join(root, file);
		const stat = lstatSync(path);
		hash.update(file);
		hash.update('\0');
		hash.update(stat.isSymbolicLink() ? 'symlink' : 'file');
		hash.update('\0');
		hash.update(readFileSync(path));
		hash.update('\0');
	}
	return hash.digest('hex');
}

const passingRuntimeProbe: Exclude<RunDoctorOptions['runtimeProbe'], undefined> = () => {
	return Promise.resolve([
		{
			id: 'doctor-migrations-applied',
			status: 'pass',
			label: 'Migrations are applied',
			detail: '2/2 migrations recorded',
			severity: 'required',
			hint: null,
		},
		{
			id: 'doctor-starter-tables',
			status: 'pass',
			label: 'Starter tables exist',
			detail: '3 starter tables found',
			severity: 'required',
			hint: null,
		},
	]);
};

function makeRunner(
	options: {
		dirty?: boolean;
		containerRuntime?: boolean;
		checkDbCode?: number;
		checkDbOutput?: string;
		validationCode?: number;
	} = {}
): Exclude<RunDoctorOptions['runner'], undefined> {
	return vi.fn(async (command: string, args: readonly string[] = []) => {
		const joinedArgs = args.join(' ');
		if (command === 'podman') {
			return {
				code: options.containerRuntime === false ? 1 : 0,
				stdout: options.containerRuntime === false ? '' : 'podman version 5\n',
				stderr: '',
				durationMs: 1,
			};
		}

		if (command === 'docker') {
			return { code: 1, stdout: '', stderr: '', durationMs: 1 };
		}

		if (command === 'git' && joinedArgs === 'status --porcelain') {
			return {
				code: 0,
				stdout: options.dirty ? ' M package.json\n' : '',
				stderr: '',
				durationMs: 1,
			};
		}

		if (command === 'bun' && joinedArgs === 'run check:db') {
			return {
				code: options.checkDbCode ?? 0,
				stdout:
					options.checkDbOutput ??
					'OK   Database connectivity verified\n     host: 127.0.0.1:5432\n',
				stderr: '',
				durationMs: 1,
			};
		}

		if (command === 'bun' && joinedArgs === '--version') {
			return { code: 0, stdout: '1.3.9\n', stderr: '', durationMs: 1 };
		}

		if (command === 'bun' && args[0] === 'run') {
			const code = options.validationCode ?? 0;
			return {
				code,
				stdout: code === 0 ? `OK ${joinedArgs}\n` : '',
				stderr: code === 0 ? '' : `FAIL ${joinedArgs}\n`,
				durationMs: 1,
			};
		}

		return { code: 0, stdout: '', stderr: '', durationMs: 1 };
	});
}

function findCheck(
	results: Awaited<ReturnType<typeof runDoctor>>['results'],
	id: string
): OpsResult {
	const check = results.find((item) => item.id === id);
	if (!check) throw new Error(`Missing doctor check ${id}`);
	return check;
}

describe('doctor script', () => {
	it('reports fresh-bootstrap launch blockers as warnings and exits 0', async () => {
		const rootDir = copyFixture('fresh-bootstrap');
		const runner = makeRunner();
		const result = await runDoctor({
			rootDir,
			runner,
			runtimeProbe: passingRuntimeProbe,
		});

		expect(result.exitCode, JSON.stringify(result.results, null, 2)).toBe(0);
		expect(findCheck(result.results, 'LAUNCH-OG-001').severity).toBe('warn');
		expect(findCheck(result.results, 'LAUNCH-ENV-001').severity).toBe('warn');
		expect(findCheck(result.results, 'LAUNCH-ENV-002').severity).toBe('warn');
		expect(findCheck(result.results, 'LAUNCH-CMS-001').severity).toBe('warn');
		expect(findCheck(result.results, 'LAUNCH-CMS-001').summary).toContain('Launch Blockers:');
		expect(runner).toHaveBeenCalledWith(
			'bun',
			['run', 'check:db'],
			expect.objectContaining({ cwd: rootDir, capture: true })
		);
	});

	it('reports pass for a ready-to-launch fixture with no failed checks', async () => {
		const result = await runDoctor({
			rootDir: copyFixture('ready-to-launch'),
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
		});

		expect(result.exitCode, JSON.stringify(result.results, null, 2)).toBe(0);
		expect(result.results).not.toContainEqual(expect.objectContaining({ severity: 'fail' }));
	});

	it('reports fresh restore-drill ledger evidence', async () => {
		useTempOpsState();
		recordSuccessfulDrill(new Date().toISOString());

		const result = await runDoctor({
			rootDir: copyFixture('ready-to-launch'),
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
		});

		expect(findCheck(result.results, 'DOCTOR-DRILL-001')).toMatchObject({
			severity: 'pass',
			summary: expect.stringContaining('Restore Drill:'),
		});
		expect(findCheck(result.results, 'DOCTOR-DRILL-002')).toMatchObject({
			severity: 'pass',
		});
	});

	it('warns when restore-drill ledger evidence is missing or stale', async () => {
		useTempOpsState();
		let result = await runDoctor({
			rootDir: copyFixture('ready-to-launch'),
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
		});

		expect(findCheck(result.results, 'DOCTOR-DRILL-001')).toMatchObject({
			severity: 'warn',
			detail: expect.stringContaining('restore-drill.json is missing'),
		});

		recordSuccessfulDrill('2026-04-01T03:00:00.000Z');
		result = await runDoctor({
			rootDir: copyFixture('ready-to-launch'),
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
		});

		expect(findCheck(result.results, 'DOCTOR-DRILL-002')).toMatchObject({
			severity: 'warn',
			detail: expect.stringContaining('last_success_at=2026-04-01T03:00:00.000Z'),
		});
	});

	it('identifies a broken .env as a specific failed check and exits nonzero', async () => {
		const result = await runDoctor({
			rootDir: copyFixture('broken-env'),
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
		});

		expect(result.exitCode, JSON.stringify(result.results, null, 2)).toBe(1);
		const envCheck = findCheck(result.results, 'BOOT-ENV-001');
		expect(envCheck.severity).toBe('fail');
		expect(envCheck.detail).toContain('missing "="');
		expect(envCheck.remediation?.[0]).toContain('NEXT:');
	});

	it('prints only OpsResult JSON when --json is set', async () => {
		const stdout = memoryStream();
		const stderr = memoryStream();
		const code = await main(['--json'], {
			rootDir: copyFixture('ready-to-launch'),
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
			stdout: stdout.stream,
			stderr: stderr.stream,
		});

		expect(code, stdout.output).toBe(0);
		expect(stderr.output).toBe('');
		expect(stdout.output).not.toContain('Doctor status');
		const parsed = JSON.parse(stdout.output) as OpsResult[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0]).toMatchObject({
			id: 'BOOT-BUN-001',
			severity: 'pass',
			summary: 'Environment: Bun is installed',
		});
	});

	it('does not mutate fixture files in human or JSON mode', async () => {
		const rootDir = copyFixture('ready-to-launch');
		const before = hashTree(rootDir);

		await runDoctor({
			rootDir,
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
		});
		await main(['--json'], {
			rootDir,
			runner: makeRunner(),
			runtimeProbe: passingRuntimeProbe,
			stdout: memoryStream().stream,
			stderr: memoryStream().stream,
		});

		expect(hashTree(rootDir)).toBe(before);
	});

	it('has no --fix flag', () => {
		expect(() => parseArgs(['--fix'])).toThrow(BootstrapScriptError);
	});

	it('accepts --no-color for the OpsResult printer', () => {
		expect(parseArgs(['--json', '--no-color'])).toEqual({ json: true, noColor: true });
	});
});
