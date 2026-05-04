#!/usr/bin/env bun
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	PERMISSIONS_POLICY,
	REFERRER_POLICY,
	STRICT_TRANSPORT_SECURITY,
	X_CONTENT_TYPE_OPTIONS,
	X_FRAME_OPTIONS,
} from '../src/lib/server/security-headers';

export type DeploySmokeStatus = 'pass' | 'fail' | 'skip';

export type DeploySmokeResult = {
	id: string;
	status: DeploySmokeStatus;
	label: string;
	detail: string;
};

export type DeploySmokeOptions = {
	baseUrl: string;
	skipReadyz?: boolean;
	fetcher?: typeof fetch;
	timeoutMs?: number;
};

type CliOptions = {
	baseUrl?: string;
	skipReadyz: boolean;
	timeoutMs: number;
};

function pass(id: string, label: string, detail: string): DeploySmokeResult {
	return { id, status: 'pass', label, detail };
}

function fail(id: string, label: string, detail: string): DeploySmokeResult {
	return { id, status: 'fail', label, detail };
}

function skip(id: string, label: string, detail: string): DeploySmokeResult {
	return { id, status: 'skip', label, detail };
}

function joinUrl(baseUrl: string, path: string): string {
	const base = new URL(baseUrl);
	base.pathname = path;
	base.search = '';
	base.hash = '';
	return base.toString();
}

