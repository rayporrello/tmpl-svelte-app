#!/usr/bin/env bun
/**
 * Interactive site initializer.
 *
 * Prompts for project-specific values and rewrites all placeholder strings in:
 *   package.json, src/lib/config/site.ts, static/admin/config.yml,
 *   static/site.webmanifest, README.md, .env.example, deploy/env.example,
 *   deploy/Caddyfile.example, deploy/quadlets/web.container,
 *   deploy/quadlets/web.network
 *
 * Idempotent — re-running with the same answers produces identical files.
 * Re-running with different answers applies the new values atomically.
 *
 * Run: bun run init:site
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

const ROOT = resolve(import.meta.dir, '..');

// ── Helpers ────────────────────────────────────────────────────────────────────

function readFile(rel: string): string {
	const abs = resolve(ROOT, rel);
	if (!existsSync(abs)) return '';
	return readFileSync(abs, 'utf-8');
}

function writeFile(rel: string, content: string): void {
	writeFileSync(resolve(ROOT, rel), content, 'utf-8');
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
	if (/^<[^>]+>$/.test(normalized) || /^\[[^\]]+\]$/.test(normalized)) return true;
	return PLACEHOLDER_VALUES.has(normalized);
}

function defaultFromCurrent(currentValue: string, fallback: string): string {
	return isPlaceholder(currentValue) ? fallback : currentValue;
}

// ── Input handling ─────────────────────────────────────────────────────────────
// In piped/non-TTY mode: pre-read all stdin lines upfront, then dequeue per question.
// In interactive TTY mode: use readline.question() for proper terminal UX.

let _pipedLines: string[] | null = null;
let _pipedIndex = 0;
let _rl: ReturnType<typeof createInterface> | null = null;

async function initInput(): Promise<void> {
	if (process.stdin.isTTY) {
		_rl = createInterface({ input: process.stdin, output: process.stdout });
	} else {
		// Piped input: read all lines first, then serve them synchronously per question.
		const rl = createInterface({ input: process.stdin });
		_pipedLines = [];
		rl.on('line', (line) => _pipedLines!.push(line.trim()));
		await new Promise<void>((resolve) => rl.once('close', resolve));
		rl.close();
	}
}

function closeInput(): void {
	if (_rl) {
		_rl.close();
		_rl = null;
	}
}

function ask(question: string, defaultValue: string): Promise<string> {
	const display = defaultValue ? ` [${defaultValue}]` : '';
	if (_pipedLines !== null) {
		// Piped mode: dequeue next line (or use default if exhausted)
		const answer = _pipedLines[_pipedIndex++] ?? '';
		console.log(`${question}${display}: ${answer || '(default)'}`);
		return Promise.resolve(answer || defaultValue);
	}
	// Interactive mode: use readline
	return new Promise((resolve) => {
		_rl!.question(`${question}${display}: `, (answer) => {
			resolve(answer.trim() || defaultValue);
		});
	});
}

// ── Current-value extractors ───────────────────────────────────────────────────
// Each extractor reads the current value from the file so that re-running the
// script shows the current state as the default, enabling true idempotency.

function extractJsonField(content: string, field: string): string {
	const m = content.match(new RegExp(`"${field}":\\s*"([^"]+)"`));
	return m?.[1] ?? '';
}

function extractSiteField(content: string, field: string): string {
	// Matches:   fieldName: 'value',
	const m = content.match(new RegExp(`${field}:\\s*'([^']+)'`));
	return m?.[1] ?? '';
}

function extractCaddyDomain(content: string): string {
	// First non-comment line that looks like a domain
	const m = content.match(/^([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\s*\{/m);
	return m?.[1] ?? 'example.com';
}

function extractQuadletImage(content: string): string {
	// Image=ghcr.io/<owner>/<name>:<sha>
	const m = content.match(/^Image=ghcr\.io\/([^/]+)\/([^:]+):/m);
	if (m) return `${m[1]}/${m[2]}`;
	return 'owner/repo-name';
}

function extractQuadletProject(content: string): string {
	const m = content.match(/^EnvironmentFile=%h\/secrets\/([^.]+)\.prod\.env/m);
	return m?.[1] ?? 'project';
}

// ── Rewrite functions ──────────────────────────────────────────────────────────
// Each function replaces current values with new values (idempotent: no-op if equal).

function rewritePackageJson(content: string, packageName: string): string {
	return content.replace(/"name":\s*"[^"]*"/, `"name": "${packageName}"`);
}

function rewriteSiteTs(
	content: string,
	{
		name,
		url,
		description,
		contactEmail,
	}: { name: string; url: string; description: string; contactEmail: string }
): string {
	let out = content;
	// Replace simple string fields (handles both placeholder and previously-set values)
	out = out.replace(/(name:\s*')[^']*(')/g, (_, a, b) => `${a}${name}${b}`);
	out = out.replace(/(url:\s*')[^']*(')/g, (_, a, b) => `${a}${url}${b}`);
	out = out.replace(/(defaultTitle:\s*')[^']*(')/g, (_, a, b) => `${a}${name}${b}`);
	out = out.replace(/(titleTemplate:\s*')[^']*(')/g, (_, a, b) => `${a}%s — ${name}${b}`);
	out = out.replace(/(defaultDescription:\s*')[^']*(')/g, (_, a, b) => `${a}${description}${b}`);
	// Organization logo URL uses the site URL as base
	const logoUrl = `${url}/images/logo.png`;
	out = out.replace(/(logo:\s*')[^']*(')/g, (_, a, b) => `${a}${logoUrl}${b}`);
	// contact.email
	out = out.replace(/(email:\s*')[^']*(')/g, (_, a, b) => `${a}${contactEmail}${b}`);
	return out;
}

function rewriteConfigYml(content: string, ghRepo: string): string {
	// Replace:  repo: <anything>   # REPLACE...
	// With:     repo: owner/repo
	return content.replace(
		/^(\s*repo:\s*)([^\s#]+)(.*)/m,
		(_, prefix, _old, rest) => `${prefix}${ghRepo}${rest}`
	);
}

function rewriteWebmanifest(content: string, name: string, shortName: string): string {
	try {
		const obj = JSON.parse(content);
		obj.name = name;
		obj.short_name = shortName;
		obj.description = obj.description?.includes('REPLACE PER PROJECT')
			? `${name} — website`
			: obj.description;
		return JSON.stringify(obj, null, 2) + '\n';
	} catch {
		return content;
	}
}

function rewriteReadme(content: string, name: string): string {
	// Replace only the H1 title line
	return content.replace(/^# .+$/m, `# ${name}`);
}

function rewriteEnvExample(content: string, url: string): string {
	let out = content;
	out = out.replace(/^ORIGIN=.*/m, `ORIGIN=${url}`);
	out = out.replace(/^PUBLIC_SITE_URL=.*/m, `PUBLIC_SITE_URL=${url}`);
	return out;
}

