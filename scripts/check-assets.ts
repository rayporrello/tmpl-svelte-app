/**
 * Validates presence and dimensions of required static assets.
 * Part of `bun run validate` (PR-grade check).
 *
 * Required assets:
 *   static/favicon.svg          — valid SVG, parseable with <svg> root
 *   static/favicon-32.png       — exactly 32×32
 *   static/apple-touch-icon.png — exactly 180×180
 *   static/og-default.png       — exactly 1200×630
 *   static/site.webmanifest     — present, valid JSON, >100 bytes
 *
 * Run: bun run check:assets
 */

import sharp from 'sharp';
import { existsSync, readFileSync, statSync } from 'fs';
import { site } from '../src/lib/config/site';

const MIN_BYTES = 100;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

interface Result {
	pass: boolean;
	message: string;
}

function checkPresenceAndSize(path: string): Result | null {
	if (!existsSync(path)) return { pass: false, message: `MISSING: ${path}` };
	const size = statSync(path).size;
	if (size < MIN_BYTES)
		return { pass: false, message: `TOO SMALL: ${path} (${size} bytes, min ${MIN_BYTES})` };
	if (size > MAX_BYTES)
		return { pass: false, message: `TOO LARGE: ${path} (${size} bytes, max 5 MB)` };
	return null;
}

async function checkPng(path: string, width: number, height: number): Promise<Result> {
	const pre = checkPresenceAndSize(path);
	if (pre) return pre;
	const meta = await sharp(path).metadata();
	if (meta.width !== width || meta.height !== height) {
		return {
			pass: false,
			message: `WRONG DIMENSIONS: ${path} — expected ${width}×${height}, got ${meta.width ?? '?'}×${meta.height ?? '?'}`,
		};
	}
	return { pass: true, message: `OK: ${path} (${width}×${height})` };
}

function checkSvg(path: string): Result {
	const pre = checkPresenceAndSize(path);
	if (pre) return pre;
	const content = readFileSync(path, 'utf-8');
	const hasSvgOpen = /<svg[\s>]/.test(content);
	const hasSvgClose = /<\/svg>/.test(content);
	if (!hasSvgOpen || !hasSvgClose) {
		return { pass: false, message: `INVALID SVG: ${path} — missing <svg> root element` };
	}
	return { pass: true, message: `OK: ${path} (valid SVG)` };
}

function checkManifest(path: string): Result {
	const pre = checkPresenceAndSize(path);
	if (pre) return pre;
	const content = readFileSync(path, 'utf-8');
	try {
		JSON.parse(content);
	} catch {
		return { pass: false, message: `INVALID JSON: ${path}` };
	}
	return { pass: true, message: `OK: ${path} (valid JSON)` };
}

/**
 * Confirm that `site.defaultOgImage` resolves to an actual file under `static/`.
 * The SEO component emits this path on every page that does not set its own
 * image, so a stale path here results in a broken og:image tag site-wide.
 * Skipped when the value is an absolute URL (CDN-hosted default).
 */
function checkDefaultOgImagePath(): Result {
	const value = site.defaultOgImage;
	if (!value) {
		return { pass: false, message: 'site.defaultOgImage is empty in src/lib/config/site.ts' };
	}
	if (value.startsWith('http://') || value.startsWith('https://')) {
		return { pass: true, message: `OK: site.defaultOgImage is a remote URL (${value})` };
	}
	const normalized = value.startsWith('/') ? value.slice(1) : value;
	const onDisk = `static/${normalized}`;
	if (!existsSync(onDisk)) {
		return {
			pass: false,
			message: `MISSING: site.defaultOgImage points at "${value}" but ${onDisk} does not exist`,
		};
	}
	return { pass: true, message: `OK: site.defaultOgImage resolves to ${onDisk}` };
}

const results: Result[] = await Promise.all([
	Promise.resolve(checkSvg('static/favicon.svg')),
	checkPng('static/favicon-32.png', 32, 32),
	checkPng('static/apple-touch-icon.png', 180, 180),
	checkPng('static/og-default.png', 1200, 630),
	Promise.resolve(checkManifest('static/site.webmanifest')),
	Promise.resolve(checkDefaultOgImagePath()),
]);

let failed = false;
for (const r of results) {
	const prefix = r.pass ? '✓' : '✗';
	console.log(`${prefix} ${r.message}`);
	if (!r.pass) failed = true;
}

if (failed) {
	console.error('\ncheck:assets failed — fix the issues above before committing.');
	process.exit(1);
} else {
	console.log('\nAll assets valid.');
}
