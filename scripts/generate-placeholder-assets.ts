/**
 * Generates placeholder static assets for a fresh template clone.
 * Run once per template; replace outputs with real assets per project.
 *
 * Outputs:
 *   static/favicon.svg         — placeholder SVG mark
 *   static/favicon-32.png      — 32×32 PNG favicon
 *   static/apple-touch-icon.png — 180×180 PNG
 *   static/og-default.png      — 1200×630 OG image with "REPLACE PER PROJECT" overlay
 *   static/site.webmanifest    — placeholder web app manifest
 *
 * Run: bun run scripts/generate-placeholder-assets.ts
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

mkdirSync('static', { recursive: true });

const FG = '#ffffff';

// ── favicon.svg ───────────────────────────────────────────────────────────────
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#0B1120" rx="4"/>
  <text x="16" y="22" font-family="monospace,sans-serif" font-size="18" font-weight="bold"
        fill="${FG}" text-anchor="middle">?</text>
</svg>`;
writeFileSync('static/favicon.svg', svgContent, 'utf-8');
console.log('✓ static/favicon.svg');

// ── favicon-32.png ────────────────────────────────────────────────────────────
const faviconSvgBuf = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#0B1120" rx="4"/>
    <text x="16" y="22" font-family="monospace,sans-serif" font-size="18" font-weight="bold"
          fill="${FG}" text-anchor="middle">?</text>
  </svg>`
);
await sharp(faviconSvgBuf).resize(32, 32).png().toFile('static/favicon-32.png');
console.log('✓ static/favicon-32.png (32×32)');

// ── apple-touch-icon.png ──────────────────────────────────────────────────────
const appleSvgBuf = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
    <rect width="180" height="180" fill="#0B1120" rx="12"/>
    <text x="90" y="105" font-family="monospace,sans-serif" font-size="80" font-weight="bold"
          fill="${FG}" text-anchor="middle">?</text>
    <text x="90" y="160" font-family="monospace,sans-serif" font-size="14"
          fill="#ffffff88" text-anchor="middle">REPLACE</text>
  </svg>`
);
await sharp(appleSvgBuf).resize(180, 180).png().toFile('static/apple-touch-icon.png');
console.log('✓ static/apple-touch-icon.png (180×180)');

// ── og-default.png ────────────────────────────────────────────────────────────
const ogSvgBuf = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#0B1120"/>
    <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#334155" stroke-width="2" rx="8"/>
    <text x="600" y="280" font-family="monospace,sans-serif" font-size="72" font-weight="bold"
          fill="#ffffff" text-anchor="middle">REPLACE PER PROJECT</text>
    <text x="600" y="370" font-family="monospace,sans-serif" font-size="32"
          fill="#94a3b8" text-anchor="middle">og-default.png — 1200×630</text>
    <text x="600" y="430" font-family="monospace,sans-serif" font-size="24"
          fill="#64748b" text-anchor="middle">Replace with a real OG image before launch</text>
  </svg>`
);
await sharp(ogSvgBuf).resize(1200, 630).png().toFile('static/og-default.png');
console.log('✓ static/og-default.png (1200×630)');

// Print hash for embedding in check-launch.ts
const ogBuf = await sharp('static/og-default.png').toBuffer();
const ogHash = createHash('sha256').update(ogBuf).digest('hex');
console.log(`\nog-default.png SHA-256: ${ogHash}`);
console.log('→ Embed this in scripts/check-launch.ts as OG_PLACEHOLDER_HASH');

// ── site.webmanifest ──────────────────────────────────────────────────────────
const manifest = {
	name: 'Your Site Name',
	short_name: 'Your Site',
	description: 'REPLACE PER PROJECT',
	start_url: '/',
	display: 'standalone',
	theme_color: '#0B1120',
	background_color: '#0B1120',
	icons: [
		{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
		{ src: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
	],
};
writeFileSync('static/site.webmanifest', JSON.stringify(manifest, null, 2), 'utf-8');
console.log('✓ static/site.webmanifest');
console.log('\nAll placeholder assets generated. Replace before launch.');
