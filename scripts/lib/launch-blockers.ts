import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';
import ts from 'typescript';

import type { LaunchErrorCode } from './errors';
import { type EnvMap, readEnv } from './env-file';
import { runCheckProject } from '../check-project';
import { evaluateRoutePolicyCoverage } from './route-scanner';
import {
	readAutomationProviderConfig,
	validateAutomationProviderConfig,
} from '../../src/lib/server/automation/providers';

export type LaunchBlockerStatus = 'pass' | 'warn' | 'fail';
export type LaunchBlockerSeverity = 'required' | 'recommended';
export type LaunchEnvSource = 'dev' | 'prod';

export type LaunchBlockerResult = {
	status: LaunchBlockerStatus;
	detail?: string;
};

export type LaunchBlockerCheckContext = {
	rootDir?: string;
	envSource?: LaunchEnvSource;
	env?: NodeJS.ProcessEnv;
	devEnvPath?: string;
	prodEnvPath?: string;
};

export type LaunchBlocker = {
	id: LaunchErrorCode;
	label: string;
	severity: LaunchBlockerSeverity;
	check: (context?: LaunchBlockerCheckContext) => Promise<LaunchBlockerResult>;
	fixHint: string;
	docsPath?: string;
};

export type LaunchBlockerEvaluation = LaunchBlockerResult & {
	id: LaunchErrorCode;
	label: string;
	severity: LaunchBlockerSeverity;
	fixHint: string;
	docsPath?: string;
};

type EnvReference =
	| {
			ok: true;
			env: EnvMap;
			label: string;
	  }
	| {
			ok: false;
			detail: string;
	  };

const DEFAULT_ROOT_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TEMPLATE_PACKAGE_NAME = 'tmpl-svelte-app';
const TEMPLATE_OG_SHA256 = 'e0597a81489d31513a5488151287ec107ae9deabf6b0c99399643e6bdbf587ab';
const DEFAULT_PROD_ENV_CANDIDATES = [
	'.env.production',
	'.env.prod',
	'production.env',
	'deploy/.env.production',
	'deploy/production.env',
] as const;
const PROD_ENV_PATH_ENV_KEYS = ['LAUNCH_PROD_ENV_FILE', 'PRODUCTION_ENV_FILE', 'DEPLOY_ENV_FILE'];
const PROCESS_ENV_FALLBACK_KEYS = [
	'ORIGIN',
	'PUBLIC_SITE_URL',
	'BACKUP_REMOTE',
	'POSTMARK_SERVER_TOKEN',
] as const;
const SITE_TITLE_PLACEHOLDERS = new Set([
	'',
	TEMPLATE_PACKAGE_NAME,
	'Your Site Name',
	'[Site Title]',
	'[Site Name]',
]);
const HTML_TITLE_PLACEHOLDERS = SITE_TITLE_PLACEHOLDERS;
const FORBIDDEN_PROD_HOSTS = new Set([
	'localhost',
	'127.0.0.1',
	'0.0.0.0',
	'example.com',
	'example.org',
	'example.net',
]);

function rootDirFrom(context?: LaunchBlockerCheckContext): string {
	return resolve(context?.rootDir ?? DEFAULT_ROOT_DIR);
}

function envSourceFrom(context?: LaunchBlockerCheckContext): LaunchEnvSource {
	return context?.envSource ?? 'prod';
}

function resolveWithin(rootDir: string, path: string): string {
	return resolve(rootDir, path);
}

function displayPath(rootDir: string, path: string): string {
	const relativePath = relative(rootDir, path);
	return relativePath && !relativePath.startsWith('..') ? relativePath : path;
}

function readText(rootDir: string, path: string): string | null {
	const absolutePath = resolveWithin(rootDir, path);
	if (!existsSync(absolutePath)) return null;
	return readFileSync(absolutePath, 'utf8');
}

function parseEnvReference(path: string, rootDir: string): EnvReference {
	try {
		return {
			ok: true,
			env: readEnv(path),
			label: displayPath(rootDir, path),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			detail: `${displayPath(rootDir, path)} could not be parsed: ${message}`,
		};
	}
}

