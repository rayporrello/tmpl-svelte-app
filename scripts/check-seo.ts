/**
 * SEO structural validation script. Fails on structural issues: hardcoded
 * domains in SEO source files, route registry indexability errors.
 * Warns on placeholder values in site config — those are launch-time concerns
 * enforced as errors by check:launch (validate:launch path).
 *
 * Run: bun run scripts/check-seo.ts
 */
import { site } from '../src/lib/config/site';
import { routes } from '../src/lib/seo/routes';
import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';

const PLACEHOLDER_URL = 'https://example.com';
const PLACEHOLDER_NAMES = ['Your Site Name'];
const HARDCODED_DOMAIN_PATTERNS = ['yourdomain.com', 'Your Site Name'];
const NON_INDEXABLE_PATHS = ['/styleguide', '/admin', '/preview', '/draft', '/examples'];

const errors: string[] = [];
const warnings: string[] = [];

// ── 1. Site config checks (placeholder values → warnings, not errors) ────────
// Placeholder detection is a launch-time concern owned by check:launch.
// These warnings inform during development without blocking PRs.

if (!site.url || site.url === PLACEHOLDER_URL) {
	warnings.push(
		`site.url is "${site.url}" — replace with the production domain (enforced by check:launch).`
	);
}

if (!site.name || PLACEHOLDER_NAMES.includes(site.name)) {
	warnings.push(
		`site.name is "${site.name}" — replace with the real site name (enforced by check:launch).`
	);
}

if (!site.defaultTitle || PLACEHOLDER_NAMES.includes(site.defaultTitle)) {
	warnings.push(
		`site.defaultTitle is "${site.defaultTitle}" — replace with a real title (enforced by check:launch).`
	);
}

if (!site.defaultDescription || site.defaultDescription.length < 10) {
	warnings.push(`site.defaultDescription is missing or too short (enforced by check:launch).`);
}

if (!site.defaultOgImage) {
	errors.push(
		`site.defaultOgImage is empty — add a default OG image path in src/lib/config/site.ts.`
	);
}

if (!site.organization.name || PLACEHOLDER_NAMES.includes(site.organization.name)) {
	warnings.push(
		`site.organization.name is "${site.organization.name}" — replace with the real org name (enforced by check:launch).`
	);
}

if (!site.organization.logo || site.organization.logo.includes('example.com')) {
	warnings.push(`site.organization.logo still points to example.com — update before launch.`);
}

// ── 2. Hardcoded domain checks in SEO source files ────────────────────────────

const seoSourceFiles = glob.sync('src/lib/seo/**/*.ts');
const configFile = 'src/lib/config/site.ts';

for (const file of [...seoSourceFiles, configFile]) {
	if (!existsSync(file)) continue;
	const content = readFileSync(file, 'utf8');
	for (const pattern of HARDCODED_DOMAIN_PATTERNS) {
		// Skip the site.ts config file itself — placeholder values live there intentionally.
		if (file === configFile) continue;
		if (content.includes(pattern)) {
			errors.push(`${file} contains hardcoded "${pattern}" — use site config instead.`);
		}
	}
}

// ── 3. Route registry checks ─────────────────────────────────────────────────

for (const route of routes) {
	// Enforce that internal/dev paths are never indexable.
	if (route.indexable) {
		for (const forbidden of NON_INDEXABLE_PATHS) {
			if (route.path === forbidden || route.path.startsWith(forbidden + '/')) {
				errors.push(
					`Route "${route.path}" is marked indexable but must be noindex (matches ${forbidden}).`
				);
			}
		}
	}

	// Warn on indexable routes that have no priority set.
	if (route.indexable && route.priority === undefined) {
		warnings.push(
			`Route "${route.path}" is indexable but has no priority set — defaulting to 0.5.`
		);
	}
}

// ── 4. Report ─────────────────────────────────────────────────────────────────

if (warnings.length > 0) {
	console.warn('\nSEO Warnings:');
	for (const w of warnings) console.warn(`  ⚠  ${w}`);
}

if (errors.length > 0) {
	console.error('\nSEO Errors (must fix before launch):');
	for (const e of errors) console.error(`  ✗  ${e}`);
	console.error(`\n${errors.length} error(s) found. Fix the above before deploying.\n`);
	process.exit(1);
} else {
	console.log(
		'\n✓ SEO check passed' + (warnings.length ? ` with ${warnings.length} warning(s)` : '') + '.\n'
	);
}
