<script lang="ts">
	/**
	 * CmsImage — for editor-uploaded images in static/uploads/.
	 *
	 * The prebuild script (scripts/optimize-images.js) generates a sibling .webp
	 * for every raster source. This component renders a <picture> that serves
	 * the .webp to supporting browsers with the original as fallback.
	 *
	 * Use <enhanced:img> (not this component) for build-time brand/developer assets
	 * in src/lib/assets/. See docs/design-system/images.md for the full decision.
	 *
	 * LCP / above-the-fold usage:
	 *   <CmsImage ... loading="eager" fetchpriority="high" />
	 *
	 * Below-the-fold (default):
	 *   <CmsImage ... />  — loading="lazy" is the default
	 */

	interface Props {
		/** Path to the source image, e.g. /uploads/hero.jpg */
		src: string;
		/** Alt text — required. Use alt="" for decorative images. */
		alt: string;
		class?: string;
		/** Defaults to "lazy". Use "eager" for above-the-fold / LCP images. */
		loading?: 'lazy' | 'eager';
		/** Defaults to "auto". Use "high" for the page's LCP image. */
		fetchpriority?: 'high' | 'auto' | 'low';
		sizes?: string;
		width?: number;
		height?: number;
	}

	let {
		src,
		alt,
		class: className,
		loading = 'lazy',
		fetchpriority = 'auto',
		sizes,
		width,
		height,
	}: Props = $props();

	// Treat already-optimised formats as pass-through — no <picture> transform needed.
	// .avif: served directly (either a manually-placed developer asset, or a Tier 1
	//   enhanced-img output that ended up in static/). Do not try to derive a .webp path.
	// .webp: already the prebuild output format — serve directly.
	const isAlreadyOptimised = $derived(
		src.toLowerCase().endsWith('.webp') || src.toLowerCase().endsWith('.avif')
	);
	const webpSrc = $derived(isAlreadyOptimised ? null : src.replace(/\.[^.]+$/, '.webp'));
</script>

{#if webpSrc}
	<picture>
		<source srcset={webpSrc} type="image/webp" {sizes} />
		<img {src} {alt} class={className} {loading} {fetchpriority} {sizes} {width} {height} />
	</picture>
{:else}
	<img {src} {alt} class={className} {loading} {fetchpriority} {sizes} {width} {height} />
{/if}