function candidateProdEnvPaths(rootDir: string, context?: LaunchBlockerCheckContext): string[] {
	const paths = new Set<string>();
	if (context?.prodEnvPath) paths.add(resolveWithin(rootDir, context.prodEnvPath));

	const env = context?.env ?? process.env;
	for (const key of PROD_ENV_PATH_ENV_KEYS) {
		const value = env[key]?.trim();
		if (value) paths.add(resolveWithin(rootDir, value));
	}

	for (const candidate of DEFAULT_PROD_ENV_CANDIDATES) {
		paths.add(resolveWithin(rootDir, candidate));
	}

	return [...paths];
}

function readLaunchEnv(context?: LaunchBlockerCheckContext): EnvReference {
	const rootDir = rootDirFrom(context);
	const envSource = envSourceFrom(context);
	const env = context?.env ?? process.env;

	if (envSource === 'dev') {
		const devEnvPath = resolveWithin(rootDir, context?.devEnvPath ?? '.env');
		if (!existsSync(devEnvPath)) {
			return {
				ok: false,
				detail: `${displayPath(rootDir, devEnvPath)} is missing; run ./bootstrap to generate local defaults.`,
			};
		}
		return parseEnvReference(devEnvPath, rootDir);
	}

	const prodPaths = candidateProdEnvPaths(rootDir, context);
	const prodEnvPath = prodPaths.find((path) => existsSync(path));
	if (prodEnvPath) return parseEnvReference(prodEnvPath, rootDir);

	if (PROCESS_ENV_FALLBACK_KEYS.some((key) => env[key]?.trim())) {
		return {
			ok: true,
			env: Object.fromEntries(
				PROCESS_ENV_FALLBACK_KEYS.map((key) => [key, env[key] ?? ''])
			) as EnvMap,
			label: 'process environment',
		};
	}

	return {
		ok: false,
		detail: `no production env file found at ${prodPaths
			.map((path) => displayPath(rootDir, path))
			.join(', ')}`,
	};
}

function result(status: LaunchBlockerStatus, detail: string): LaunchBlockerResult {
	return { status, detail };
}

function pass(detail: string): LaunchBlockerResult {
	return result('pass', detail);
}

function fail(detail: string): LaunchBlockerResult {
	return result('fail', detail);
}

function warn(detail: string): LaunchBlockerResult {
	return result('warn', detail);
}

function propertyNameText(name: ts.PropertyName): string | null {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
		return name.text;
	}
	return null;
}

function stringLiteralValue(expression: ts.Expression): string | null {
	if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
		return expression.text;
	}
	return null;
}

function parseSiteDefaultTitle(sourceText: string): string | null {
	const source = ts.createSourceFile('site.ts', sourceText, ts.ScriptTarget.Latest, true);
	let defaultTitle: string | null = null;

	function visit(node: ts.Node): void {
		if (defaultTitle !== null) return;
		if (ts.isPropertyAssignment(node) && propertyNameText(node.name) === 'defaultTitle') {
			defaultTitle = stringLiteralValue(node.initializer);
			return;
		}
		ts.forEachChild(node, visit);
	}

	visit(source);
	return defaultTitle;
}

function isPlaceholderTitle(value: string): boolean {
	return SITE_TITLE_PLACEHOLDERS.has(value.trim());
}

async function checkOgDefault(context?: LaunchBlockerCheckContext): Promise<LaunchBlockerResult> {
	const rootDir = rootDirFrom(context);
	const path = resolveWithin(rootDir, 'static/og-default.png');
	if (!existsSync(path)) {
		return fail('static/og-default.png is missing; add a real 1200x630 PNG before launch.');
	}

	const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
	if (hash === TEMPLATE_OG_SHA256) {
		return fail('static/og-default.png is still the template placeholder.');
	}

	return pass('static/og-default.png differs from the template placeholder.');
}

