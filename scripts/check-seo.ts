/**
 * SEO structural validation script. Fails on structural issues: hardcoded
 * domains in SEO source files, route registry indexability errors.
 * Full route policy coverage is owned by scripts/check-routes.ts.
 * Warns on placeholder values in site config — those are launch-time concerns
 * enforced as errors by check:launch (validate:launch path).
 *
 * Run: bun run scripts/check-seo.ts
 */
import { site } from '../src/lib/config/site';
import { routes } from '../src/lib/seo/routes';
import { routePolicyEntries, type RoutePolicyEntry } from '../src/lib/seo/route-policy';
import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';
import { evaluateRoutePolicyCoverage, scanSvelteKitRoutes } from './lib/route-scanner';

const PLACEHOLDER_URL = 'https://example.com';
const PLACEHOLDER_NAMES = ['Your Site Name'];
const HARDCODED_DOMAIN_PATTERNS = ['yourdomain.com', 'Your Site Name'];
const NON_INDEXABLE_PATHS = ['/styleguide', '/admin', '/preview', '/draft', '/examples'];
const ROUTES_WITH_DYNAMIC_SEO = new Set(['/articles/[slug]']);
const ROUTE_REGISTRY_WILDCARD_EXCEPTIONS = ['/examples/'];

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
} else if (
	!site.defaultOgImage.startsWith('/') &&
	!site.defaultOgImage.startsWith('https://') &&
	!site.defaultOgImage.startsWith('http://')
) {
	errors.push(
		`site.defaultOgImage="${site.defaultOgImage}" must be site-relative or absolute http(s).`
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
	if (!route.path.startsWith('/')) {
		errors.push(`Route "${route.path}" must use a site-relative path starting with "/".`);
	}
	if (route.path.length > 1 && route.path.endsWith('/')) {
		errors.push(`Route "${route.path}" must not have a trailing slash.`);
	}
	if (!route.title.trim()) {
		errors.push(`Route "${route.path}" is missing a title in src/lib/seo/routes.ts.`);
	}
	if (!route.description.trim()) {
		errors.push(`Route "${route.path}" is missing a description in src/lib/seo/routes.ts.`);
	}
	if (route.priority !== undefined && (route.priority < 0 || route.priority > 1)) {
		errors.push(`Route "${route.path}" priority must be between 0.0 and 1.0.`);
	}

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

const duplicateRoutePaths = routes
	.map((route) => route.path)
	.filter((path, index, all) => all.indexOf(path) !== index);
for (const path of [...new Set(duplicateRoutePaths)]) {
	errors.push(`Route "${path}" is duplicated in src/lib/seo/routes.ts.`);
}

// ── 4. Route policy / registry / source contract checks ─────────────────────

const routeCoverage = evaluateRoutePolicyCoverage(process.cwd());
for (const issue of routeCoverage.issues) {
	errors.push(`${issue.path} (${issue.file}) route policy coverage failed: ${issue.message}`);
}

function entryMatches(entry: RoutePolicyEntry, path: string): boolean {
	if (entry.path.endsWith('/*')) {
		const prefix = entry.path.slice(0, -2);
		return path === prefix || path.startsWith(`${prefix}/`);
	}
	return entry.path === path;
}

function policyForPath(path: string): RoutePolicyEntry | null {
	const policies = routePolicyEntries();
	return (
		policies.find((entry) => !entry.path.endsWith('/*') && entry.path === path) ??
		policies.find((entry) => entryMatches(entry, path)) ??
		null
	);
}

function registryException(path: string): boolean {
	return ROUTE_REGISTRY_WILDCARD_EXCEPTIONS.some((prefix) => path.startsWith(prefix));
}

function canonicalPathsFrom(source: string): string[] {
	return [...source.matchAll(/canonicalPath\s*:\s*(['"`])([^'"`$]+)\1/gu)].map((match) => match[2]);
}

function hasNoindexRobots(source: string): boolean {
	return /robots\s*:\s*['"`]noindex,\s*nofollow['"`]/u.test(source);
}

function hasSeoImageWithoutAlt(source: string): boolean {
	for (const match of source.matchAll(/<SEO\b[\s\S]*?(?:\/>|<\/SEO>)/gu)) {
		const block = match[0];
		if (/\bimage\s*:/u.test(block) && !/\bimageAlt\s*:/u.test(block)) return true;
	}
	return false;
}

for (const route of scanSvelteKitRoutes(process.cwd()).filter((item) => item.kind === 'page')) {
	const policy = policyForPath(route.path);
	const isDynamic = route.path.includes('[');
	const isRegistryRoute = routes.some((entry) => entry.path === route.path);
	const needsRegistry =
		policy?.policy === 'indexable' ||
		(policy?.policy === 'noindex' && !registryException(route.path));

	if (needsRegistry && !isDynamic && !isRegistryRoute) {
		errors.push(
			`Page route "${route.path}" is ${policy?.policy} but is missing from src/lib/seo/routes.ts.`
		);
	}

	if (!existsSync(route.file)) continue;
	const source = readFileSync(route.file, 'utf8');
	if (!/<SEO\b/u.test(source)) {
		errors.push(`${route.file} is missing the SEO component.`);
		continue;
	}

	if (hasSeoImageWithoutAlt(source)) {
		errors.push(`${route.file} passes image to SEO without imageAlt.`);
	}

	if (ROUTES_WITH_DYNAMIC_SEO.has(route.path)) continue;

	const canonicalPaths = canonicalPathsFrom(source);
	if (canonicalPaths.length === 0) {
		warnings.push(`${route.file} has SEO but no literal canonicalPath for static verification.`);
	} else if (!canonicalPaths.includes(route.path)) {
		errors.push(
			`${route.file} canonicalPath is ${canonicalPaths.join(', ')} but route path is ${route.path}.`
		);
	}

	if (policy?.policy === 'noindex' && !hasNoindexRobots(source)) {
		errors.push(
			`${route.file} is noindex by route policy but SEO robots is not noindex, nofollow.`
		);
	}
}

// ── 5. Discovery endpoint source consistency checks ─────────────────────────

const sitemapSource = existsSync('src/lib/seo/sitemap.ts')
	? readFileSync('src/lib/seo/sitemap.ts', 'utf8')
	: '';
if (!sitemapSource.includes('indexableRoutes')) {
	errors.push('src/lib/seo/sitemap.ts must derive sitemap entries from indexableRoutes().');
}

const llmsSource = existsSync('src/routes/llms.txt/+server.ts')
	? readFileSync('src/routes/llms.txt/+server.ts', 'utf8')
	: '';
if (!llmsSource.includes('indexableRoutes')) {
	errors.push('src/routes/llms.txt/+server.ts must derive public pages from indexableRoutes().');
}

const robotsSource = existsSync('src/routes/robots.txt/+server.ts')
	? readFileSync('src/routes/robots.txt/+server.ts', 'utf8')
	: '';
for (const path of NON_INDEXABLE_PATHS) {
	if (!robotsSource.includes(`'${path}'`) && !robotsSource.includes(`"${path}"`)) {
		errors.push(`src/routes/robots.txt/+server.ts should disallow ${path}.`);
	}
}

// ── 6. Report ─────────────────────────────────────────────────────────────────

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
