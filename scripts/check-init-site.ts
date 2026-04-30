#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dir, '..');
const TEMP_ROOT = mkdtempSync(join(tmpdir(), 'tmpl-svelte-app-'));
const TEMP_REPO = join(TEMP_ROOT, 'repo');
const ARCHIVE_MAX_BYTES = 512 * 1024 * 1024;

const ANSWERS = `my-cool-site
Acme Studio
https://acme-studio.dev
Portrait and brand photography for independent makers.
acme-org
my-cool-site
hello@acme-studio.dev
my-cool-site
acme-studio.dev
Acme
`;

const TARGET_FILES = [
	'package.json',
	'src/lib/config/site.ts',
	'static/admin/config.yml',
	'static/site.webmanifest',
	'README.md',
	'.env.example',
	'deploy/env.example',
	'deploy/Caddyfile.example',
	'deploy/quadlets/web.container',
	'deploy/quadlets/web.network',
	'deploy/systemd/backup.service',
	'deploy/systemd/backup.timer',
];

const EXPECTED_STRINGS: Record<string, string[]> = {
	'package.json': ['"name": "my-cool-site"'],
	'src/lib/config/site.ts': [
		"name: 'Acme Studio'",
		"url: 'https://acme-studio.dev'",
		"defaultDescription: 'Portrait and brand photography for independent makers.'",
		"logo: 'https://acme-studio.dev/images/logo.png'",
		"email: 'hello@acme-studio.dev'",
	],
	'static/admin/config.yml': ['repo: acme-org/my-cool-site'],
	'static/site.webmanifest': ['"name": "Acme Studio"', '"short_name": "Acme"'],
	'README.md': ['# Acme Studio'],
	'.env.example': ['ORIGIN=https://acme-studio.dev'],
	'deploy/env.example': [
		'ORIGIN=https://acme-studio.dev',
		'PUBLIC_SITE_URL=https://acme-studio.dev',
	],
	'deploy/Caddyfile.example': ['acme-studio.dev {', 'www.acme-studio.dev {'],
	'deploy/quadlets/web.container': [
		'Description=SvelteKit web app — my-cool-site',
		'Image=ghcr.io/acme-org/my-cool-site:<sha>',
		'EnvironmentFile=%h/secrets/my-cool-site.prod.env',
		'Network=my-cool-site.network',
		'HostName=my-cool-site-web',
	],
	'deploy/quadlets/web.network': ['Description=Project network — my-cool-site'],
	'deploy/systemd/backup.service': [
		'Description=Nightly backup (database + uploads) — my-cool-site',
		'WorkingDirectory=%h/my-cool-site',
		'EnvironmentFile=%h/secrets/my-cool-site.prod.env',
	],
	'deploy/systemd/backup.timer': [
		'Description=Nightly backup timer — my-cool-site',
		'Unit=my-cool-site-backup.service',
	],
};

const FORBIDDEN_AFTER_INIT = [
	'Your Site Name',
	'https://example.com',
	'owner/repo-name',
	'REPLACE PER PROJECT',
	'[Site Title]',
	'[Site Name]',
	'[Year]',
	'support@example.com',
	'<owner>',
	'<name>',
	'<project>',
	'<unit-name>',
];

const LAUNCH_ENV = {
	ORIGIN: 'https://acme-studio.dev',
	PUBLIC_SITE_URL: 'https://acme-studio.dev',
	DATABASE_URL: 'postgres://ci_stub:ci_stub@127.0.0.1:5432/ci_stub',
};

interface CommandResult {
	command: string;
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface DiffTarget {
	relPath: string;
	expectedContent?: string | Buffer;
}

class CheckInitSiteError extends Error {
	constructor(
		message: string,
		readonly diffs: DiffTarget[] = []
	) {
		super(message);
	}
}

let dependencyMode = 'not set';
let hostHashBefore = '';
let hostTrackedPaths: string[] = [];

function fail(message: string, diffs: DiffTarget[] = []): never {
	throw new CheckInitSiteError(message, diffs);
}

function gitTrackedPaths(root: string): string[] {
	const result = spawnSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'buffer',
		maxBuffer: ARCHIVE_MAX_BYTES,
	});
	if (result.status !== 0) {
		fail(`git ls-files failed:\n${String(result.stderr)}`);
	}
	return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function hashTrackedFiles(root: string, paths: string[]): string {
	const hash = createHash('sha256');
	for (const relPath of paths) {
		const path = join(root, relPath);
		const stat = lstatSync(path);
		hash.update(relPath);
		hash.update('\0');
		if (stat.isSymbolicLink()) {
			hash.update('symlink');
			hash.update(readlinkSync(path));
		} else {
			hash.update(readFileSync(path));
		}
		hash.update('\0');
	}
	return hash.digest('hex');
}

