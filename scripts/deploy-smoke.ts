#!/usr/bin/env bun
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import {
	PERMISSIONS_POLICY,
	REFERRER_POLICY,
	STRICT_TRANSPORT_SECURITY,
	X_CONTENT_TYPE_OPTIONS,
	X_FRAME_OPTIONS,
} from '../src/lib/server/security-headers';
import {
	fail as opsFail,
	info as opsInfo,
	pass as opsPass,
	printOpsResults,
	severityToExitCode,
	type OpsResult,
} from './lib/ops-result';

export type DeploySmokeResult = OpsResult;

export type DeploySmokeOptions = {
	baseUrl: string;
	skipReadyz?: boolean;
	fetcher?: typeof fetch;
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
	sql?: postgres.Sql;
	allowPending?: boolean;
};

type CliOptions = {
	baseUrl?: string;
	skipReadyz: boolean;
	timeoutMs: number;
	allowPending: boolean;
};

const TERMINAL_FAILURE_STATUSES = new Set(['dead_letter', 'failed']);

function pass(id: string, summary: string, detail: string): OpsResult {
	return opsPass(id, summary, { detail });
}

function fail(id: string, summary: string, detail: string): OpsResult {
	return opsFail(id, summary, { detail });
}

function skip(id: string, summary: string, detail: string): OpsResult {
	return opsInfo(id, summary, { detail });
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

async function fetchWithTimeoutInit(
	fetcher: typeof fetch,
	url: string,
	init: RequestInit,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetcher(url, { ...init, signal: controller.signal });
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

const E2E_IDS = [
	'SMOKE-E2E-CONFIG-001',
	'SMOKE-E2E-CONFIG-002',
	'SMOKE-E2E-POST-001',
	'SMOKE-E2E-DB-001',
	'SMOKE-E2E-OUTBOX-001',
	'SMOKE-E2E-EMAIL-001',
	'SMOKE-E2E-PRUNE-001',
] as const;

function skippedE2eResults(): OpsResult[] {
	return E2E_IDS.map((id) =>
		skip(id, 'E2E smoke not configured', 'SMOKE_TEST_SECRET is unset for this site.')
	);
}

async function pollUntil<T>(timeoutMs: number, read: () => Promise<T | null>): Promise<T | null> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const value = await read();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return null;
}

async function runE2eSmoke(options: {
	fetcher: typeof fetch;
	baseUrl: string;
	timeoutMs: number;
	env: NodeJS.ProcessEnv;
	sql?: postgres.Sql;
	allowPending: boolean;
}): Promise<OpsResult[]> {
	const secret = options.env.SMOKE_TEST_SECRET?.trim();
	if (!secret) return skippedE2eResults();

	const results: OpsResult[] = [
		pass('SMOKE-E2E-CONFIG-001', 'E2E smoke secret configured', 'SMOKE_TEST_SECRET is set.'),
	];

	if (!options.env.POSTMARK_API_TEST?.trim()) {
		results.push(
			fail(
				'SMOKE-E2E-CONFIG-002',
				'Postmark test token configured',
				'POSTMARK_API_TEST is required when SMOKE_TEST_SECRET is set.'
			)
		);
		return results;
	}
	results.push(
		pass('SMOKE-E2E-CONFIG-002', 'Postmark test token configured', 'POSTMARK_API_TEST is set.')
	);

	const databaseUrl = options.env.DATABASE_URL;
	if (!databaseUrl && !options.sql) {
		results.push(
			fail('SMOKE-E2E-DB-001', 'Smoke database check', 'DATABASE_URL is required for E2E smoke.')
		);
		return results;
	}

	const sql = options.sql ?? postgres(databaseUrl!, { max: 1 });
	const ownsSql = options.sql === undefined;
	let contactId: string | null = null;

	try {
		const body = new URLSearchParams({
			name: 'Deploy Smoke',
			email: 'smoke@example.com',
			message: 'Deploy smoke test submission.',
			website: '',
		});
		const response = await fetchWithTimeoutInit(
			options.fetcher,
			joinUrl(options.baseUrl, '/contact'),
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json',
					'X-Smoke-Test': secret,
				},
				body,
			},
			options.timeoutMs
		);
		const parsed = (await response.json().catch(() => ({}))) as {
			ok?: unknown;
			contact_id?: unknown;
		};
		if (!response.ok || parsed.ok !== true || typeof parsed.contact_id !== 'string') {
			results.push(
				fail(
					'SMOKE-E2E-POST-001',
					'Smoke contact POST',
					`/contact returned HTTP ${response.status} without ok/contact_id JSON.`
				)
			);
			return results;
		}
		contactId = parsed.contact_id;
		results.push(
			pass('SMOKE-E2E-POST-001', 'Smoke contact POST', `Inserted contact ${contactId}.`)
		);

		const contactRows = await sql`
			select is_smoke_test
			from contact_submissions
			where id = ${contactId}
			limit 1
		`;
		if (contactRows[0]?.is_smoke_test !== true) {
			results.push(
				fail('SMOKE-E2E-DB-001', 'Smoke database check', 'Contact row was not tagged smoke.')
			);
			return results;
		}
		results.push(pass('SMOKE-E2E-DB-001', 'Smoke database check', 'Contact row is tagged smoke.'));

		const outbox = await pollUntil(30_000, async () => {
			const rows = await sql`
				select id, status, payload
				from automation_events
				where payload->>'submission_id' = ${contactId}
				order by created_at desc
				limit 1
			`;
			const row = rows[0] as
				| { id: string; status: string; payload: Record<string, unknown> }
				| undefined;
			if (!row) return null;
			if (TERMINAL_FAILURE_STATUSES.has(row.status)) return row;
			if (row.status === 'completed') return row;
			if (row.status === 'pending' && options.allowPending) return row;
			return null;
		});
		if (!outbox) {
			results.push(
				fail(
					'SMOKE-E2E-OUTBOX-001',
					'Smoke outbox status',
					options.allowPending
						? 'Outbox row did not reach completed or pending within 30 seconds.'
						: 'Outbox row did not reach completed within 30 seconds. ' +
								'If the platform fleet worker has not enabled this client yet, rerun with --allow-pending.'
				)
			);
			return results;
		}
		if (TERMINAL_FAILURE_STATUSES.has(outbox.status)) {
			results.push(
				fail(
					'SMOKE-E2E-OUTBOX-001',
					'Smoke outbox status',
					`Outbox ${outbox.id} reached terminal failure status=${outbox.status}; check fleet worker logs and automation_dead_letters.`
				)
			);
			return results;
		}
		if (outbox.status === 'pending') {
			results.push(
				skip(
					'SMOKE-E2E-OUTBOX-001',
					'Smoke outbox status',
					`Outbox ${outbox.id} is pending (worker not yet draining this client); accepted under --allow-pending.`
				)
			);
		} else {
			results.push(
				pass(
					'SMOKE-E2E-OUTBOX-001',
					'Smoke outbox status',
					`Outbox ${outbox.id} reached completed.`
				)
			);
		}

		if (outbox.payload.postmark_test_token_used !== true) {
			results.push(
				fail(
					'SMOKE-E2E-EMAIL-001',
					'Smoke email used Postmark test token',
					'Outbox metadata did not include postmark_test_token_used=true.'
				)
			);
		} else {
			results.push(
				pass(
					'SMOKE-E2E-EMAIL-001',
					'Smoke email used Postmark test token',
					'Outbox metadata recorded postmark_test_token_used=true.'
				)
			);
		}

		const deleted = await sql`
			with deleted as (
				delete from contact_submissions
				where id = ${contactId}
					and is_smoke_test = true
				returning 1
			)
			select count(*)::int as count from deleted
		`;
		const deletedCount = Number(deleted[0]?.count ?? 0);
		if (deletedCount !== 1) {
			results.push(
				fail('SMOKE-E2E-PRUNE-001', 'Smoke row cleanup', 'Smoke contact row was not deleted.')
			);
		} else {
			results.push(pass('SMOKE-E2E-PRUNE-001', 'Smoke row cleanup', 'Smoke contact row deleted.'));
		}

		return results;
	} catch (error) {
		const id = contactId ? 'SMOKE-E2E-OUTBOX-001' : 'SMOKE-E2E-POST-001';
		results.push(
			fail(id, 'E2E smoke failed', error instanceof Error ? error.message : String(error))
		);
		return results;
	} finally {
		if (ownsSql) await sql.end();
	}
}

export async function runDeploySmoke(options: DeploySmokeOptions): Promise<{
	results: OpsResult[];
	exitCode: number;
}> {
	const fetcher = options.fetcher ?? fetch;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const baseUrl = options.baseUrl.replace(/\/+$/u, '');
	const results: DeploySmokeResult[] = [];
	const env = options.env ?? process.env;

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
	results.push(
		...(await runE2eSmoke({
			fetcher,
			baseUrl,
			timeoutMs,
			env,
			sql: options.sql,
			allowPending: options.allowPending ?? false,
		}))
	);

	return {
		results,
		exitCode: severityToExitCode(
			results.some((item) => item.severity === 'fail') ? 'fail' : 'pass'
		),
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
		allowPending: env.DEPLOY_SMOKE_ALLOW_PENDING === 'true',
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
		} else if (arg === '--allow-pending') {
			options.allowPending = true;
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
			allowPending: options.allowPending,
		});
		printOpsResults(results);
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
