# Images

Permanent reference for all image handling in this template. This document is the canonical source of truth for image decisions. See [ADR-009](../planning/adrs/ADR-009-image-pipeline.md) for the rationale.

---

## Quick start — "I have an image, what do I do?"

### Step 1 — One question decides everything

> **Do you know this image's path at build time?**

| Answer                                                             | Folder            | Component        | Why                                                                                          |
| ------------------------------------------------------------------ | ----------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **Yes** — the file is committed to the repo and referenced in code | `src/lib/assets/` | `<enhanced:img>` | Vite resolves the import at build time → AVIF + WebP + srcset, automatically                 |
| **No** — the path is a string from a CMS, database, or user upload | `static/uploads/` | `<CmsImage>`     | `<enhanced:img>` cannot process runtime strings; the prebuild script optimises these to WebP |

**If you are not using CMS uploads yet, always use `src/lib/assets/` + `<enhanced:img>` for everything.** `CmsImage` exists only for images whose paths are determined at runtime.

The distinction is not about who created the image or whether it is already optimised — both paths handle optimisation automatically. It is purely about whether Vite can see the path at build time.

---

### Step 2 — Write the markup

**Brand image (`src/lib/assets/`):**

```svelte
<script>
	import teamPhoto from '$lib/assets/team.jpg';
</script>

<figure>
	<enhanced:img src={teamPhoto} alt="The Acme team at our 2026 offsite" width={1200} height={800} />
	<figcaption>Our team, April 2026</figcaption>
</figure>
```

**CMS upload (`static/uploads/`):**

```svelte
<script>
	import CmsImage from '$lib/components/CmsImage.svelte';
</script>

<figure>
	<CmsImage
		src="/uploads/team.jpg"
		alt="The Acme team at our 2026 offsite"
		width={1200}
		height={800}
	/>
	<figcaption>Our team, April 2026</figcaption>
</figure>
```

---

### Step 3 — Two attributes you always write yourself

The pipeline handles format conversion, `<picture>` semantics, and compression automatically. These two are always your responsibility:

| Attribute          | Why                   | Notes                                                                                           |
| ------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| `alt`              | Accessibility and SEO | Describe what is in the image. Use `alt=""` for decorative images.                              |
| `width` + `height` | Prevents layout shift | Use the image's actual pixel dimensions. The browser reserves the space before the image loads. |

---

### Step 4 — Is this the first big image visible on page load?

If yes (hero, banner, above the fold): add `loading="eager" fetchpriority="high"`.

```svelte
<enhanced:img src={hero} alt="..." width={1440} height={600} loading="eager" fetchpriority="high" />
```

If no: do nothing. `loading="lazy"` is the default for both components.

---

### What the pipeline does automatically

| What you get for free                   | Tier 1 (`<enhanced:img>`) | Tier 2 (`<CmsImage>`) |
| --------------------------------------- | ------------------------- | --------------------- |
| `<picture>` element with format sources | ✓                         | ✓                     |
| AVIF generation                         | ✓ (Vite plugin)           | —                     |
| WebP generation                         | ✓ (Vite plugin)           | ✓ (prebuild script)   |
| Responsive srcset                       | ✓                         | —                     |
| `loading="lazy"` default                | ✓                         | ✓                     |
| Max-width cap (2560px)                  | ✓                         | ✓                     |

---

## Three-tier model

| Tier | What                                             | Where             | How                           | Status                    |
| ---- | ------------------------------------------------ | ----------------- | ----------------------------- | ------------------------- |
| 1    | Build-time images (path known at compile time)   | `src/lib/assets/` | `<enhanced:img>`              | **Default — implemented** |
| 2    | Runtime images (path is a string from CMS or DB) | `static/uploads/` | `<CmsImage>` + Sharp prebuild | **Default — implemented** |
| 3    | Heavy / portfolio media (R2)                     | Remote CDN        | Optional module               | Deferred — see below      |

Tier 1 is the default for everything. Tier 2 is only needed when image paths are determined at runtime (CMS content, database records, user uploads). Tier 3 activates only for portfolio-heavy sites.