async function checkSeoTitle(context?: LaunchBlockerCheckContext): Promise<LaunchBlockerResult> {
	const rootDir = rootDirFrom(context);
	const siteConfig = readText(rootDir, 'src/lib/config/site.ts');
	if (siteConfig === null) {
		return fail('src/lib/config/site.ts is missing; restore it and set site.defaultTitle.');
	}

	const defaultTitle = parseSiteDefaultTitle(siteConfig);
	if (defaultTitle === null) {
		return fail('src/lib/config/site.ts site.defaultTitle could not be parsed.');
	}

	if (isPlaceholderTitle(defaultTitle)) {
		return fail(
			`src/lib/config/site.ts site.defaultTitle is "${defaultTitle || '(empty)'}"; replace it with the real page title.`
		);
	}

	return pass(`site.defaultTitle is "${defaultTitle}".`);
}

function cmsRepoFromConfig(config: string): string | null {
	const parsed = parseYaml(config) as unknown;
	if (!parsed || typeof parsed !== 'object') return null;
	const backend = (parsed as { backend?: unknown }).backend;
	if (!backend || typeof backend !== 'object') return null;
	const repo = (backend as { repo?: unknown }).repo;
	return typeof repo === 'string' ? repo.trim() : null;
}

function cmsRepoLooksPlaceholder(repo: string): boolean {
	const normalized = repo.trim();
	if (!normalized) return true;
	if (/<[^>]+>/u.test(normalized)) return true;
	if (/replace|placeholder|example/iu.test(normalized)) return true;
	if (
		/^(?:owner|your[-_]?owner|your[-_]?org)\/(?:repo|repo-name|your[-_]?repo|project)$/iu.test(
			normalized
		)
	) {
		return true;
	}
	return false;
}

async function checkCmsRepo(context?: LaunchBlockerCheckContext): Promise<LaunchBlockerResult> {
	const rootDir = rootDirFrom(context);
	const config = readText(rootDir, 'static/admin/config.yml');
	if (config === null) {
		return fail('static/admin/config.yml is missing; restore it and set backend.repo.');
	}

	let repo: string | null;
	try {
		repo = cmsRepoFromConfig(config);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return fail(`static/admin/config.yml could not be parsed: ${message}`);
	}

	if (repo === null) {
		return fail('static/admin/config.yml backend.repo is missing; set it to <owner>/<repo>.');
	}

	if (cmsRepoLooksPlaceholder(repo)) {
		return fail(
			`static/admin/config.yml backend.repo is "${repo || '(empty)'}"; replace before deploy.`
		);
	}

	return pass(`static/admin/config.yml backend.repo is "${repo}".`);
}

function hostIsForbiddenForProd(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return (
		FORBIDDEN_PROD_HOSTS.has(normalized) ||
		normalized.endsWith('.localhost') ||
		normalized.endsWith('.local')
	);
}

function localhostUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname.toLowerCase());
	} catch {
		return false;
	}
}

function checkUrlEnvVar(
	name: 'ORIGIN' | 'PUBLIC_SITE_URL',
	context?: LaunchBlockerCheckContext
): LaunchBlockerResult {
	const envSource = envSourceFrom(context);
	const reference = readLaunchEnv(context);
	const missingStatus = envSource === 'prod' ? fail : warn;

	if (!reference.ok) {
		return missingStatus(`${name} could not be checked: ${reference.detail}.`);
	}

	const value = reference.env[name]?.trim();
	if (!value) {
		return missingStatus(`${name} is missing from ${reference.label}.`);
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return missingStatus(`${name}="${value}" in ${reference.label} is not a valid URL.`);
	}

	if (envSource === 'dev') {
		if (localhostUrl(value)) {
			return warn(`${name}="${value}" in ${reference.label}; localhost is expected for local dev.`);
		}
		return pass(`${name} is set in ${reference.label}.`);
	}

	if (parsed.protocol !== 'https:') {
		return fail(`${name}="${value}" in ${reference.label} must use https: for production.`);
	}

	if (hostIsForbiddenForProd(parsed.hostname)) {
		return fail(`${name}="${value}" in ${reference.label} is not a production hostname.`);
	}

	return pass(`${name} is production-shaped in ${reference.label}.`);
}

async function checkOrigin(context?: LaunchBlockerCheckContext): Promise<LaunchBlockerResult> {
	return checkUrlEnvVar('ORIGIN', context);
}