function copyTrackedFiles(): void {
	mkdirSync(TEMP_REPO, { recursive: true });

	const fileList = spawnSync('git', ['ls-files', '-z'], {
		cwd: ROOT,
		encoding: 'buffer',
		maxBuffer: ARCHIVE_MAX_BYTES,
	});
	if (fileList.status !== 0) {
		fail(`git ls-files failed while preparing temp copy:\n${String(fileList.stderr)}`);
	}

	const archive = spawnSync('tar', ['--null', '-T', '-', '-cf', '-'], {
		cwd: ROOT,
		input: fileList.stdout,
		encoding: 'buffer',
		maxBuffer: ARCHIVE_MAX_BYTES,
	});
	if (archive.status !== 0) {
		fail(`tar archive creation failed:\n${String(archive.stderr)}`);
	}

	const extract = spawnSync('tar', ['-C', TEMP_REPO, '-xf', '-'], {
		input: archive.stdout,
		encoding: 'buffer',
		maxBuffer: ARCHIVE_MAX_BYTES,
	});
	if (extract.status !== 0) {
		fail(`tar archive extraction failed:\n${String(extract.stderr)}`);
	}
}

function verifyCleanCopy(): void {
	const forbiddenPaths = [
		'.git',
		'node_modules',
		'.svelte-kit',
		'build',
		'test-results',
		'playwright-report',
		'secrets.yaml',
		'secrets',
	];

	for (const relPath of forbiddenPaths) {
		if (existsSync(join(TEMP_REPO, relPath))) {
			fail(`Temp copy unexpectedly contains ${relPath}`);
		}
	}

	for (const entry of readdirSync(TEMP_REPO)) {
		if (entry.startsWith('.env') && entry !== '.env.example') {
			fail(`Temp copy unexpectedly contains ${entry}`);
		}
		if (entry.startsWith('secrets') && entry !== 'secrets.example.yaml') {
			fail(`Temp copy unexpectedly contains ${entry}`);
		}
	}
}

