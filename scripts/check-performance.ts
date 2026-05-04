#!/usr/bin/env bun
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { glob } from 'glob';

type PerformanceStatus = 'pass' | 'warn' | 'fail';

export type PerformanceResult = {
	id: string;
	status: PerformanceStatus;
	label: string;
	detail: string;
};

export type PerformanceBudgets = {
	totalClientJsGzipWarnKb: number;
	totalClientJsGzipFailKb: number;
	largestClientJsGzipWarnKb: number;
	largestClientJsGzipFailKb: number;
	totalCssGzipWarnKb: number;
	totalCssGzipFailKb: number;
	staticImageWarnKb: number;
	staticImageFailKb: number;
	singleAssetFailKb: number;
};

type BudgetConfig = {
	schemaVersion: 1;
	budgets: PerformanceBudgets;
	allowLargeAssets?: Array<{ path: string; reason: string }>;
};

export type PerformanceCheckOptions = {
	rootDir?: string;
	budgetPath?: string;
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_BUDGETS: PerformanceBudgets = {
	totalClientJsGzipWarnKb: 200,
	totalClientJsGzipFailKb: 350,
	largestClientJsGzipWarnKb: 120,
	largestClientJsGzipFailKb: 180,
	totalCssGzipWarnKb: 80,
	totalCssGzipFailKb: 140,
	staticImageWarnKb: 500,
	staticImageFailKb: 1024,
	singleAssetFailKb: 2048,
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.webp', '.avif']);
const UPLOAD_SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff']);

function result(
	id: string,
	status: PerformanceStatus,
	label: string,
	detail: string
): PerformanceResult {
	return { id, status, label, detail };
}

function toProjectPath(rootDir: string, path: string): string {
	return relative(rootDir, path).replace(/\\/gu, '/');
}

function extension(path: string): string {
	const match = /\.([^.]+)$/u.exec(path);
	return match ? `.${match[1].toLowerCase()}` : '';
}

function bytesToKb(bytes: number): number {
	return bytes / 1024;
}

function formatKb(bytes: number): string {
	return `${bytesToKb(bytes).toFixed(1)} KB`;
}

function readBudgetConfig(rootDir: string, budgetPath?: string): BudgetConfig {
	const path = resolve(rootDir, budgetPath ?? 'performance.budget.json');
	if (!existsSync(path)) {
		return { schemaVersion: 1, budgets: DEFAULT_BUDGETS, allowLargeAssets: [] };
	}

	const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BudgetConfig>;
	return {
		schemaVersion: 1,
		budgets: { ...DEFAULT_BUDGETS, ...(parsed.budgets ?? {}) },
		allowLargeAssets: parsed.allowLargeAssets ?? [],
	};
}

function allowedAsset(projectPath: string, config: BudgetConfig): boolean {
	return Boolean(
		config.allowLargeAssets?.some((entry) => {
			if (entry.path.endsWith('/*')) return projectPath.startsWith(entry.path.slice(0, -1));
			return entry.path === projectPath;
		})
	);
}

function gzipFileSize(path: string): number {
	return gzipSync(readFileSync(path)).byteLength;
}

function budgetResult(
	id: string,
	label: string,
	bytes: number,
	warnKb: number,
	failKb: number
): PerformanceResult {
	const kb = bytesToKb(bytes);
	const detail = `${formatKb(bytes)} (warn ${warnKb} KB, fail ${failKb} KB)`;
	if (kb > failKb) return result(id, 'fail', label, detail);
	if (kb > warnKb) return result(id, 'warn', label, detail);
	return result(id, 'pass', label, detail);
}

function checkBuiltBundle(rootDir: string, config: BudgetConfig): PerformanceResult[] {
	const clientDir = resolve(rootDir, 'build/client');
	if (!existsSync(clientDir)) {
		return [
			result(
				'PERF-BUILD-001',
				'fail',
				'Built client output exists',
				'build/client is missing. Run bun run build before bun run check:performance.'
			),
		];
	}

	const jsFiles = glob.sync('build/client/_app/immutable/**/*.js', {
		cwd: rootDir,
		absolute: true,
		nodir: true,
	});
	const cssFiles = glob.sync('build/client/_app/immutable/**/*.css', {
		cwd: rootDir,
		absolute: true,
		nodir: true,
	});

	const results: PerformanceResult[] = [];
	if (jsFiles.length === 0) {
		results.push(
			result('PERF-JS-001', 'fail', 'Client JavaScript exists', 'No built JS chunks found.')
		);
	} else {
		const jsSizes = jsFiles.map((path) => ({ path, gzipBytes: gzipFileSize(path) }));
		const totalJs = jsSizes.reduce((sum, file) => sum + file.gzipBytes, 0);
		const largestJs = jsSizes.reduce((largest, file) =>
			file.gzipBytes > largest.gzipBytes ? file : largest
		);
		results.push(
			budgetResult(
				'PERF-JS-001',
				'Total built client JS gzip size',
				totalJs,
				config.budgets.totalClientJsGzipWarnKb,
				config.budgets.totalClientJsGzipFailKb
			)
		);
		results.push(
			budgetResult(
				'PERF-JS-002',
				`Largest client JS chunk (${toProjectPath(rootDir, largestJs.path)})`,
				largestJs.gzipBytes,
				config.budgets.largestClientJsGzipWarnKb,
				config.budgets.largestClientJsGzipFailKb
			)
		);
	}

	if (cssFiles.length === 0) {
		results.push(result('PERF-CSS-001', 'warn', 'Built CSS exists', 'No built CSS assets found.'));
	} else {
		const totalCss = cssFiles.reduce((sum, path) => sum + gzipFileSize(path), 0);
		results.push(
			budgetResult(
				'PERF-CSS-001',
				'Total built CSS gzip size',
				totalCss,
				config.budgets.totalCssGzipWarnKb,
				config.budgets.totalCssGzipFailKb
			)
		);
	}

	return results;
}

function uploadWebpSiblingPath(path: string): string {
	return path.replace(/\.(jpe?g|png|tiff)$/iu, '.webp');
}

function checkStaticAssets(rootDir: string, config: BudgetConfig): PerformanceResult[] {
	const files = glob.sync('{static,src/lib/assets}/**/*', {
		cwd: rootDir,
		absolute: true,
		nodir: true,
		ignore: ['static/admin/**'],
	});
	const results: PerformanceResult[] = [];
	let oversizedImages = 0;
	let hugeAssets = 0;
	let missingWebp = 0;

	for (const file of files) {
		const projectPath = toProjectPath(rootDir, file);
		const size = statSync(file).size;
		const ext = extension(file);
		const isAllowed = allowedAsset(projectPath, config);

		if (size > config.budgets.singleAssetFailKb * 1024 && !isAllowed) {
			hugeAssets += 1;
			results.push(
				result(
					'PERF-ASSET-001',
					'fail',
					'No huge unapproved local assets',
					`${projectPath} is ${formatKb(size)}; add it to performance.budget.json only with a reviewable reason.`
				)
			);
		}

		if (!IMAGE_EXTENSIONS.has(ext)) continue;
		const imageKb = bytesToKb(size);
		if (imageKb > config.budgets.staticImageFailKb && !isAllowed) {
			oversizedImages += 1;
			results.push(
				result(
					'PERF-IMAGE-001',
					'fail',
					'Static images stay within budget or are allowed',
					`${projectPath} is ${formatKb(size)}; optimize it or allow it in performance.budget.json.`
				)
			);
		} else if (imageKb > config.budgets.staticImageWarnKb && !isAllowed) {
			oversizedImages += 1;
			results.push(
				result(
					'PERF-IMAGE-001',
					'warn',
					'Static images stay within budget or are allowed',
					`${projectPath} is ${formatKb(size)}; consider optimizing or documenting why it is large.`
				)
			);
		}

		if (
			projectPath.startsWith('static/uploads/') &&
			UPLOAD_SOURCE_EXTENSIONS.has(ext) &&
			!existsSync(uploadWebpSiblingPath(file))
		) {
			missingWebp += 1;
			results.push(
				result(
					'PERF-IMAGE-002',
					'fail',
					'CMS upload source images have generated WebP siblings',
					`${projectPath} is missing ${toProjectPath(rootDir, uploadWebpSiblingPath(file))}. Run bun run images:optimize.`
				)
			);
		}
	}

	if (hugeAssets === 0) {
		results.push(
			result('PERF-ASSET-001', 'pass', 'No huge unapproved local assets', 'No issues found.')
		);
	}
	if (oversizedImages === 0) {
		results.push(
			result(
				'PERF-IMAGE-001',
				'pass',
				'Static images stay within budget or are allowed',
				'No issues found.'
			)
		);
	}
	if (missingWebp === 0) {
		results.push(
			result(
				'PERF-IMAGE-002',
				'pass',
				'CMS upload source images have generated WebP siblings',
				'No issues found.'
			)
		);
	}

	return results;
}

function stripScriptAndComments(source: string): string {
	return source.replace(/<script\b[\s\S]*?<\/script>/giu, '').replace(/<!--[\s\S]*?-->/gu, '');
}

function attrValue(tag: string, name: string): string | null {
	const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]+)\\})`, 'iu').exec(tag);
	return match ? (match[1] ?? match[2] ?? match[3] ?? '').trim() : null;
}

function checkImageMarkup(rootDir: string): PerformanceResult[] {
	const files = glob.sync('src/**/*.{svelte,html}', {
		cwd: rootDir,
		absolute: true,
		nodir: true,
		ignore: ['src/routes/styleguide/**'],
	});
	const results: PerformanceResult[] = [];
	let priorityIssues = 0;

	for (const file of files) {
		const source = stripScriptAndComments(readFileSync(file, 'utf8'));
		for (const match of source.matchAll(/<(?:enhanced:img|CmsImage|img)\b[^>]*>/giu)) {
			const tag = match[0];
			const projectPath = toProjectPath(rootDir, file);
			const loading = attrValue(tag, 'loading');
			const fetchpriority = attrValue(tag, 'fetchpriority');
			const tagSummary = tag.replace(/\s+/gu, ' ').slice(0, 120);

			if (fetchpriority === 'high' && loading !== 'eager') {
				priorityIssues += 1;
				results.push(
					result(
						'PERF-IMG-PRIORITY-001',
						'fail',
						'High-priority images are eager-loaded',
						`${projectPath} has fetchpriority="high" without loading="eager": ${tagSummary}`
					)
				);
			}

			if (loading === 'lazy' && /hero|banner|lcp/iu.test(tag)) {
				priorityIssues += 1;
				results.push(
					result(
						'PERF-IMG-PRIORITY-002',
						'warn',
						'Hero-like images are not lazy-loaded',
						`${projectPath} has a hero-like lazy image: ${tagSummary}`
					)
				);
			}
		}
	}

	if (priorityIssues === 0) {
		results.push(
			result(
				'PERF-IMG-PRIORITY-001',
				'pass',
				'High-priority images are eager-loaded',
				'No issues found.'
			)
		);
	}

	return results;
}

export function runPerformanceCheck(options: PerformanceCheckOptions = {}): {
	results: PerformanceResult[];
	exitCode: number;
} {
	const rootDir = resolve(options.rootDir ?? ROOT_DIR);
	const config = readBudgetConfig(rootDir, options.budgetPath);
	const results = [
		...checkBuiltBundle(rootDir, config),
		...checkStaticAssets(rootDir, config),
		...checkImageMarkup(rootDir),
	];

	return {
		results,
		exitCode: results.some((item) => item.status === 'fail') ? 1 : 0,
	};
}

export function main(): number {
	const { results, exitCode } = runPerformanceCheck();
	for (const item of results) {
		const prefix = item.status === 'pass' ? 'OK  ' : item.status === 'warn' ? 'WARN' : 'FAIL';
		console[item.status === 'fail' ? 'error' : item.status === 'warn' ? 'warn' : 'log'](
			`${prefix} ${item.id} ${item.label}: ${item.detail}`
		);
	}

	if (exitCode === 0) console.log('\nPerformance check passed.\n');
	else console.error('\nPerformance check failed.\n');
	return exitCode;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(main());
}