---

## Tier 1 — Build-time images (`<enhanced:img>`)

**What goes here:** Any image whose path you write in code — logos, hero images, team photos, product screenshots, illustrations, icons. If you commit the file to the repo and import it, it belongs here. You do not need to pre-optimise these; the Vite plugin handles it.

**Location:** `src/lib/assets/`

**Usage:**

```svelte
<script>
	import heroImage from '$lib/assets/hero.jpg';
</script>

<!-- Standard figure pattern -->
<figure>
	<enhanced:img src={heroImage} alt="Descriptive alt text" width={1200} height={600} />
	<figcaption>Optional caption</figcaption>
</figure>

<!-- LCP / above-the-fold hero — never lazy-load the primary viewport image -->
<enhanced:img
	src={heroImage}
	alt="Hero image description"
	loading="eager"
	fetchpriority="high"
	width={1200}
	height={600}
/>

<!-- Below the fold — lazy load everything else -->
<enhanced:img src={teamPhoto} alt="Team photo" loading="lazy" width={800} height={500} />
```

**Rules:**

- `@sveltejs/enhanced-img` is configured in `vite.config.ts` with `enhancedImages()` before `sveltekit()`.
- `<enhanced:img>` only works for build-time images committed to `src/`. It cannot process `static/uploads/`.
- Always include `width` and `height` to prevent layout shift.
- Always include `alt` text. Use `alt=""` for decorative images.
- Wrap in `<figure>` for meaningful images (see semantic HTML contract).

---

## Tier 2 — Runtime images (`<CmsImage>`)

**What goes here:** Images whose paths arrive as strings at runtime — from a CMS content file, a database record, or a user upload. The defining characteristic is that you cannot write `import img from '$lib/assets/...'` for them because the path is not fixed in code. Blog post featured images loaded from Sveltia CMS, user-submitted photos, and any image where the path is data rather than code all belong here.

**Location:** `static/uploads/` (committed, including generated `.webp` siblings)

**Component:** `src/lib/components/CmsImage.svelte`

**Usage:**

```svelte
<script>
	import CmsImage from '$lib/components/CmsImage.svelte';
</script>

<!-- Standard usage — lazy by default -->
<figure>
	<CmsImage
		src="/uploads/team/jane.jpg"
		alt="Jane Smith, Head of Design"
		width={400}
		height={400}
	/>
	<figcaption>Jane Smith, Head of Design</figcaption>
</figure>

<!-- Above-the-fold hero uploaded through CMS -->
<CmsImage
	src="/uploads/hero.jpg"
	alt="Hero description"
	loading="eager"
	fetchpriority="high"
	sizes="100vw"
	width={1440}
	height={720}
/>
```

**How it works:** The component renders a `<picture>` element with a `.webp` `<source>` and the original as fallback. The sibling `.webp` file is generated by the prebuild script.

**Prebuild script:** `scripts/optimize-images.js` runs automatically before every `bun run build` via the `prebuild` npm hook. It:

- Scans `static/uploads/**/*.{jpg,jpeg,png,tiff}`
- Generates sibling `.webp` files at quality 82
- Resizes only when wider than 2560px
- Skips `.webp` files already newer than the source
- Exits 0 when the uploads directory is empty

**Committed files:** Both source images and generated `.webp` siblings are committed to the repo. Do not gitignore `.webp` files in `static/uploads/`.

---

## LCP and loading rules

| Context                       | `loading` | `fetchpriority`  | Notes                                   |
| ----------------------------- | --------- | ---------------- | --------------------------------------- |
| Hero / primary viewport image | `eager`   | `high`           | Never lazy-load the LCP image           |
| First image below the fold    | `lazy`    | `auto` (default) | Standard deferred loading               |
| All other images              | `lazy`    | `auto` (default) | Default                                 |
| Decorative (no meaning)       | N/A       | N/A              | Use CSS `background-image`, not `<img>` |

**LCP checklist:** The LCP image is the largest visible element at page load. On a typical marketing page this is the hero image. For that image:

