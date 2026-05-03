import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
	routePolicyEntries,
	type RoutePolicy,
	type RoutePolicyEntry,
} from '../../src/lib/seo/route-policy';

export type ScannedRouteKind = 'page' | 'endpoint';

export interface ScannedRoute {
	path: string;
	kind: ScannedRouteKind;
	file: string;
}

export interface RoutePolicyIssue {
	path: string;
	kind: ScannedRouteKind;
	file: string;
	message: string;
}

export interface RoutePolicyEvaluation {
	routes: ScannedRoute[];
	issues: RoutePolicyIssue[];
}

const ENDPOINT_POLICIES: ReadonlySet<RoutePolicy> = new Set([
	'api',
	'feed',
	'health',
	'private',
	'ignored',
]);

const PAGE_POLICIES: ReadonlySet<RoutePolicy> = new Set([
	'indexable',
	'noindex',
	'private',
	'ignored',
]);

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const output: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) output.push(...walk(path));
		else if (entry.isFile()) output.push(path);
	}
	return output;
}

function routePathForFile(rootDir: string, file: string): string {
	const routesDir = join(rootDir, 'src/routes');
	const relDir = relative(routesDir, file).split('/').slice(0, -1);
	const segments = relDir.filter((segment) => {
		if (!segment) return false;
		if (segment.startsWith('(') && segment.endsWith(')')) return false;
		return true;
	});
	return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function scanSvelteKitRoutes(rootDir = process.cwd()): ScannedRoute[] {
	const routesDir = join(rootDir, 'src/routes');
	return walk(routesDir)
		.filter((file) => file.endsWith('/+page.svelte') || file.endsWith('/+server.ts'))
		.map((file) => ({
			path: routePathForFile(rootDir, file),
			kind: file.endsWith('/+page.svelte') ? ('page' as const) : ('endpoint' as const),
			file: relative(rootDir, file),
		}))
		.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

function entryMatches(entry: RoutePolicyEntry, path: string): boolean {
	if (entry.path.endsWith('/*')) {
		const prefix = entry.path.slice(0, -2);
		return path === prefix || path.startsWith(`${prefix}/`);
	}
	return entry.path === path;
}

function policyForPath(
	path: string,
	entries: readonly RoutePolicyEntry[]
): RoutePolicyEntry | null {
	const exact = entries.find((entry) => !entry.path.endsWith('/*') && entry.path === path);
	if (exact) return exact;
	return entries.find((entry) => entryMatches(entry, path)) ?? null;
}

function policyAllowed(kind: ScannedRouteKind, policy: RoutePolicy): boolean {
	return kind === 'endpoint' ? ENDPOINT_POLICIES.has(policy) : PAGE_POLICIES.has(policy);
}

export function evaluateRoutePolicyCoverage(rootDir = process.cwd()): RoutePolicyEvaluation {
	const routes = scanSvelteKitRoutes(resolve(rootDir));
	const policies = routePolicyEntries();
	const issues: RoutePolicyIssue[] = [];

	for (const route of routes) {
		const policy = policyForPath(route.path, policies);
		if (!policy) {
			issues.push({
				...route,
				message: `No route policy entry covers ${route.path}.`,
			});
			continue;
		}

		if (!policyAllowed(route.kind, policy.policy)) {
			issues.push({
				...route,
				message: `${route.kind} route ${route.path} is classified as ${policy.policy}.`,
			});
		}
	}

	return { routes, issues };
}
