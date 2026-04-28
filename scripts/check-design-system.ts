/**
 * Design-system policy checker. Enforces repo-specific guardrails that are too
 * contextual for generic CSS or Svelte linters.
 *
 * Run: bun run scripts/check-design-system.ts
 * Incremental: git diff --cached --name-only | bun run scripts/check-design-system.ts --changed
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { glob } from 'glob';
import type { AtRule, ChildNode, Declaration, Root } from 'postcss';
// postcss-safe-parser does not publish TypeScript declarations.
// @ts-expect-error missing package types
import safeParse from 'postcss-safe-parser';
import valueParser from 'postcss-value-parser';
import { parse as parseSvelte } from 'svelte/compiler';

export type DesignSystemRuleId =
	| 'ds/missing-token'
	| 'ds/viewport-lock'
	| 'ds/body-overflow-hidden'
	| 'ds/no-tailwind'
	| 'ds/route-main'
	| 'ds/nav-aria-label'
	| 'ds/image-attrs'
	| 'ds/layer-order'
	| 'ds/theme-color';

export type DesignSystemSeverity = 'error' | 'warn';

type DesignSystemProfile =
	| 'token-files'
	| 'architecture-files'
	| 'styleguide'
	| 'examples'
	| 'section-component'
	| 'cms-image-component'
	| 'app-html-theme-color'
	| 'data-uri-svg';

export interface DesignSystemViolation {
	ruleId: DesignSystemRuleId;
	severity: DesignSystemSeverity;
	file: string;
	line: number;
	column: number;
	message: string;
}

export interface DesignSystemReport {
	violations: DesignSystemViolation[];
	errors: number;
	warnings: number;
	checkedFiles: string[];
}

export interface CheckDesignSystemOptions {
	rootDir?: string;
	files?: string[];
}

interface RuleDefinition {
	severity: DesignSystemSeverity;
	message: string;
}

interface LineIndex {
	lineStarts: number[];
	positionAt(offset: number): { line: number; column: number };
	offsetAt(line: number, column: number): number;
}

interface Suppression {
	ruleId: DesignSystemRuleId;
	line: number;
}

interface FileContext {
	rootDir: string;
	filePath: string;
	projectPath: string;
	source: string;
	lineIndex: LineIndex;
	profiles: Set<DesignSystemProfile>;
	suppressions: Suppression[];
	tokens: Set<string>;
	violations: DesignSystemViolation[];
}

interface SvelteNode {
	type?: string;
	name?: string;
	start?: number;
	end?: number;
	attributes?: SvelteAttribute[];
	fragment?: unknown;
	css?: {
		content?: {
			start?: number;
			end?: number;
			styles?: string;
		};
	};
	instance?: SvelteNode;
	module?: SvelteNode;
	content?: {
		start?: number;
		end?: number;
		styles?: string;
		body?: unknown[];
	};
	[key: string]: unknown;
}

interface SvelteAttribute {
	type?: string;
	name?: string;
	start?: number;
	end?: number;
	value?: unknown;
}

const RULES: Record<DesignSystemRuleId, RuleDefinition> = {
	'ds/missing-token': {
		severity: 'error',
		message: 'CSS custom property is not defined in tokens or architecture files.',
	},
	'ds/viewport-lock': {
		severity: 'error',
		message: 'Viewport metadata must not disable zoom.',
	},
	'ds/body-overflow-hidden': {
		severity: 'error',
		message: 'Do not lock html/body scrolling in this website template.',
	},
	'ds/no-tailwind': {
		severity: 'error',
		message: 'Tailwind and shadcn are not part of this template.',
	},
	'ds/route-main': {
		severity: 'error',
		message: 'Only src/routes/+layout.svelte may render the page main element.',
	},
	'ds/nav-aria-label': {
		severity: 'error',
		message: 'Navigation landmarks need aria-label or aria-labelledby.',
	},
	'ds/image-attrs': {
		severity: 'error',
		message: 'Images need alt, width, and height attributes.',
	},
	'ds/layer-order': {
		severity: 'error',
		message: 'CSS layers must use the documented reset, tokens, base, utilities, components order.',
	},
	'ds/theme-color': {
		severity: 'error',
		message: 'Raw hex colors are only allowed for app.html theme-color metadata.',
	},
};

const PROFILE_GLOBS: Record<string, readonly DesignSystemProfile[]> = {
	'src/lib/styles/{tokens,brand.example}.css': ['token-files'],
	'src/lib/styles/{reset,base,utilities,animations,forms}.css': ['architecture-files'],
	'src/routes/styleguide/**': ['styleguide'],
	'src/routes/examples/**': ['examples'],
	'src/lib/components/Section.svelte': ['section-component'],
	'src/lib/components/CmsImage.svelte': ['cms-image-component'],
	'src/app.html': ['app-html-theme-color'],
	'**/*.{css,svelte,html}': ['data-uri-svg'],
};