1. Never use `loading="lazy"` — it delays the fetch until the element enters the viewport.
2. Always use `fetchpriority="high"` — moves it to the high-priority fetch queue.
3. Provide `width` and `height` — prevents layout shift during load.

---

## Standard image sizes

Use these as defaults. If your design calls for a different size, match the design — these are starting points, not hard constraints.

### Two numbers to track per image

**Source file** — what you drop into `src/lib/assets/` or `static/uploads/`. Needs to be large enough to stay sharp on high-DPI screens. A retina display showing an image at 960 CSS pixels wide needs a 1920px source to look crisp (960 × 2 DPR). Our prebuild caps at 2560px, which is the practical sweet spot for most sites. You do not need to pre-compress or resize — the pipeline does it.

**`width` / `height` attributes** — set these to match the source file dimensions for Tier 1 images (the plugin generates srcset from there and the browser picks the right variant). For Tier 2 (`CmsImage`, no srcset), set them to the expected display dimensions so the browser reserves the right layout space. In both cases, CSS controls the actual rendered size — `width`/`height` primarily establish the aspect ratio and prevent layout shift.

**`sizes` attribute** — add `sizes="100vw"` to any full-bleed image so the browser knows to fetch a variant that fills the viewport, not assume a narrower container.

### Standard sizes by use case

| Use case                  | Source file | `width` attr | `height` attr | Aspect ratio | CSS to enforce shape                      |
| ------------------------- | ----------- | ------------ | ------------- | ------------ | ----------------------------------------- |
| Hero / full-bleed banner  | 2560 × 1280 | 1920         | 960           | 2:1          | `aspect-ratio: 2/1; object-fit: cover`    |
| Section feature image     | 1920 × 1080 | 1600         | 900           | 16:9         | `aspect-ratio: 16/9; object-fit: cover`   |
| Article / blog featured   | 1200 × 630  | 1200         | 630           | 1.91:1       | `aspect-ratio: 1.91/1; object-fit: cover` |
| Card image (2–3 per row)  | 1200 × 675  | 800          | 450           | 16:9         | `aspect-ratio: 16/9; object-fit: cover`   |
| Card image (4+ per row)   | 800 × 533   | 600          | 400           | 3:2          | `aspect-ratio: 3/2; object-fit: cover`    |
| Team headshot / avatar    | 600 × 600   | 400          | 400           | 1:1          | `aspect-ratio: 1; object-fit: cover`      |
| Open Graph / social share | 1200 × 630  | —            | —             | 1.91:1       | Not displayed on-page                     |
| Logo                      | SVG         | —            | —             | —            | Always SVG — see below                    |

**Retina logic:** source file size ÷ DPR = maximum sharp CSS pixel width. A 1920px source at 2× DPR covers a 960px CSS display. A 2560px source at 2× covers a 1280px CSS display — which handles most MacBook viewports. For a full-bleed hero on a 4K monitor at 2×, you'd technically want 3840px, but 2560px (our prebuild cap) is the practical ceiling for marketing sites.

The `width` attr values above are for `<enhanced:img>` (Tier 1). For `<CmsImage>` (Tier 2, no srcset), use the _display_ size your design shows — the browser loads that one file for all screens.

### Why aspect ratio enforcement matters

Without `aspect-ratio` in CSS, the image's intrinsic dimensions control the space it takes up — two slightly different headshots will render at different heights and break your grid. Set it in CSS and every image fills the same box regardless of source dimensions.

```css
/* In a component <style> block — team headshot */
.headshot {
	width: 200px;
	height: 200px;
	aspect-ratio: 1;
	object-fit: cover;
	border-radius: var(--radius-full);
}

/* Card image in a grid */
.card-image {
	width: 100%;
	aspect-ratio: 16 / 9;
	object-fit: cover;
}
```

With `object-fit: cover`, your source images just need to be close to the target ratio — the browser crops to fit. An 800×600 image in a 16:9 box will crop cleanly rather than squash or letterbox.

### Logos and icons