async function fetchWithTimeout(
	fetcher: typeof fetch,
	url: string,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetcher(url, { signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

async function checkJsonOk(
	fetcher: typeof fetch,
	baseUrl: string,
	path: string,
	id: string,
	label: string,
	timeoutMs: number
): Promise<DeploySmokeResult> {
	try {
		const response = await fetchWithTimeout(fetcher, joinUrl(baseUrl, path), timeoutMs);
		if (!response.ok) return fail(id, label, `${path} returned HTTP ${response.status}.`);
		const body = (await response.json()) as { ok?: unknown };
		if (body.ok !== true) return fail(id, label, `${path} JSON did not include ok: true.`);
		return pass(id, label, `${path} returned ok: true.`);
	} catch (error) {
		return fail(id, label, error instanceof Error ? error.message : String(error));
	}
}

async function checkTextIncludes(
	fetcher: typeof fetch,
	baseUrl: string,
	path: string,
	id: string,
	label: string,
	needles: readonly string[],
	timeoutMs: number
): Promise<DeploySmokeResult> {
	try {
		const response = await fetchWithTimeout(fetcher, joinUrl(baseUrl, path), timeoutMs);
		if (!response.ok) return fail(id, label, `${path} returned HTTP ${response.status}.`);
		const body = await response.text();
		const missing = needles.filter((needle) => !body.includes(needle));
		if (missing.length) return fail(id, label, `${path} missing ${missing.join(', ')}.`);
		return pass(id, label, `${path} contained expected markers.`);
	} catch (error) {
		return fail(id, label, error instanceof Error ? error.message : String(error));
	}
}

function checkHeader(
	headers: Headers,
	name: string,
	expected: string | RegExp,
	problems: string[]
): void {
	const value = headers.get(name);
	if (!value) {
		problems.push(`${name} missing`);
		return;
	}
	if (typeof expected === 'string' ? value !== expected : !expected.test(value)) {
		problems.push(`${name} unexpected: ${value}`);
	}
}

async function checkSecurityHeaders(
	fetcher: typeof fetch,
	baseUrl: string,
	timeoutMs: number
): Promise<DeploySmokeResult> {
	const label = 'Root response has baseline security headers';
	try {
		const response = await fetchWithTimeout(fetcher, joinUrl(baseUrl, '/'), timeoutMs);
		if (!response.ok) {
			return fail('SMOKE-SECURITY-001', label, `/ returned HTTP ${response.status}.`);
		}

		const problems: string[] = [];
		checkHeader(response.headers, 'Content-Security-Policy', /frame-ancestors 'none'/u, problems);
		checkHeader(response.headers, 'X-Content-Type-Options', X_CONTENT_TYPE_OPTIONS, problems);
		checkHeader(response.headers, 'Referrer-Policy', REFERRER_POLICY, problems);
		checkHeader(response.headers, 'X-Frame-Options', X_FRAME_OPTIONS, problems);
		checkHeader(response.headers, 'Permissions-Policy', PERMISSIONS_POLICY, problems);

		if (new URL(baseUrl).protocol === 'https:') {
			checkHeader(
				response.headers,
				'Strict-Transport-Security',
				STRICT_TRANSPORT_SECURITY,
				problems
			);
		}

		if (problems.length) return fail('SMOKE-SECURITY-001', label, problems.join('; '));
		return pass('SMOKE-SECURITY-001', label, 'Baseline headers present.');
	} catch (error) {
		return fail(
			'SMOKE-SECURITY-001',
			label,
			error instanceof Error ? error.message : String(error)
		);
	}
}

export async function runDeploySmoke(options: DeploySmokeOptions): Promise<{
	results: DeploySmokeResult[];
	exitCode: number;
}> {
	const fetcher = options.fetcher ?? fetch;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const baseUrl = options.baseUrl.replace(/\/+$/u, '');
	const results: DeploySmokeResult[] = [];

	results.push(
		await checkJsonOk(
			fetcher,
			baseUrl,
			'/healthz',
			'SMOKE-HEALTH-001',
			'Health endpoint',
			timeoutMs
		)
	);
	if (options.skipReadyz) {
		results.push(skip('SMOKE-READY-001', 'Readiness endpoint', 'Skipped by --skip-readyz.'));
	} else {
		results.push(
			await checkJsonOk(
				fetcher,
				baseUrl,
				'/readyz',
				'SMOKE-READY-001',
				'Readiness endpoint',
				timeoutMs
			)
		);
	}
	results.push(
		await checkTextIncludes(
			fetcher,
			baseUrl,
			'/sitemap.xml',
			'SMOKE-SITEMAP-001',
			'Sitemap endpoint',
			['<?xml', '<urlset'],
			timeoutMs
		)
	);
	results.push(
		await checkTextIncludes(
			fetcher,
			baseUrl,
			'/robots.txt',
			'SMOKE-ROBOTS-001',
			'Robots endpoint',
			['User-agent: *', 'Sitemap:'],
			timeoutMs
		)
	);
	results.push(
		await checkTextIncludes(
			fetcher,
			baseUrl,
			'/contact',
			'SMOKE-CONTACT-001',
			'Contact page GET',
			['<form', 'Contact'],
			timeoutMs
		)
	);
	results.push(await checkSecurityHeaders(fetcher, baseUrl, timeoutMs));

	return {
		results,
		exitCode: results.some((item) => item.status === 'fail') ? 1 : 0,
	};
}

export function parseArgs(
	argv: readonly string[],
	env: NodeJS.ProcessEnv = process.env
): CliOptions {
	const options: CliOptions = {
		baseUrl: env.DEPLOY_SMOKE_URL,
		skipReadyz: env.DEPLOY_SMOKE_SKIP_READYZ === 'true',
		timeoutMs: Number(env.DEPLOY_SMOKE_TIMEOUT_MS ?? 10_000),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--url') {
			options.baseUrl = argv[index + 1];
			index += 1;
		} else if (arg.startsWith('--url=')) {
			options.baseUrl = arg.slice('--url='.length);
		} else if (arg === '--skip-readyz') {
			options.skipReadyz = true;
		} else if (arg === '--timeout-ms') {
			options.timeoutMs = Number(argv[index + 1]);
			index += 1;
		} else if (arg.startsWith('--timeout-ms=')) {
			options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
		} else {
			throw new Error(`Unknown deploy:smoke option: ${arg}`);
		}
	}

	if (!options.baseUrl) {
		throw new Error('Missing URL. Use bun run deploy:smoke -- --url https://example.com.');
	}
	new URL(options.baseUrl);
	if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
		throw new Error('Timeout must be a positive number of milliseconds.');
	}
	return options;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	try {
		const options = parseArgs(argv);
		const { results, exitCode } = await runDeploySmoke({
			baseUrl: options.baseUrl!,
			skipReadyz: options.skipReadyz,
			timeoutMs: options.timeoutMs,
		});
		for (const item of results) {
			const prefix = item.status === 'pass' ? 'OK  ' : item.status === 'skip' ? 'SKIP' : 'FAIL';
			console[item.status === 'fail' ? 'error' : 'log'](
				`${prefix} ${item.id} ${item.label}: ${item.detail}`
			);
		}
		if (exitCode === 0) console.log('\ndeploy:smoke passed.\n');
		else console.error('\ndeploy:smoke failed.\n');
		return exitCode;
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