const ROUTE_MAIN_ALLOWED_GLOBS = ['src/routes/+layout.svelte'];

const TOKEN_SOURCE_FILES = [
	'src/lib/styles/tokens.css',
	'src/lib/styles/reset.css',
	'src/lib/styles/base.css',
	'src/lib/styles/utilities.css',
	'src/lib/styles/animations.css',
	'src/lib/styles/forms.css',
];

const LOCAL_CUSTOM_PROPERTIES = new Set(['--flow-space']);

const SOURCE_GLOBS = [
	'src/**/*.{svelte,css,html,ts,js}',
	'scripts/**/*.{ts,js}',
	'*.{js,ts,json,css,html,svelte}',
	'package.json',
	'svelte.config.js',
	'vite.config.ts',
	'eslint.config.js',
];

const IGNORED_GLOBS = ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**'];
const ALLOWED_LAYERS = ['reset', 'tokens', 'base', 'utilities', 'components'];
const SUPPORTED_EXTENSIONS = new Set(['.svelte', '.css', '.html', '.ts', '.js', '.json']);
const TAILWIND_DIRECTIVE = '@' + 'tailwind';

export function checkDesignSystem(options: CheckDesignSystemOptions = {}): DesignSystemReport {
	const rootDir = resolve(options.rootDir ?? process.cwd());
	const tokens = collectTokenDefinitions(rootDir);
	const files = resolveInputFiles(rootDir, options.files);
	const violations: DesignSystemViolation[] = [];

	for (const filePath of files) {
		if (!existsSync(filePath) || !isSupportedFile(filePath)) continue;

		const source = readFileSync(filePath, 'utf8');
		const projectPath = toProjectPath(rootDir, filePath);
		const context: FileContext = {
			rootDir,
			filePath,
			projectPath,
			source,
			lineIndex: createLineIndex(source),
			profiles: getProfiles(projectPath),
			suppressions: collectSuppressions(source),
			tokens,
			violations,
		};

		checkTextPolicies(context);

		const extension = extname(filePath);
		if (extension === '.css') {
			checkCss(context, source, 0);
		} else if (extension === '.svelte') {
			checkSvelte(context);
		} else if (extension === '.html') {
			checkHtml(context);
		} else {
			checkCodeImports(context);
		}
	}

	const errors = violations.filter((violation) => violation.severity === 'error').length;
	const warnings = violations.filter((violation) => violation.severity === 'warn').length;

	return {
		violations,
		errors,
		warnings,
		checkedFiles: files.map((file) => toProjectPath(rootDir, file)),
	};
}

function collectTokenDefinitions(rootDir: string): Set<string> {
	const tokens = new Set<string>();

	for (const file of TOKEN_SOURCE_FILES) {
		const filePath = resolve(rootDir, file);
		if (!existsSync(filePath)) continue;
		const source = readFileSync(filePath, 'utf8');
		const root = safeParse(source, { from: filePath }) as Root;

		root.walkDecls((decl: Declaration) => {
			if (decl.prop.startsWith('--')) tokens.add(decl.prop);
		});
	}

	return tokens;
}