Always use SVG for logos and icons. SVG is resolution-independent (looks sharp at any size), has transparent backgrounds, and is tiny. If a client provides a PNG logo, ask for the SVG source.

If SVG is unavailable, use a PNG at 2× the display size — a logo displayed at 120×40px should be 240×80px minimum.

---

## File size targets (after optimisation)

These are what the pipeline produces — you do not need to hit these manually.

| Type                              | Typical result | Alert if over |
| --------------------------------- | -------------- | ------------- |
| Hero (WebP / AVIF)                | 80–150 KB      | 300 KB        |
| Section / article featured (WebP) | 60–120 KB      | 200 KB        |
| Card image (WebP)                 | 20–50 KB       | 100 KB        |
| Team headshot (WebP)              | 15–35 KB       | 60 KB         |

If the source file produces a WebP over the "alert" threshold, the source is likely over-large or low-quality JPEG artifacting. Swap the source for a cleaner original.

These are guidelines. The Sharp prebuild generates WebP at quality 82 — most images will fall within these targets automatically.

---

## Format rules

| Format      | Use for                                    | Notes                                              |
| ----------- | ------------------------------------------ | -------------------------------------------------- |
| WebP        | Tier 2 CMS uploads (generated by prebuild) | Generated automatically from JPG/PNG/TIFF sources  |
| AVIF + WebP | Tier 1 brand images via `<enhanced:img>`   | Both generated automatically by the Vite plugin    |
| JPG / JPEG  | Source raster photos (Tier 2)              | Editor originals; prebuild converts to WebP        |
| PNG         | Source images with transparency (Tier 2)   | If no transparency, prefer JPG                     |
| SVG         | Logos, icons, illustrations, charts        | Always prefer SVG for non-photographic art         |
| GIF         | **Do not use**                             | Use CSS animation or `<video autoplay loop muted>` |
| TIFF        | Source only                                | Never served directly; converted by prebuild       |

### Why Tier 1 gets AVIF and Tier 2 gets WebP only

`@sveltejs/enhanced-img` generates both AVIF and WebP at build time with no extra cost — the Vite plugin handles it. AVIF is 20–30% smaller than WebP at equivalent quality.

The Sharp prebuild script (`scripts/optimize-images.js`) generates WebP only. AVIF encoding is 5–20× slower than WebP with Sharp — a site with 30 CMS uploads would add ~30 seconds to every build. WebP is a significant improvement over JPEG for those images, and the build-time cost is acceptable.

**To add AVIF for Tier 2 on a specific project:** run a second Sharp pass generating `.avif` siblings, then add a `<source type="image/avif">` before the WebP source in `CmsImage.svelte`. Do not make this the default in the base template.

---

## Tier 3 — Heavy media (R2, optional)

**When to activate:** Only for sites with a large portfolio gallery (50+ images), video hosting, or downloadable assets over 50 MB total that would bloat the repo.

**What it involves:**

- Cloudflare R2 bucket for binary asset storage
- Optional: Cloudflare Image Resizing for on-the-fly transforms
- A loader component that constructs R2 URLs
- Environment variables for R2 endpoint and bucket name

**Default posture:** R2 is not implemented in the base template. Do not add it as a default. Document it as an activation path when a specific project crosses the threshold.

---

## Agent rules — do not do these

- **Never** put CMS/editor uploads in `src/`. Enhanced-img cannot process them, and they belong in `static/uploads/`.
- **Never** use plain `<img>` for brand images or CMS images without a documented exception.
- **Never** add `loading="lazy"` to the page's primary hero / LCP image.
- **Never** use `background-image` for meaningful content images — use `<img>` inside `<figure>`.
- **Never** use GIF format. Use CSS animation or `<video autoplay loop muted playsinline>`.
- **Never** commit large video files to the repo. Use Tier 3 (R2) or an embed.
- **Never** add Cloudflare R2 implementation code to the base template. Document the activation path only.
- **Never** use a third-party image CDN as the default for a simple marketing site.
- **Never** omit `width` and `height` attributes from `<img>` elements.
- **Never** use `<enhanced:img>` for images that come from a CMS or user uploads.