async function runCommand(
	args: string[],
	options: {
		cwd?: string;
		input?: string;
		env?: Record<string, string>;
		allowFailure?: boolean;
	} = {}
): Promise<CommandResult> {
	const command = args.join(' ');
	let proc = Bun.spawn(args, {
		cwd: options.cwd ?? ROOT,
		stdin: options.input ? 'pipe' : 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, ...options.env },
	});

	if (options.input) {
		try {
			proc.stdin.write(options.input);
			await proc.stdin.flush();
			proc.stdin.end();
		} catch {
			proc.kill();
			await proc.exited;
			const stdinPath = join(TEMP_ROOT, `${basename(args[0])}-${Date.now()}.stdin`);
			writeFileSync(stdinPath, options.input, 'utf8');
			proc = Bun.spawn(args, {
				cwd: options.cwd ?? ROOT,
				stdin: Bun.file(stdinPath),
				stdout: 'pipe',
				stderr: 'pipe',
				env: { ...process.env, ...options.env },
			});
		}
	}

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	const result = { command, exitCode, stdout, stderr };
	if (exitCode !== 0 && !options.allowFailure) {
		fail(`${command} failed with exit code ${exitCode}\n\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
	}
	return result;
}

async function setupDependencies(): Promise<void> {
	const rootNodeModules = join(ROOT, 'node_modules');
	const tempNodeModules = join(TEMP_REPO, 'node_modules');

	if (existsSync(rootNodeModules)) {
		symlinkSync(rootNodeModules, tempNodeModules, 'dir');
		const probe = await runCommand(['bun', 'run', 'check'], {
			cwd: TEMP_REPO,
			allowFailure: true,
		});
		if (probe.exitCode === 0) {
			dependencyMode = 'node_modules symlink';
			return;
		}
		rmSync(tempNodeModules, { recursive: true, force: true });
	}

	await runCommand(['bun', 'install', '--backend=symlink'], { cwd: TEMP_REPO });
	await runCommand(['bun', 'run', 'check'], { cwd: TEMP_REPO });
	dependencyMode = 'bun install --backend=symlink';
}

async function runInitSite(): Promise<void> {
	await runCommand(['bun', 'run', 'init:site'], {
		cwd: TEMP_REPO,
		input: ANSWERS,
	});
}

function assertInitializedFiles(): void {
	for (const relPath of TARGET_FILES) {
		const content = readFileSync(join(TEMP_REPO, relPath), 'utf8');
		for (const expected of EXPECTED_STRINGS[relPath] ?? []) {
			if (!content.includes(expected)) {
				fail(`${relPath} does not contain expected value: ${expected}`, [{ relPath }]);
			}
		}
		for (const forbidden of FORBIDDEN_AFTER_INIT) {
			if (content.includes(forbidden)) {
				fail(`${relPath} still contains forbidden placeholder: ${forbidden}`, [{ relPath }]);
			}
		}
	}
}

function snapshotTrackedFiles(root: string, paths: string[]): Map<string, Buffer> {
	const snapshot = new Map<string, Buffer>();
	for (const relPath of paths) {
		snapshot.set(relPath, readFileSync(join(root, relPath)));
	}
	return snapshot;
}

function assertSnapshotUnchanged(snapshot: Map<string, Buffer>): void {
	for (const [relPath, before] of snapshot) {
		const after = readFileSync(join(TEMP_REPO, relPath));
		if (!after.equals(before)) {
			fail(`init:site is not idempotent; ${relPath} changed on second run`, [
				{ relPath, expectedContent: before },
			]);
		}
	}
}

function assertOnlyOgLaunchFailure(result: CommandResult): void {
	if (result.exitCode === 0) {
		fail('check:launch passed before replacing static/og-default.png');
	}

	const output = `${result.stdout}\n${result.stderr}`;
	const errorLines = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith('✗'));

	if (
		errorLines.length !== 1 ||
		!errorLines[0].includes('static/og-default.png is still the template placeholder')
	) {
		fail(`Expected exactly one OG placeholder error from check:launch.\n\n${output}`, [
			{ relPath: 'static/og-default.png' },
		]);
	}
}

async function replaceOgPlaceholder(): Promise<void> {
	const ogPath = join(TEMP_REPO, 'static/og-default.png');
	const tempOgPath = join(TEMP_REPO, 'static/og-default.tmp.png');
	const { data, info } = await sharp(ogPath).ensureAlpha().raw().toBuffer({
		resolveWithObject: true,
	});
	data[0] = data[0] === 255 ? 254 : data[0] + 1;
	await sharp(data, {
		raw: {
			width: info.width,
			height: info.height,
			channels: info.channels,
		},
	})
		.png()
		.toFile(tempOgPath);
	renameSync(tempOgPath, ogPath);
}

function printDiff(diff: DiffTarget): void {
	const actualPath = join(TEMP_REPO, diff.relPath);
	let leftPath = join(ROOT, diff.relPath);

	if (diff.expectedContent !== undefined) {
		leftPath = join(TEMP_ROOT, `${basename(diff.relPath)}.expected`);
		writeFileSync(leftPath, diff.expectedContent, 'utf8');
	}

	if (!existsSync(leftPath) || !existsSync(actualPath)) {
		console.error(`\nDiff unavailable for ${diff.relPath}`);
		return;
	}

	const result = spawnSync('git', ['diff', '--no-index', '--', leftPath, actualPath], {
		encoding: 'utf8',
		maxBuffer: ARCHIVE_MAX_BYTES,
	});

	const output = result.stdout || result.stderr;
	if (output.trim()) {
		console.error(`\nDiff for ${diff.relPath}:\n${output}`);
	}
}

async function main(): Promise<void> {
	hostTrackedPaths = gitTrackedPaths(ROOT);
	hostHashBefore = hashTrackedFiles(ROOT, hostTrackedPaths);

	copyTrackedFiles();
	verifyCleanCopy();
	await setupDependencies();

	await runInitSite();
	assertInitializedFiles();

	const initializedSnapshot = snapshotTrackedFiles(TEMP_REPO, hostTrackedPaths);
	await runInitSite();
	assertSnapshotUnchanged(initializedSnapshot);

	const launchBeforeOg = await runCommand(['bun', 'run', 'check:launch'], {
		cwd: TEMP_REPO,
		env: LAUNCH_ENV,
		allowFailure: true,
	});
	assertOnlyOgLaunchFailure(launchBeforeOg);

	await replaceOgPlaceholder();
	await runCommand(['bun', 'run', 'check:assets'], { cwd: TEMP_REPO });
	await runCommand(['bun', 'run', 'check:launch'], {
		cwd: TEMP_REPO,
		env: LAUNCH_ENV,
	});

	const hostHashAfter = hashTrackedFiles(ROOT, hostTrackedPaths);
	if (hostHashAfter !== hostHashBefore) {
		fail('Host repository tracked files changed while running check:init-site');
	}

	rmSync(TEMP_ROOT, { recursive: true, force: true });
	console.log('✓ check:init-site passed');
	console.log(`  dependency setup: ${dependencyMode}`);
}

main().catch((err) => {
	if (hostHashBefore && hostTrackedPaths.length) {
		const hostHashAfter = hashTrackedFiles(ROOT, hostTrackedPaths);
		if (hostHashAfter !== hostHashBefore) {
			console.error('Host repository tracked files changed while running check:init-site');
		}
	}

	const message = err instanceof Error ? err.message : String(err);
	console.error(`\ncheck:init-site failed: ${message}`);
	console.error(`Temp copy kept at: ${TEMP_REPO}`);
	console.error(`Dependency setup: ${dependencyMode}`);

	if (err instanceof CheckInitSiteError) {
		for (const diff of err.diffs) printDiff(diff);
	}

	process.exit(1);
});
