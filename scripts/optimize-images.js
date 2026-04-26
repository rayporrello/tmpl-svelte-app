/**
 * Prebuild script: optimize CMS-uploaded images in static/uploads/.
 *
 * Scans for raster source files, generates sibling .webp variants, skips
 * files whose .webp is already newer than the source, and caps width at
 * 2560px without upscaling. Exits 0 when there are no images to process.
 *
 * Format decision: WebP only — intentional.
 * AVIF would cut file sizes a further 20–30% but encodes 5–20× slower with
 * Sharp. A site with 30 uploads would add ~30s to every build. Tier 1 images
 * (src/lib/assets/ via <enhanced:img>) already get AVIF+WebP automatically
 * from the Vite plugin — no manual step needed there. If a future project
 * needs AVIF for CMS uploads, generate it as an additional pass and update
 * CmsImage to add an <source type="image/avif"> before the WebP source.
 *
 * Run: bun run scripts/optimize-images.js
 * Triggered automatically by the "prebuild" npm script.
 */

import { glob } from 'glob';
import sharp from 'sharp';
import { existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, '..', 'static', 'uploads');

const MAX_WIDTH = 2560;
const WEBP_QUALITY = 82;

const sources = await glob('**/*.{jpg,jpeg,png,tiff,JPG,JPEG,PNG,TIFF}', {
	cwd: uploadsDir,
	absolute: true,
	nodir: true
});

if (sources.length === 0) {
	console.log('optimize-images: no uploads to process — static/uploads/ is empty.');
	process.exit(0);
}

let processed = 0;
let skipped = 0;

for (const sourcePath of sources) {
	const webpPath = sourcePath.replace(/\.[^.]+$/, '.webp');

	if (existsSync(webpPath)) {
		const sourceMtime = statSync(sourcePath).mtimeMs;
		const webpMtime = statSync(webpPath).mtimeMs;
		if (webpMtime >= sourceMtime) {
			skipped++;
			continue;
		}
	}

	try {
		const image = sharp(sourcePath);
		const { width } = await image.metadata();

		let pipeline = image;
		if (width && width > MAX_WIDTH) {
			pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
		}

		await pipeline.webp({ quality: WEBP_QUALITY }).toFile(webpPath);
		processed++;
		console.log(`  ✓ ${sourcePath.replace(uploadsDir + '/', '')} → .webp`);
	} catch (err) {
		console.error(`  ✗ Failed: ${sourcePath}`, err.message);
		process.exit(1);
	}
}

console.log(
	`optimize-images: done — ${processed} converted, ${skipped} already current.`
);