function resolveInputFiles(rootDir: string, files?: string[]): string[] {
	const inputFiles =
		files && files.length > 0
			? files
			: SOURCE_GLOBS.flatMap((pattern) =>
					glob.sync(pattern, {
						cwd: rootDir,
						absolute: true,
						nodir: true,
						ignore: IGNORED_GLOBS,
					})
				);

	const seen = new Set<string>();
	const resolvedFiles: string[] = [];

	for (const file of inputFiles) {
		const filePath = isAbsolute(file) ? resolve(file) : resolve(rootDir, file);
		const projectPath = toProjectPath(rootDir, filePath);
		if (seen.has(projectPath) || isIgnored(projectPath)) continue;
		seen.add(projectPath);
		resolvedFiles.push(filePath);
	}

	return resolvedFiles.sort();
}

function isSupportedFile(filePath: string): boolean {
	return SUPPORTED_EXTENSIONS.has(extname(filePath));
}

function isIgnored(projectPath: string): boolean {
	return IGNORED_GLOBS.some((pattern) => matchesGlob(projectPath, pattern));
}

function getProfiles(projectPath: string): Set<DesignSystemProfile> {
	const profiles = new Set<DesignSystemProfile>();

	for (const [pattern, matchedProfiles] of Object.entries(PROFILE_GLOBS)) {
		if (!matchesGlob(projectPath, pattern)) continue;
		for (const profile of matchedProfiles) profiles.add(profile);
	}

	return profiles;
}

function checkTextPolicies(context: FileContext): void {
	if (context.source.includes(TAILWIND_DIRECTIVE)) {
		const offset = context.source.indexOf(TAILWIND_DIRECTIVE);
		addViolation(context, 'ds/no-tailwind', offset, 'Remove Tailwind directives.');
	}

	const tailwindImport =
		/(?:from\s+['"]tailwindcss(?:\/[^'"]*)?['"]|import\s+['"]tailwindcss(?:\/[^'"]*)?['"])/u.exec(
			context.source
		);
	if (tailwindImport?.index !== undefined) {
		addViolation(context, 'ds/no-tailwind', tailwindImport.index, 'Remove tailwindcss imports.');
	}

	const shadcnReference = /\bshadcn\b/u.exec(context.source);
	if (shadcnReference?.index !== undefined && isPackageOrConfig(context.projectPath)) {
		addViolation(context, 'ds/no-tailwind', shadcnReference.index, 'Remove shadcn references.');
	}
}

function checkCodeImports(context: FileContext): void {
	if (context.projectPath !== 'package.json') return;

	try {
		const packageJson = JSON.parse(context.source) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
		for (const name of Object.keys(deps)) {
			if (name === 'tailwindcss' || name.includes('shadcn')) {
				addViolation(context, 'ds/no-tailwind', context.source.indexOf(name), `Remove ${name}.`);
			}
		}
	} catch {
		// package.json syntax is handled elsewhere; keep this checker policy-only.
	}
}

function checkCss(context: FileContext, css: string, baseOffset: number): void {
	const root = safeParse(css, { from: context.filePath }) as Root;
	const cssLineIndex = createLineIndex(css);

	root.walkDecls((decl: Declaration) => {
		const offset = offsetForCssNode(
			baseOffset,
			cssLineIndex,
			decl.source?.start?.line,
			decl.source?.start?.column
		);

		checkMissingTokensInValue(context, decl.value, offset);
		checkThemeColorValue(context, decl.value, offset);

		if (decl.prop === 'overflow' && decl.value.trim().toLowerCase() === 'hidden') {
			const parent = decl.parent;
			if (parent?.type === 'rule' && targetsDocumentScroll(parent.selector)) {
				addViolation(
					context,
					'ds/body-overflow-hidden',
					offset,
					'Do not set overflow: hidden on html/body.'
				);
			}
		}
	});

	root.walkAtRules((atRule: AtRule) => {
		const offset = offsetForCssNode(
			baseOffset,
			cssLineIndex,
			atRule.source?.start?.line,
			atRule.source?.start?.column
		);

		if (atRule.name === 'tailwind') {
			addViolation(context, 'ds/no-tailwind', offset, 'Remove Tailwind directives.');
		}

		if (atRule.name === 'import' && atRule.params.includes('tailwindcss')) {
			addViolation(context, 'ds/no-tailwind', offset, 'Remove tailwindcss imports.');
		}

		if (atRule.name !== 'layer') return;

		const names = parseLayerNames(atRule.params);
		for (const name of names) {
			if (!ALLOWED_LAYERS.includes(name)) {
				addViolation(context, 'ds/layer-order', offset, `Unknown CSS layer "${name}".`);
			}
		}
	});

	if (context.projectPath === 'src/app.css') {
		checkAppCssLayerOrder(context, root.nodes, baseOffset, cssLineIndex);
	}
}