async function checkPublicSiteUrl(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	return checkUrlEnvVar('PUBLIC_SITE_URL', context);
}

async function checkAppHtmlTitle(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	const rootDir = rootDirFrom(context);
	const appHtml = readText(rootDir, 'src/app.html');
	if (appHtml === null) {
		return fail('src/app.html is missing; restore the app shell before launch.');
	}

	const titleMatch = appHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
	if (!titleMatch) {
		return pass('src/app.html has no static <title>; route SEO controls document titles.');
	}

	const title = titleMatch[1].replace(/\s+/gu, ' ').trim();
	if (HTML_TITLE_PLACEHOLDERS.has(title)) {
		return fail(`src/app.html <title> is "${title || '(empty)'}"; replace the fallback title.`);
	}

	return pass(`src/app.html <title> is "${title}".`);
}

function checkOptionalProdEnvVar(
	name: 'BACKUP_REMOTE' | 'POSTMARK_SERVER_TOKEN',
	missingDetail: string,
	context?: LaunchBlockerCheckContext
): LaunchBlockerResult {
	const reference = readLaunchEnv(context);
	if (!reference.ok) {
		return warn(`${missingDetail} ${reference.detail}.`);
	}

	if (!reference.env[name]?.trim()) {
		return warn(`${missingDetail} ${name} is missing from ${reference.label}.`);
	}

	return pass(`${name} is set in ${reference.label}.`);
}

async function checkBackupRemote(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	return checkOptionalProdEnvVar('BACKUP_REMOTE', 'Off-host backups are not configured:', context);
}

async function checkPostmarkToken(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	return checkOptionalProdEnvVar(
		'POSTMARK_SERVER_TOKEN',
		'Production email is not configured:',
		context
	);
}

async function checkAutomationProvider(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	const reference = readLaunchEnv(context);
	if (!reference.ok) return fail(reference.detail);

	const config = readAutomationProviderConfig(reference.env as NodeJS.ProcessEnv);
	const problems = validateAutomationProviderConfig(config);

	if (problems.length > 0) {
		const head =
			config.provider === 'console'
				? 'AUTOMATION_PROVIDER=console is for development only.'
				: `AUTOMATION_PROVIDER=${config.provider} is incomplete in ${reference.label}:`;
		return fail(`${head} ${problems.map((p) => p.message).join(' ')}`);
	}

	if (config.provider === 'noop') {
		return pass(`AUTOMATION_PROVIDER=noop in ${reference.label} — automation explicitly disabled.`);
	}

	if (config.provider === 'console') {
		// validateAutomationProviderConfig already flagged this above; the early
		// return narrows the union for TypeScript before the auth-mode access.
		return pass(
			`AUTOMATION_PROVIDER=console in ${reference.label} — dev-only mode (use noop in production).`
		);
	}

	const auth =
		config.authMode === 'hmac' ? 'HMAC body signing' : `Header auth (${config.authHeader})`;
	return pass(`AUTOMATION_PROVIDER=${config.provider} configured in ${reference.label} (${auth}).`);
}

async function checkProjectManifestDrift(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	const rootDir = rootDirFrom(context);
	const result = runCheckProject(rootDir);
	if (result.exitCode !== 0) {
		const details = [...result.errors, ...result.driftFiles].slice(0, 4).join(', ');
		return fail(`site.project.json is invalid or generated files drifted: ${details}`);
	}
	return pass('site.project.json is valid and generated files are in sync.');
}

