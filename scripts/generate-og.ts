#!/usr/bin/env bun
/**
 * Generate static/og-default.png from site.project.json.
 *
 * Renders a 1200×630 OG image using the project's theme color, site name,
 * and meta description. Output passes the LAUNCH-OG-001 placeholder check
 * because the rendered hash differs from TEMPLATE_OG_SHA256.
 *
 * Run: bun run assets:generate-og
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { isTemplateProjectManifest, readProjectManifest } from './lib/site-project';

function escapeXml(value: string): string {
	return value
		.replace(/&/gu, '&amp;')
		.replace(/</gu, '&lt;')
		.replace(/>/gu, '&gt;')
		.replace(/"/gu, '&quot;')
		.replace(/'/gu, '&apos;');
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
	const words = text.split(/\s+/u).filter(Boolean);
	const lines: string[] = [];
	let current = '';
	let i = 0;
	while (i < words.length && lines.length < maxLines) {
		const word = words[i];
		const next = current ? `${current} ${word}` : word;
		if (next.length <= maxCharsPerLine) {
			current = next;
			i++;
		} else if (current) {
			lines.push(current);
			current = '';
		} else {
			// Single word longer than the line limit — accept the overflow.
			lines.push(word);
			i++;
		}
	}
	if (current && lines.length < maxLines) lines.push(current);
	if (i < words.length && lines.length === maxLines) {
		const last = lines[maxLines - 1];
		const trimLen = Math.max(0, maxCharsPerLine - 1);
		lines[maxLines - 1] = last.slice(0, trimLen).trimEnd() + '…';
	}
	return lines;
}

function buildSvg(opts: {
	bg: string;
	siteName: string;
	description: string;
	domain: string;
}): string {
	const nameLines = wrapText(opts.siteName, 22, 2);
	const descLines = wrapText(opts.description, 56, 2);

	const nameTspans = nameLines
		.map((line, idx) => `<tspan x="80" dy="${idx === 0 ? 0 : 96}">${escapeXml(line)}</tspan>`)
		.join('');

	const descTspans = descLines
		.map((line, idx) => `<tspan x="80" dy="${idx === 0 ? 0 : 44}">${escapeXml(line)}</tspan>`)
		.join('');

	// nameY/descY shift up when the headline wraps so the layout feels intentional
	// at 1 or 2 lines without overlapping the description.
	const nameY = nameLines.length === 1 ? 300 : 240;
	const descY = nameLines.length === 1 ? 440 : 460;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
		<rect width="1200" height="630" fill="${escapeXml(opts.bg)}"/>
		<rect x="40" y="40" width="1120" height="550" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
		<text x="80" y="${nameY}" font-family="-apple-system, system-ui, sans-serif" font-size="84" font-weight="700" fill="#ffffff">${nameTspans}</text>
		<text x="80" y="${descY}" font-family="-apple-system, system-ui, sans-serif" font-size="32" font-weight="400" fill="rgba(255,255,255,0.78)">${descTspans}</text>
		<text x="1120" y="568" font-family="ui-monospace, monospace" font-size="22" font-weight="400" fill="rgba(255,255,255,0.55)" text-anchor="end">${escapeXml(opts.domain)}</text>
	</svg>`;
}

async function main(): Promise<void> {
	const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
	const manifest = readProjectManifest(root);

	if (isTemplateProjectManifest(manifest)) {
		throw new Error(
			'site.project.json is still in template state. Run bun run init:site before generating an OG image.'
		);
	}

	const svg = buildSvg({
		bg: manifest.site.themeColor,
		siteName: manifest.site.name,
		description: manifest.site.defaultDescription,
		domain: manifest.site.productionDomain,
	});

	const png = await sharp(Buffer.from(svg)).resize(1200, 630).png().toBuffer();
	writeFileSync(resolve(root, 'static/og-default.png'), png);

	const sizeKb = (png.byteLength / 1024).toFixed(1);
	console.log(`✓ static/og-default.png (1200×630, ${sizeKb} KB)`);
	console.log(`  Site:        ${manifest.site.name}`);
	console.log(`  Description: ${manifest.site.defaultDescription}`);
	console.log(`  Theme:       ${manifest.site.themeColor}`);
}

const isMain = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
if (isMain) {
	main().catch((err) => {
		console.error('assets:generate-og failed:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
}

// Exported for tests.
export { buildSvg, wrapText };
