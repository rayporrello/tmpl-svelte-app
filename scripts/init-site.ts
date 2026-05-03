#!/usr/bin/env bun
/**
 * Project initializer.
 *
 * Durable contract: site.project.json.
 *
 * Modes:
 *   bun run init:site -- --check  Validate manifest + generated file drift.
 *   bun run init:site -- --write  Generate owned files from site.project.json.
 *   bun run init:site             Compatibility prompt/stdin flow; writes manifest,
 *                                  then generates owned files from it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
	applyProjectUpdates,
	evaluateProjectManifest,
	manifestFromAnswers,
	plannedProjectUpdates,
	readProjectManifest,
	SITE_PROJECT_PATH,
	writeProjectManifest,
	type InitSiteAnswers,
	type SiteProjectManifest,
} from './lib/site-project';

const ROOT = resolve(import.meta.dir, '..');

type Mode = 'prompt' | 'check' | 'write';

function usage(): string {
	return `Usage: bun run init:site -- [--check|--write]

--check  Validate ${SITE_PROJECT_PATH} and report generated-file drift.
--write  Update generated files from ${SITE_PROJECT_PATH}.

With no flag, init:site keeps the legacy interactive/stdin prompts, writes
${SITE_PROJECT_PATH}, then applies the same generated-file update path.
`;
}

function parseMode(argv: readonly string[]): Mode {
	if (argv.includes('--help') || argv.includes('-h')) {
		console.log(usage());
		process.exit(0);
	}
	const unknown = argv.filter((arg) => !['--check', '--write'].includes(arg));
	if (unknown.length) throw new Error(`Unknown init:site option: ${unknown.join(', ')}`);
	if (argv.includes('--check') && argv.includes('--write')) {
		throw new Error('Choose only one of --check or --write.');
	}
	if (argv.includes('--check')) return 'check';
	if (argv.includes('--write')) return 'write';
	return 'prompt';
}

function readFile(rel: string): string {
	const abs = resolve(ROOT, rel);
	if (!existsSync(abs)) return '';
	return readFileSync(abs, 'utf8');
}

const PLACEHOLDER_VALUES = new Set([
	'tmpl-svelte-app',
	'Your Site Name',
	'https://example.com',
	'example.com',
	'owner',
	'repo-name',
	'owner/repo-name',
	'project',
	'<owner>',
	'<name>',
	'<project>',
	'REPLACE PER PROJECT',
	'[Site Title]',
	'[Site Name]',
	'[Year]',
	'support@example.com',
	'A short description of what this site is about.',
]);

function isPlaceholder(value: string | null | undefined): boolean {
	const normalized = value?.trim();
	if (!normalized) return true;
	if (/^<[^>]+>$/u.test(normalized) || /^\[[^\]]+\]$/u.test(normalized)) return true;
	return PLACEHOLDER_VALUES.has(normalized);
}

function defaultFromCurrent(currentValue: string, fallback: string): string {
	return isPlaceholder(currentValue) ? fallback : currentValue;
}

function extractJsonField(content: string, field: string): string {
	const m = content.match(new RegExp(`"${field}":\\s*"([^"]+)"`, 'u'));
	return m?.[1] ?? '';
}

function extractSiteField(content: string, field: string): string {
	const m = content.match(new RegExp(`${field}:\\s*'([^']+)'`, 'u'));
	return m?.[1] ?? '';
}

function extractThemeColor(content: string): string {
	const m = content.match(/<meta name="theme-color" content="([^"]+)"/u);
	return m?.[1] ?? '#0B1120';
}

function extractCaddyDomain(content: string): string {
	const m = content.match(/^([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\s*\{/mu);
	return m?.[1] ?? 'example.com';
}

function extractQuadletImage(content: string): string {
	const m = content.match(/^Image=ghcr\.io\/([^/]+)\/([^:]+):/mu);
	if (m) return `${m[1]}/${m[2]}`;
	return 'owner/repo-name';
}

function extractQuadletProject(content: string): string {
	const m = content.match(/^EnvironmentFile=%h\/secrets\/([^.]+)\.prod\.env/mu);
	return m?.[1] ?? 'project';
}

function answersFromManifest(manifest: SiteProjectManifest): InitSiteAnswers {
	return {
		packageName: manifest.project.packageName,
		siteName: manifest.site.name,
		siteUrl: manifest.site.productionUrl,
		description: manifest.site.defaultDescription,
		ghOwner: manifest.project.githubOwner,
		ghRepo: manifest.project.githubRepo,
		contactEmail: manifest.site.supportEmail,
		project: manifest.project.projectSlug,
		domain: manifest.site.productionDomain,
		shortName: manifest.site.pwaShortName,
		themeColor: manifest.site.themeColor,
	};
}

function currentAnswers(): InitSiteAnswers {
	try {
		return answersFromManifest(readProjectManifest(ROOT));
	} catch {
		const pkgJson = readFile('package.json');
		const siteTs = readFile('src/lib/config/site.ts');
		const caddyfile = readFile('deploy/Caddyfile.example');
		const quadlet = readFile('deploy/quadlets/web.container');
		const appHtml = readFile('src/app.html');
		const currentQuadletImage = extractQuadletImage(quadlet);
		const [currentOwner = 'owner', currentRepo = 'repo-name'] = currentQuadletImage.split('/');
		return {
			packageName: extractJsonField(pkgJson, 'name'),
			siteName: extractSiteField(siteTs, 'name'),
			siteUrl: extractSiteField(siteTs, 'url'),
			description: extractSiteField(siteTs, 'defaultDescription'),
			ghOwner: currentOwner,
			ghRepo: currentRepo,
			contactEmail: extractSiteField(siteTs, 'email'),
			project: extractQuadletProject(quadlet),
			domain: extractCaddyDomain(caddyfile),
			shortName: '',
			themeColor: extractThemeColor(appHtml),
		};
	}
}

let pipedLines: string[] | null = null;
let pipedIndex = 0;
let rl: ReturnType<typeof createInterface> | null = null;

async function initInput(): Promise<void> {
	if (process.stdin.isTTY) {
		rl = createInterface({ input: process.stdin, output: process.stdout });
		return;
	}
	const input = createInterface({ input: process.stdin });
	pipedLines = [];
	input.on('line', (line) => pipedLines!.push(line.trim()));
	await new Promise<void>((resolvePromise) => input.once('close', resolvePromise));
	input.close();
}

function closeInput(): void {
	rl?.close();
	rl = null;
}

function ask(question: string, defaultValue: string): Promise<string> {
	const display = defaultValue ? ` [${defaultValue}]` : '';
	if (pipedLines !== null) {
		const answer = pipedLines[pipedIndex++] ?? '';
		console.log(`${question}${display}: ${answer || '(default)'}`);
		return Promise.resolve(answer || defaultValue);
	}
	return new Promise((resolvePromise) => {
		rl!.question(`${question}${display}: `, (answer) => {
			resolvePromise(answer.trim() || defaultValue);
		});
	});
}

async function promptForManifest(): Promise<SiteProjectManifest> {
	await initInput();
	console.log('\ninit:site — create/update site.project.json and generated project files');
	console.log('Press Enter to keep the current value shown in brackets.\n');

	const current = currentAnswers();
	const packageName = await ask(
		'Package name (package.json "name")',
		defaultFromCurrent(current.packageName, 'my-site')
	);
	const siteName = await ask(
		'Site name (shown in titles and OG tags)',
		defaultFromCurrent(current.siteName, 'My Site')
	);
	const siteUrl = await ask(
		'Production URL (HTTPS, no trailing slash)',
		defaultFromCurrent(current.siteUrl, `https://${packageName}.com`)
	);
	const description = await ask(
		'Default meta description (≤155 chars)',
		defaultFromCurrent(current.description, 'A concise description of this site.')
	);
	const ghOwner = await ask(
		'GitHub owner (username or org)',
		defaultFromCurrent(current.ghOwner, 'my-org')
	);
	const ghRepo = await ask(
		'GitHub repository name',
		defaultFromCurrent(current.ghRepo, packageName)
	);
	const contactEmail = await ask(
		'Support contact email (shown on error pages)',
		defaultFromCurrent(current.contactEmail, `hello@${new URL(siteUrl).hostname}`)
	);
	const project = await ask(
		'Project slug (used for container/Quadlet names)',
		defaultFromCurrent(current.project, packageName.replace(/[^a-z0-9-]/gu, '-'))
	);
	const domain = await ask(
		'Production domain (for Caddyfile)',
		defaultFromCurrent(current.domain, new URL(siteUrl).hostname)
	);
	const shortName = await ask(
		'PWA short name (≤12 chars, for site.webmanifest)',
		defaultFromCurrent(current.shortName, siteName.length <= 12 ? siteName : siteName.split(' ')[0])
	);

	closeInput();
	return manifestFromAnswers({
		packageName,
		siteName,
		siteUrl,
		description,
		ghOwner,
		ghRepo,
		contactEmail,
		project,
		domain,
		shortName,
		themeColor: current.themeColor,
	});
}

function printDrift(updates: readonly { path: string; ownership: string }[]): void {
	for (const update of updates) {
		console.error(`  - ${update.path} (${update.ownership})`);
	}
}

async function runCheck(): Promise<number> {
	const result = evaluateProjectManifest(ROOT);
	if (result.errors.length > 0) {
		console.error(`Invalid ${SITE_PROJECT_PATH}:`);
		for (const error of result.errors) console.error(`  - ${error}`);
		return 1;
	}
	if (result.updates.length > 0) {
		console.error(`${SITE_PROJECT_PATH} drift detected in generated project files:`);
		printDrift(result.updates);
		console.error('\nRun: bun run init:site -- --write');
		return 1;
	}
	console.log(`Project manifest check passed (${SITE_PROJECT_PATH}).`);
	return 0;
}

function runWrite(manifest: SiteProjectManifest): number {
	const updates = plannedProjectUpdates(ROOT, manifest);
	applyProjectUpdates(ROOT, updates);
	if (updates.length === 0) {
		console.log('init:site complete — generated files already matched site.project.json.');
		return 0;
	}
	console.log('init:site complete. Files updated:');
	for (const update of updates) console.log(`  ${update.path}`);
	return 0;
}

async function main(): Promise<number> {
	const mode = parseMode(process.argv.slice(2));
	if (mode === 'check') return await runCheck();
	if (mode === 'write') return runWrite(readProjectManifest(ROOT));

	const manifest = await promptForManifest();
	writeProjectManifest(ROOT, manifest);
	return runWrite(manifest);
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		closeInput();
		console.error('init:site failed:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
