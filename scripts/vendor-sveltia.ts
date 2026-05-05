#!/usr/bin/env bun
/**
 * Vendor the @sveltia/cms bundle from node_modules into static/admin/sveltia/.
 *
 * The /admin path used to load Sveltia from https://unpkg.com at runtime, which
 * required widening the admin CSP with 'unsafe-eval' and an external origin.
 * Self-hosting drops both: the bundle is served same-origin from /admin/sveltia/.
 *
 * Runs as a postinstall hook so the file is present after `bun install` for
 * dev, CI validate, and the Containerfile builder stage. The runtime image
 * picks it up via `bun run build` copying static/ into build/.
 *
 * static/admin/sveltia/ is gitignored — bun.lock pins @sveltia/cms version,
 * vendor-sveltia regenerates the file. See .sveltia-version for the active
 * version + SHA-256 of the vendored bundle.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = resolve(ROOT, 'node_modules/@sveltia/cms/dist/sveltia-cms.js');
const TARGET_DIR = resolve(ROOT, 'static/admin/sveltia');
const TARGET = resolve(TARGET_DIR, 'sveltia-cms.js');
const STAMP = resolve(TARGET_DIR, '.sveltia-version');
const SVELTIA_PKG = resolve(ROOT, 'node_modules/@sveltia/cms/package.json');

function readPackageVersion(path: string): string {
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
	if (typeof parsed.version !== 'string' || !parsed.version) {
		throw new Error(`@sveltia/cms package.json at ${path} has no version.`);
	}
	return parsed.version;
}

function main(): void {
	if (!existsSync(SOURCE)) {
		// Skip silently when @sveltia/cms is not installed (e.g. when running
		// against a partial fixture). The /admin route is unused in that case.
		return;
	}

	mkdirSync(TARGET_DIR, { recursive: true });
	copyFileSync(SOURCE, TARGET);

	const version = readPackageVersion(SVELTIA_PKG);
	const hash = createHash('sha256').update(readFileSync(TARGET)).digest('hex');

	writeFileSync(STAMP, `@sveltia/cms@${version}\nsha256:${hash}\nsource: ${SOURCE}\n`, 'utf8');

	console.log(`✓ vendored @sveltia/cms@${version} → static/admin/sveltia/sveltia-cms.js`);
	console.log(`  sha256: ${hash}`);
}

main();