function checkAppCssLayerOrder(
	context: FileContext,
	nodes: ChildNode[],
	baseOffset: number,
	cssLineIndex: LineIndex
): void {
	const firstPolicyNode = nodes.find((node) => node.type !== 'comment');
	const offset = firstPolicyNode
		? offsetForCssNode(
				baseOffset,
				cssLineIndex,
				firstPolicyNode.source?.start?.line,
				firstPolicyNode.source?.start?.column
			)
		: 0;

	if (firstPolicyNode?.type !== 'atrule' || firstPolicyNode.name !== 'layer') {
		addViolation(
			context,
			'ds/layer-order',
			offset,
			'app.css must start with the documented @layer order.'
		);
		return;
	}

	const names = parseLayerNames(firstPolicyNode.params ?? '');
	if (names.join(',') !== ALLOWED_LAYERS.join(',')) {
		addViolation(context, 'ds/layer-order', offset, 'app.css @layer order is out of date.');
	}
}

function checkMissingTokensInValue(context: FileContext, value: string, offset: number): void {
	const parsed = valueParser(value);
	parsed.walk((node) => {
		if (node.type !== 'function' || node.value !== 'var') return;
		const firstNode = node.nodes.find((child) => child.type === 'word');
		if (!firstNode || !firstNode.value.startsWith('--')) return;

		if (!context.tokens.has(firstNode.value) && !LOCAL_CUSTOM_PROPERTIES.has(firstNode.value)) {
			addViolation(
				context,
				'ds/missing-token',
				offset + firstNode.sourceIndex,
				`Unknown CSS custom property ${firstNode.value}.`
			);
		}
	});
}

