#!/usr/bin/env bun
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	NO_STORE_CACHE_CONTROL,
	PERMISSIONS_POLICY,
	REFERRER_POLICY,
	STRICT_TRANSPORT_SECURITY,
	X_CONTENT_TYPE_OPTIONS,
	X_FRAME_OPTIONS,
	applySecurityHeaders,
} from '../src/lib/server/security-headers';

export type SecurityHeaderStatus = 'pass' | 'fail';

export type SecurityHeaderResult = {
	id: string;
	label: string;
	status: SecurityHeaderStatus;
	detail: string;
};

export type SecurityHeaderScenario = {
	label: string;
	url: URL;
	method?: string;
	expectHsts: boolean;
	expectNoStore: boolean;
	expectAdminCsp?: boolean;
};

const DEFAULT_SCENARIOS: SecurityHeaderScenario[] = [
	{
		label: 'public HTTPS page',
		url: new URL('https://example.com/'),
		expectHsts: true,
		expectNoStore: false,
	},
	{
		label: 'public HTTP page',
		url: new URL('http://127.0.0.1:3000/'),
		expectHsts: false,
		expectNoStore: false,
	},
	{
		label: 'Sveltia CMS admin page',
		url: new URL('https://example.com/admin/index.html'),
		expectHsts: true,
		expectNoStore: true,
		expectAdminCsp: true,
	},
	{
		label: 'form action result',
		url: new URL('https://example.com/contact'),
		method: 'POST',
		expectHsts: true,
		expectNoStore: true,
	},
];

function pass(id: string, label: string, detail: string): SecurityHeaderResult {
	return { id, label, status: 'pass', detail };
}

function fail(id: string, label: string, detail: string): SecurityHeaderResult {
	return { id, label, status: 'fail', detail };
}

function requireHeader(
	headers: Headers,
	name: string,
	expected: string | RegExp,
	label: string,
	results: SecurityHeaderResult[]
): void {
	const actual = headers.get(name);
	const id = `SECURITY-${name.toUpperCase().replace(/[^A-Z0-9]+/gu, '-')}`;
	if (!actual) {
		results.push(fail(id, label, `${name} is missing.`));
		return;
	}
	if (typeof expected === 'string' ? actual !== expected : !expected.test(actual)) {
		results.push(fail(id, label, `${name}="${actual}" did not match ${String(expected)}.`));
		return;
	}
	results.push(pass(id, label, `${name} is correct.`));
}

function forbidHeader(
	headers: Headers,
	name: string,
	label: string,
	results: SecurityHeaderResult[]
): void {
	const actual = headers.get(name);
	const id = `SECURITY-${name.toUpperCase().replace(/[^A-Z0-9]+/gu, '-')}-ABSENT`;
	if (actual) {
		results.push(fail(id, label, `${name} should be absent but was "${actual}".`));
		return;
	}
	results.push(pass(id, label, `${name} is absent as expected.`));
}

export function evaluateSecurityHeaders(
	scenarios: readonly SecurityHeaderScenario[] = DEFAULT_SCENARIOS
): SecurityHeaderResult[] {
	const results: SecurityHeaderResult[] = [];

	for (const scenario of scenarios) {
		const headers = new Headers();
		applySecurityHeaders(headers, scenario.url, { method: scenario.method ?? 'GET' });
		const label = scenario.label;

		requireHeader(headers, 'Content-Security-Policy', /default-src 'self'/u, label, results);
		requireHeader(headers, 'Content-Security-Policy', /frame-ancestors 'none'/u, label, results);
		requireHeader(headers, 'X-Content-Type-Options', X_CONTENT_TYPE_OPTIONS, label, results);
		requireHeader(headers, 'Referrer-Policy', REFERRER_POLICY, label, results);
		requireHeader(headers, 'X-Frame-Options', X_FRAME_OPTIONS, label, results);
		requireHeader(headers, 'Permissions-Policy', PERMISSIONS_POLICY, label, results);

		if (scenario.expectHsts) {
			requireHeader(
				headers,
				'Strict-Transport-Security',
				STRICT_TRANSPORT_SECURITY,
				label,
				results
			);
		} else {
			forbidHeader(headers, 'Strict-Transport-Security', label, results);
		}

		if (scenario.expectNoStore) {
			requireHeader(headers, 'Cache-Control', NO_STORE_CACHE_CONTROL, label, results);
		} else if (headers.get('Cache-Control') === NO_STORE_CACHE_CONTROL) {
			results.push(
				fail('SECURITY-CACHE-CONTROL-PUBLIC', label, 'Public cacheable page was marked no-store.')
			);
		} else {
			results.push(pass('SECURITY-CACHE-CONTROL-PUBLIC', label, 'No no-store header required.'));
		}

		const csp = headers.get('Content-Security-Policy') ?? '';
		if (scenario.expectAdminCsp) {
			if (csp.includes('https://unpkg.com') && csp.includes("'unsafe-eval'")) {
				results.push(pass('SECURITY-CSP-ADMIN', label, '/admin CSP allows Sveltia CMS hosts.'));
			} else {
				results.push(
					fail(
						'SECURITY-CSP-ADMIN',
						label,
						'/admin CSP is missing Sveltia CMS allowances for unpkg.com or unsafe-eval.'
					)
				);
			}
		} else if (csp.includes("'unsafe-eval'")) {
			results.push(fail('SECURITY-CSP-PUBLIC', label, 'Public CSP includes unsafe-eval.'));
		} else {
			results.push(pass('SECURITY-CSP-PUBLIC', label, 'Public CSP stays eval-free.'));
		}
	}

	return results;
}

export function runSecurityHeaderCheck(): { results: SecurityHeaderResult[]; exitCode: number } {
	const results = evaluateSecurityHeaders();
	return {
		results,
		exitCode: results.some((result) => result.status === 'fail') ? 1 : 0,
	};
}

export function main(): number {
	const { results, exitCode } = runSecurityHeaderCheck();
	for (const result of results) {
		const prefix = result.status === 'pass' ? 'OK  ' : 'FAIL';
		console[result.status === 'pass' ? 'log' : 'error'](
			`${prefix} ${result.label}: ${result.detail}`
		);
	}

	if (exitCode === 0) console.log('\nSecurity header check passed.\n');
	else console.error('\nSecurity header check failed.\n');
	return exitCode;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(main());
}