function rewriteDeployEnvExample(content: string, url: string, project: string): string {
	let out = content;
	out = out.replace(/^ORIGIN=.*/m, `ORIGIN=${url}`);
	out = out.replace(/^PUBLIC_SITE_URL=.*/m, `PUBLIC_SITE_URL=${url}`);
	out = out.replace(/<project>/g, project);
	return out;
}

function rewriteCaddyfile(content: string, domain: string): string {
	// Replace the apex domain block name and the www redirect target
	const apex = domain.replace(/^www\./, '');
	let out = content;
	out = out.replace(
		'Replace example.com with the real domain before use.',
		`Configured for ${apex}.`
	);
	// Replace www redirect block
	out = out.replace(/^www\.[a-z0-9][a-z0-9.-]+\.[a-z]{2,}\s*\{/gm, `www.${apex} {`);
	// Replace domain block headers (lines that are exactly "<domain> {")
	out = out.replace(/^(?!www\.)([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\s*\{/gm, `${apex} {`);
	// Replace redir target inside www block
	out = out.replace(
		/(redir https:\/\/)[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\{uri\} permanent)/,
		`$1${apex}$2`
	);
	return out;
}

function rewriteQuadlet(
	content: string,
	{ owner, repo, project }: { owner: string; repo: string; project: string }
): string {
	let out = content;
	out = out.replace(/<unit-name>/g, `${project}-web`);
	out = out.replace(/<owner>/g, owner);
	out = out.replace(/<name>/g, repo);
	out = out.replace(/<project>/g, project);
	// Image line: Image=ghcr.io/<owner>/<name>:<sha>
	out = out.replace(
		/^(Image=ghcr\.io\/)([^/]+)\/([^:]+)(:.*)$/m,
		(_, prefix, _o, _r, suffix) => `${prefix}${owner}/${repo}${suffix}`
	);
	// EnvironmentFile path
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^.]+)(\.prod\.env)$/m,
		(_, prefix, _p, suffix) => `${prefix}${project}${suffix}`
	);
	// Network= line
	out = out.replace(
		/^(Network=)([^.]+)(\.network)$/m,
		(_, prefix, _p, suffix) => `${prefix}${project}${suffix}`
	);
	// HostName= line
	out = out.replace(
		/^(HostName=)([^-\n]+)(-web)$/m,
		(_, prefix, _p, suffix) => `${prefix}${project}${suffix}`
	);
	// Description line
	out = out.replace(
		/^(Description=SvelteKit web app — )(.+)$/m,
		(_, prefix) => `${prefix}${project}`
	);
	return out;
}

function rewriteQuadletNetwork(content: string, project: string): string {
	let out = content;
	out = out.replace(/<project>/g, project);
	out = out.replace(
		/^(Description=Project network — )(.+)$/m,
		(_, prefix) => `${prefix}${project}`
	);
	return out;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
	await initInput();
	console.log('\n🚀  init:site — Replace template placeholders with real project values');
	console.log('   Press Enter to keep the current value shown in brackets.\n');

	// Read current file contents
	const pkgJson = readFile('package.json');
	const siteTs = readFile('src/lib/config/site.ts');
	const configYml = readFile('static/admin/config.yml');
	const webmanifest = readFile('static/site.webmanifest');
	const readme = readFile('README.md');
	const envExample = readFile('.env.example');
	const deployEnv = readFile('deploy/env.example');
	const caddyfile = readFile('deploy/Caddyfile.example');
	const quadlet = readFile('deploy/quadlets/web.container');
	const quadletNetwork = readFile('deploy/quadlets/web.network');

	// Extract current values as defaults
	const currentPackageName = extractJsonField(pkgJson, 'name');
	const currentSiteName = extractSiteField(siteTs, 'name');
	const currentSiteUrl = extractSiteField(siteTs, 'url');
	const currentDescription = extractSiteField(siteTs, 'defaultDescription');
	const currentContactEmail = extractSiteField(siteTs, 'email');
	const currentDomain = extractCaddyDomain(caddyfile);
	const currentQuadletImage = extractQuadletImage(quadlet);
	const currentProject = extractQuadletProject(quadlet);

	// Derive owner/repo from current quadlet image or gh repo
	const [currentOwner = 'owner', currentRepo = 'repo-name'] = currentQuadletImage.split('/');

	// ── Prompts ────────────────────────────────────────────────────────────────
	const packageName = await ask(
		'Package name (package.json "name")',
		defaultFromCurrent(currentPackageName, 'my-site')
	);
	const siteName = await ask(
		'Site name (shown in titles and OG tags)',
		defaultFromCurrent(currentSiteName, 'My Site')
	);
	const siteUrl = await ask(
		'Production URL (HTTPS, no trailing slash)',
		defaultFromCurrent(currentSiteUrl, `https://${packageName}.com`)
	);
	const description = await ask(
		'Default meta description (≤155 chars)',
		defaultFromCurrent(currentDescription, 'A concise description of this site.')
	);
	const ghOwner = await ask(
		'GitHub owner (username or org)',
		defaultFromCurrent(currentOwner, 'my-org')
	);
	const ghRepo = await ask('GitHub repository name', defaultFromCurrent(currentRepo, packageName));
	const contactEmail = await ask(
		'Support contact email (shown on error pages)',
		defaultFromCurrent(currentContactEmail, `hello@${new URL(siteUrl).hostname}`)
	);
	const project = await ask(
		'Project slug (used for container/Quadlet names)',
		defaultFromCurrent(currentProject, packageName.replace(/[^a-z0-9-]/g, '-'))
	);
	const domain = await ask(
		'Production domain (for Caddyfile)',
		defaultFromCurrent(currentDomain, new URL(siteUrl).hostname)
	);
	const shortName = await ask(
		'PWA short name (≤12 chars, for site.webmanifest)',
		siteName.length <= 12 ? siteName : siteName.split(' ')[0]
	);

	// ── Apply rewrites ─────────────────────────────────────────────────────────
	const ghFullRepo = `${ghOwner}/${ghRepo}`;

	if (pkgJson) {
		const updated = rewritePackageJson(pkgJson, packageName);
		if (updated !== pkgJson) writeFile('package.json', updated);
	}

	if (siteTs) {
		const updated = rewriteSiteTs(siteTs, {
			name: siteName,
			url: siteUrl,
			description,
			contactEmail,
		});
		if (updated !== siteTs) writeFile('src/lib/config/site.ts', updated);
	}

	if (configYml && ghOwner && ghRepo) {
		const updated = rewriteConfigYml(configYml, ghFullRepo);
		if (updated !== configYml) writeFile('static/admin/config.yml', updated);
	}

	if (webmanifest) {
		const updated = rewriteWebmanifest(webmanifest, siteName, shortName);
		if (updated !== webmanifest) writeFile('static/site.webmanifest', updated);
	}

	if (readme) {
		const updated = rewriteReadme(readme, siteName);
		if (updated !== readme) writeFile('README.md', updated);
	}

	if (envExample) {
		const updated = rewriteEnvExample(envExample, siteUrl);
		if (updated !== envExample) writeFile('.env.example', updated);
	}

	if (deployEnv) {
		const updated = rewriteDeployEnvExample(deployEnv, siteUrl, project);
		if (updated !== deployEnv) writeFile('deploy/env.example', updated);
	}

	if (caddyfile) {
		const updated = rewriteCaddyfile(caddyfile, domain);
		if (updated !== caddyfile) writeFile('deploy/Caddyfile.example', updated);
	}

	if (quadlet && ghOwner && ghRepo) {
		const updated = rewriteQuadlet(quadlet, { owner: ghOwner, repo: ghRepo, project });
		if (updated !== quadlet) writeFile('deploy/quadlets/web.container', updated);
	}

	if (quadletNetwork) {
		const updated = rewriteQuadletNetwork(quadletNetwork, project);
		if (updated !== quadletNetwork) writeFile('deploy/quadlets/web.network', updated);
	}

	console.log('\n✓  init:site complete. Files updated:');
	console.log('   package.json, src/lib/config/site.ts, static/admin/config.yml');
	console.log('   static/site.webmanifest, README.md, .env.example, deploy/env.example');
	console.log('   deploy/Caddyfile.example, deploy/quadlets/web.container');
	console.log('   deploy/quadlets/web.network');
	console.log('\nNext steps:');
	console.log('  1. Replace static/og-default.png with a real 1200×630 OG image');
	console.log('  2. Run: bun run validate');
	console.log('  3. Run: bun run validate:launch (will fail until og-default.png is replaced)');
	closeInput();
}

main().catch((err) => {
	closeInput();
	console.error('init:site failed:', err.message);
	process.exit(1);
});