function checkThemeColorValue(context: FileContext, value: string, offset: number): void {
	if (context.profiles.has('token-files')) return;

	const parsed = valueParser(value);
	parsed.walk((node) => {
		if (node.type === 'function' && isDataUriFunction(node)) return false;
		if (node.type !== 'word' || !/^#[0-9a-fA-F]{3,8}\b/u.test(node.value)) return;

		addViolation(
			context,
			'ds/theme-color',
			offset + node.sourceIndex,
			'Replace raw hex with a token.'
		);
	});
}

function checkSvelte(context: FileContext): void {
	let ast: SvelteNode;
	try {
		ast = parseSvelte(context.source, {
			modern: true,
			filename: context.projectPath,
		}) as unknown as SvelteNode;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown Svelte parse error.';
		addViolation(context, 'ds/route-main', 0, `Could not parse Svelte file: ${message}`);
		return;
	}

	const styleContent = ast.css?.content;
	if (styleContent?.styles && typeof styleContent.start === 'number') {
		checkCss(context, styleContent.styles, styleContent.start);
	}

	checkSvelteScriptImports(context, ast);

	walkSvelte(ast, (node) => {
		if (node.type !== 'RegularElement' && node.type !== 'Component') return;

		if (node.type === 'RegularElement') {
			checkRegularElement(context, node);
		}

		if (node.type === 'Component') {
			checkComponent(context, node);
		}
	});
}

function checkSvelteScriptImports(context: FileContext, ast: SvelteNode): void {
	for (const scriptKey of ['instance', 'module'] as const) {
		const script = ast[scriptKey] as SvelteNode | undefined;
		if (!script || !Array.isArray(script.content?.body)) continue;
		const body = script.content.body;
		const scriptOffset = script.start ?? 0;

		for (const statement of body as Array<Record<string, unknown>>) {
			if (statement.type !== 'ImportDeclaration') continue;
			const source = statement.source as { value?: unknown; start?: number } | undefined;
			const value = typeof source?.value === 'string' ? source.value : '';
			if (value === 'tailwindcss' || value.startsWith('tailwindcss/')) {
				addViolation(
					context,
					'ds/no-tailwind',
					source?.start ?? scriptOffset,
					'Remove tailwindcss imports.'
				);
			}
			if (value.includes('shadcn')) {
				addViolation(
					context,
					'ds/no-tailwind',
					source?.start ?? scriptOffset,
					'Remove shadcn imports.'
				);
			}
		}
	}
}

function checkRegularElement(context: FileContext, node: SvelteNode): void {
	if (node.name === 'main' && !matchesAnyGlob(context.projectPath, ROUTE_MAIN_ALLOWED_GLOBS)) {
		addViolation(
			context,
			'ds/route-main',
			node.start ?? 0,
			'Move page main markup to src/routes/+layout.svelte.'
		);
	}

	if (node.name === 'nav' && !hasAnyAttribute(node, ['aria-label', 'aria-labelledby'])) {
		addViolation(
			context,
			'ds/nav-aria-label',
			node.start ?? 0,
			'Add aria-label or aria-labelledby to <nav>.'
		);
	}

	if (node.name === 'img' || node.name === 'enhanced:img') {
		checkImageAttributes(context, node);
	}

	if (node.name === 'meta') {
		checkSvelteMetaViewport(context, node);
	}

	const styleAttribute = getAttribute(node, 'style');
	const styleValue = getStaticAttributeValue(styleAttribute);
	if (styleValue) {
		checkCss(context, `.inline { ${styleValue} }`, styleAttribute?.start ?? node.start ?? 0);
	}
}

function checkComponent(context: FileContext, node: SvelteNode): void {
	if (node.name === 'CmsImage') {
		checkImageAttributes(context, node);
	}
}

function checkImageAttributes(context: FileContext, node: SvelteNode): void {
	const missing = ['alt', 'width', 'height'].filter((name) => !hasAttribute(node, name));
	if (missing.length === 0) return;

	addViolation(
		context,
		'ds/image-attrs',
		node.start ?? 0,
		`${node.name ?? 'Image'} is missing ${missing.join(', ')}.`
	);
}

function checkSvelteMetaViewport(context: FileContext, node: SvelteNode): void {
	const nameValue = getStaticAttributeValue(getAttribute(node, 'name'));
	if (nameValue?.toLowerCase() !== 'viewport') return;

	const contentValue = getStaticAttributeValue(getAttribute(node, 'content')) ?? '';
	if (isLockedViewport(contentValue)) {
		addViolation(
			context,
			'ds/viewport-lock',
			node.start ?? 0,
			'Remove maximum-scale or user-scalable locks.'
		);
	}
}

function checkHtml(context: FileContext): void {
	for (const tag of context.source.matchAll(/<meta\b[^>]*>/giu)) {
		const attrs = parseHtmlAttributes(tag[0]);
		const tagOffset = tag.index ?? 0;

		if (attrs.name?.toLowerCase() === 'viewport' && isLockedViewport(attrs.content ?? '')) {
			addViolation(
				context,
				'ds/viewport-lock',
				tagOffset,
				'Remove maximum-scale or user-scalable locks.'
			);
		}

		if (attrs.name?.toLowerCase() === 'theme-color') {
			const content = attrs.content ?? '';
			const contentOffset = tagOffset + tag[0].indexOf(content);
			if (/^#[0-9a-fA-F]{3,8}\b/u.test(content) && !isAllowedThemeColorMeta(context, tagOffset)) {
				addViolation(
					context,
					'ds/theme-color',
					contentOffset,
					'Raw theme colors only belong in app.html.'
				);
			}
		}
	}
}

function addViolation(
	context: FileContext,
	ruleId: DesignSystemRuleId,
	offset: number,
	message: string
): void {
	const position = context.lineIndex.positionAt(Math.max(0, offset));
	if (isSuppressed(context, ruleId, position.line)) return;

	context.violations.push({
		ruleId,
		severity: RULES[ruleId].severity,
		file: context.projectPath,
		line: position.line,
		column: position.column,
		message: message || RULES[ruleId].message,
	});
}

function collectSuppressions(source: string): Suppression[] {
	const lineIndex = createLineIndex(source);
	const suppressions: Suppression[] = [];
	const suppressionPattern = /\/\*\s*ds-allow\s+(ds\/[a-z0-9-]+):\s*([^*]+?)\s*\*\//giu;

	for (const match of source.matchAll(suppressionPattern)) {
		const ruleId = match[1] as DesignSystemRuleId;
		const reason = match[2]?.trim() ?? '';
		if (!(ruleId in RULES) || reason.length < 10) continue;

		const line = lineIndex.positionAt(match.index ?? 0).line;
		suppressions.push({ ruleId, line });
		suppressions.push({ ruleId, line: line + 1 });
	}

	return suppressions;
}

function isSuppressed(context: FileContext, ruleId: DesignSystemRuleId, line: number): boolean {
	return context.suppressions.some(
		(suppression) => suppression.ruleId === ruleId && suppression.line === line
	);
}

function parseHtmlAttributes(tag: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const attrPattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

	for (const match of tag.matchAll(attrPattern)) {
		attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
	}

	return attrs;
}

function isLockedViewport(content: string): boolean {
	return /maximum-scale\s*=/iu.test(content) || /user-scalable\s*=\s*(?:no|0)/iu.test(content);
}

function isAllowedThemeColorMeta(context: FileContext, tagOffset: number): boolean {
	if (context.profiles.has('app-html-theme-color')) return true;

	const tag = context.source.slice(tagOffset, context.source.indexOf('>', tagOffset) + 1);
	return /<meta\b[^>]*name=["']theme-color["'][^>]*content=["']#[0-9a-fA-F]{3,8}\b/iu.test(tag);
}

function targetsDocumentScroll(selector: string): boolean {
	return selector
		.split(',')
		.map((part) => part.trim())
		.some((part) => part === 'html' || part === 'body' || part === 'html body');
}

function parseLayerNames(params: string): string[] {
	return params
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

function hasAnyAttribute(node: SvelteNode, names: string[]): boolean {
	return names.some((name) => hasAttribute(node, name));
}

function hasAttribute(node: SvelteNode, name: string): boolean {
	return Boolean(getAttribute(node, name));
}

function getAttribute(node: SvelteNode, name: string): SvelteAttribute | undefined {
	return node.attributes?.find(
		(attribute) => attribute.type === 'Attribute' && attribute.name === name
	);
}

function getStaticAttributeValue(attribute: SvelteAttribute | undefined): string | null {
	if (!attribute) return null;
	const value = attribute.value;
	if (value === true) return '';
	if (Array.isArray(value) && value.length === 1) {
		const [item] = value as Array<{ type?: string; data?: unknown; raw?: unknown }>;
		if (item.type === 'Text') return String(item.data ?? item.raw ?? '');
	}
	return null;
}

function walkSvelte(node: unknown, visit: (node: SvelteNode) => void): void {
	if (!node || typeof node !== 'object') return;
	const current = node as SvelteNode;
	visit(current);

	for (const [key, value] of Object.entries(current)) {
		if (key === 'options' || key === 'comments') continue;
		if (Array.isArray(value)) {
			for (const child of value) walkSvelte(child, visit);
		} else if (value && typeof value === 'object') {
			walkSvelte(value, visit);
		}
	}
}

function isDataUriFunction(node: valueParser.FunctionNode): boolean {
	const serialized = valueParser.stringify(node.nodes);
	return serialized.includes('data:image/svg+xml');
}

function offsetForCssNode(
	baseOffset: number,
	cssLineIndex: LineIndex,
	line: number | undefined,
	column: number | undefined
): number {
	if (!line || !column) return baseOffset;
	return baseOffset + cssLineIndex.offsetAt(line, column);
}

function createLineIndex(source: string): LineIndex {
	const lineStarts = [0];

	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === '\n') lineStarts.push(index + 1);
	}

	return {
		lineStarts,
		positionAt(offset: number) {
			let low = 0;
			let high = lineStarts.length - 1;

			while (low <= high) {
				const middle = Math.floor((low + high) / 2);
				if (lineStarts[middle] <= offset) {
					low = middle + 1;
				} else {
					high = middle - 1;
				}
			}

			const lineIndex = Math.max(0, high);
			return { line: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1 };
		},
		offsetAt(line: number, column: number) {
			const lineStart = lineStarts[Math.max(0, line - 1)] ?? 0;
			return lineStart + Math.max(0, column - 1);
		},
	};
}