async function checkRoutePolicyCoverage(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerResult> {
	const rootDir = rootDirFrom(context);
	const result = evaluateRoutePolicyCoverage(rootDir);
	if (result.issues.length > 0) {
		const details = result.issues
			.slice(0, 4)
			.map((issue) => `${issue.path}: ${issue.message}`)
			.join(', ');
		return fail(`Route policy coverage failed: ${details}`);
	}
	return pass(`${result.routes.length} SvelteKit routes have explicit route policies.`);
}

export const LAUNCH_BLOCKERS: LaunchBlocker[] = [
	{
		id: 'LAUNCH-PROJECT-001',
		label: 'Project manifest drift is present',
		severity: 'required',
		check: checkProjectManifestDrift,
		fixHint: 'NEXT: Run bun run init:site -- --write, then re-run bun run project:check.',
		docsPath: 'docs/getting-started.md',
	},
	{
		id: 'LAUNCH-ROUTES-001',
		label: 'Route policy coverage is incomplete',
		severity: 'required',
		check: checkRoutePolicyCoverage,
		fixHint: 'NEXT: Add missing route policies in src/lib/seo/route-policy.ts.',
		docsPath: 'docs/seo/page-contract.md',
	},
	{
		id: 'LAUNCH-OG-001',
		label: 'Default OG image is still the template asset',
		severity: 'required',
		check: checkOgDefault,
		fixHint:
			'NEXT: Run bun run assets:generate-og or replace static/og-default.png with a real 1200x630 PNG.',
		docsPath: 'docs/seo/launch-checklist.md',
	},
	{
		id: 'LAUNCH-SEO-001',
		label: 'Default SEO title is still a placeholder',
		severity: 'required',
		check: checkSeoTitle,
		fixHint: 'NEXT: Replace site.defaultTitle in src/lib/config/site.ts.',
		docsPath: 'docs/seo/page-contract.md',
	},
	{
		id: 'LAUNCH-CMS-001',
		label: 'CMS backend repository is still a placeholder',
		severity: 'required',
		check: checkCmsRepo,
		fixHint: 'NEXT: Replace backend.repo in static/admin/config.yml.',
		docsPath: 'docs/cms/README.md',
	},
	{
		id: 'LAUNCH-ENV-001',
		label: 'ORIGIN points to localhost',
		severity: 'required',
		check: checkOrigin,
		fixHint: 'NEXT: Set ORIGIN to the production HTTPS origin.',
		docsPath: 'docs/deployment/secrets.md',
	},
	{
		id: 'LAUNCH-ENV-002',
		label: 'PUBLIC_SITE_URL points to localhost',
		severity: 'required',
		check: checkPublicSiteUrl,
		fixHint: 'NEXT: Set PUBLIC_SITE_URL to the production HTTPS URL.',
		docsPath: 'docs/deployment/secrets.md',
	},
	{
		id: 'LAUNCH-APPHTML-001',
		label: 'HTML shell title is still the template fallback',
		severity: 'required',
		check: checkAppHtmlTitle,
		fixHint: 'NEXT: Replace the fallback <title> in src/app.html.',
		docsPath: 'docs/seo/page-contract.md',
	},
	{
		id: 'LAUNCH-BACKUP-001',
		label: 'Production backup config is missing',
		severity: 'recommended',
		check: checkBackupRemote,
		fixHint: 'NEXT: Configure BACKUP_REMOTE before launch or document the backup waiver.',
		docsPath: 'docs/operations/backups.md',
	},
	{
		id: 'LAUNCH-AUTOMATION-001',
		label: 'Automation provider is configured for production',
		severity: 'required',
		check: checkAutomationProvider,
		fixHint:
			'NEXT: Set N8N_WEBHOOK_URL/SECRET (default), or AUTOMATION_PROVIDER=noop to explicitly disable automation.',
		docsPath: 'docs/automations/n8n-workflow-contract.md',
	},
	{
		id: 'LAUNCH-EMAIL-001',
		label: 'Contact form is still console-only',
		severity: 'recommended',
		check: checkPostmarkToken,
		fixHint: 'NEXT: Set POSTMARK_SERVER_TOKEN and contact email env vars for production email.',
		docsPath: 'docs/design-system/forms-guide.md',
	},
];

export async function evaluateLaunchBlockers(
	context?: LaunchBlockerCheckContext
): Promise<LaunchBlockerEvaluation[]> {
	return Promise.all(
		LAUNCH_BLOCKERS.map(async (blocker) => ({
			id: blocker.id,
			label: blocker.label,
			severity: blocker.severity,
			fixHint: blocker.fixHint,
			docsPath: blocker.docsPath,
			...(await blocker.check(context)),
		}))
	);
}