function toProjectPath(rootDir: string, filePath: string): string {
	const absolute = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
	return normalizePath(relative(rootDir, absolute));
}

function normalizePath(filePath: string): string {
	return filePath.replace(/\\/gu, '/');
}

function isPackageOrConfig(projectPath: string): boolean {
	return (
		projectPath === 'package.json' ||
		projectPath.endsWith('.config.js') ||
		projectPath.endsWith('.config.ts') ||
		projectPath.endsWith('.json')
	);
}

function matchesAnyGlob(projectPath: string, patterns: string[]): boolean {
	return patterns.some((pattern) => matchesGlob(projectPath, pattern));
}

function matchesGlob(projectPath: string, pattern: string): boolean {
	return globToRegExp(pattern).test(normalizePath(projectPath));
}

function globToRegExp(pattern: string): RegExp {
	let source = '^';

	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		const next = pattern[index + 1];

		if (char === '*') {
			if (next === '*') {
				source += '.*';
				index += 1;
			} else {
				source += '[^/]*';
			}
			continue;
		}

		if (char === '?') {
			source += '[^/]';
			continue;
		}

		if (char === '{') {
			const end = pattern.indexOf('}', index);
			if (end !== -1) {
				const options = pattern
					.slice(index + 1, end)
					.split(',')
					.map((option) => escapeRegExp(option))
					.join('|');
				source += `(?:${options})`;
				index = end;
				continue;
			}
		}

		source += escapeRegExp(char);
	}

	return new RegExp(`${source}$`, 'u');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function runCli(): Promise<void> {
	const args = process.argv.slice(2);
	const changed = args.includes('--changed');
	const explicitFiles = args.filter((arg) => !arg.startsWith('--'));
	const files = changed ? await resolveChangedFiles(explicitFiles) : explicitFiles;
	const report = checkDesignSystem({
		rootDir: process.cwd(),
		files: files.length > 0 ? files : undefined,
	});

	for (const violation of report.violations) {
		const label = violation.severity === 'error' ? 'error' : 'warn';
		console[violation.severity === 'error' ? 'error' : 'warn'](
			`${violation.file}:${violation.line}:${violation.column} ${label} ${violation.ruleId} ${violation.message}`
		);
	}

	const summary = `Design-system check: ${report.errors} error(s), ${report.warnings} warning(s), ${report.checkedFiles.length} file(s) checked.`;

	if (report.errors > 0) {
		console.error(`\n${summary}\n`);
		process.exit(1);
	}

	console.log(`\n${summary}\n`);
}

async function resolveChangedFiles(explicitFiles: string[]): Promise<string[]> {
	if (explicitFiles.length > 0) return explicitFiles;

	const stdin = await readStdin();
	const stdinFiles = parseFileList(stdin);
	if (stdinFiles.length > 0) return stdinFiles;

	const cached = gitChangedFiles(['diff', '--name-only', '--diff-filter=ACMR', '--cached']);
	if (cached.length > 0) return cached;

	return gitChangedFiles(['diff', '--name-only', '--diff-filter=ACMR']);
}

async function readStdin(): Promise<string> {
	if (process.stdin.isTTY) return '';

	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	return Buffer.concat(chunks).toString('utf8');
}

function parseFileList(input: string): string[] {
	return input
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
}

function gitChangedFiles(args: string[]): string[] {
	try {
		return parseFileList(execFileSync('git', args, { encoding: 'utf8' }));
	} catch {
		return [];
	}
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
	runCli();
}
