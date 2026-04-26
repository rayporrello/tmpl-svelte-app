<script lang="ts">
	import CmsImage from '$lib/components/CmsImage.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
</script>

<SEO
	seo={{
		title: 'Styleguide',
		description: 'Design system reference — not for public indexing.',
		canonicalPath: '/styleguide',
		robots: 'noindex, nofollow'
	}}
/>

<!-- ── Hero ─────────────────────────────────────────────────────────────── -->
<!-- In a real project: <Section id="hero"> wraps this section/container pattern -->
<section id="hero">
	<div class="container">
		<h1>Design System Styleguide</h1>
		<p class="text-secondary" style="max-width: var(--content-prose)">
			A living reference for the visual system, semantic HTML contract, and component patterns.
			Built for both human developers and LLM coding agents.
		</p>
	</div>
</section>

<!-- ── Typography ─────────────────────────────────────────────────────── -->
<section id="typography" style="background: var(--surface-sunken)">
	<div class="container">
		<h2>Typography</h2>
		<div class="flow" style="max-width: var(--content-prose)">
			<p class="text-muted text-sm">
				<code>&lt;h1&gt;</code> is the page title — see the hero section above.
				Demonstrated below: h2 through h4 and body type.
			</p>
			<h2>Heading 2 — Section</h2>
			<h3>Heading 3 — Subsection</h3>
			<h4>Heading 4 — Label</h4>
			<p>
				Body text. The quick brown fox jumps over the lazy dog.
				Design tokens drive all spacing, color, and type. This paragraph
				shows the default prose measure and <a href="#typography">link color</a>.
			</p>
			<p>
				<small>Small / muted text for captions, legal copy, and metadata.</small>
			</p>
			<blockquote>
				A blockquote pulls a key thought out of the body copy and gives it
				breathing room with an accent border.
			</blockquote>
			<p>Inline <code>code</code> and a <mark>highlighted term</mark>.</p>
			<pre><code>// Code block
const greeting = 'Hello, world!';</code></pre>
		</div>
	</div>
</section>

<!-- ── Semantic HTML Patterns ────────────────────────────────────────── -->
<section id="semantic-html" style="background: var(--surface-sunken)">
	<div class="container">
		<h2>Semantic HTML Patterns</h2>
		<p class="text-secondary" style="max-width: var(--content-prose)">
			The semantic HTML contract for this template. Use these patterns by default.
			Reach for a <code>&lt;div&gt;</code> only when no semantic element fits.
			Full reference: <code>docs/design-system/semantic-html-guide.md</code>.
		</p>

		<!-- Article -->
		<h3>Article</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Self-contained content (blog posts, news items, product cards) uses
			<code>&lt;article&gt;</code>.
		</p>
		<div class="cluster">
			<article class="card" style="max-width: 20rem">
				<h4>Self-contained card</h4>
				<p>
					Blog posts, news items, and product cards are <code>&lt;article&gt;</code> elements —
					they make sense independently of the surrounding page.
				</p>
				<p><a href="#semantic-html">Read more</a></p>
			</article>
		</div>

		<!-- Figure with image -->
		<h3>Figure &amp; Figcaption</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Meaningful images and media are wrapped in <code>&lt;figure&gt;</code>.
			CSS <code>background-image</code> is only for decorative visuals.
		</p>
		<figure
			style="
				max-width: 32rem;
				background: var(--surface-raised);
				padding: var(--space-4);
				border-radius: var(--radius-md);
				border: 1px solid var(--border-structural);
			"
		>
			<img
				src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='240' viewBox='0 0 480 240'%3E%3Crect width='480' height='240' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui' font-size='16' fill='%2364748b'%3EPlaceholder 480%C3%97240%3C/text%3E%3C/svg%3E"
				alt="Placeholder demonstrating the figure element pattern"
				width="480"
				height="240"
			/>
			<figcaption>
				Caption providing context for the figure. Always include
				<code>width</code> and <code>height</code> to prevent layout shift.
			</figcaption>
		</figure>

		<!-- Blockquote in figure -->
		<h3>Blockquote with Attribution</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			A <code>&lt;blockquote&gt;</code> inside <code>&lt;figure&gt;</code> enables
			proper semantic attribution via <code>&lt;figcaption&gt;</code>.
		</p>
		<figure style="max-width: var(--content-prose)">
			<blockquote>
				Good design is as little design as possible.
			</blockquote>
			<figcaption>— <cite>Dieter Rams</cite>, Ten Principles of Good Design</figcaption>
		</figure>

		<!-- Definition list -->
		<h3>Definition List</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Key-value metadata uses <code>&lt;dl&gt;</code>, <code>&lt;dt&gt;</code>, and
			<code>&lt;dd&gt;</code> — not a table or a div stack.
		</p>
		<dl class="flow" style="max-width: var(--content-prose)">
			<dt class="font-semibold">Framework</dt>
			<dd>SvelteKit (Svelte 5)</dd>
			<dt class="font-semibold">Runtime</dt>
			<dd>Bun</dd>
			<dt class="font-semibold">Styling</dt>
			<dd>Token-driven CSS custom properties, cascade layers</dd>
		</dl>

		<!-- FAQ: details / summary -->
		<h3>FAQ: details / summary</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Disclosure widgets use <code>&lt;details&gt;</code> and
			<code>&lt;summary&gt;</code>. No JavaScript required.
		</p>
		<div class="stack" style="max-width: var(--content-prose)">
			<details>
				<summary>Why use semantic HTML?</summary>
				<p>
					Semantic elements convey meaning to browsers, search engines, and assistive
					technology. They reduce the need for ARIA roles and improve SEO by default.
				</p>
			</details>
			<details>
				<summary>When is a div acceptable?</summary>
				<p>
					A <code>&lt;div&gt;</code> is a layout-only wrapper with no semantic meaning.
					Use it for the inner <code>.container</code>, grid wrappers, and grouping
					when no semantic element fits.
				</p>
			</details>
		</div>

		<!-- Time element -->
		<h3>Date &amp; Time</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Dates and times use <code>&lt;time&gt;</code> with a machine-readable
			<code>datetime</code> attribute for parsers, search engines, and assistive technology.
		</p>
		<p>
			Published on <time datetime="2026-04-26">April 26, 2026</time>.
			Event starts at <time datetime="2026-04-26T09:00">9:00 AM</time>.
		</p>

		<!-- Aside / callout -->
		<h3>Aside / Callout</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Content that is tangentially related to the main flow uses
			<code>&lt;aside&gt;</code> — sidebars, callout boxes, related links.
		</p>
		<aside class="form-message" style="max-width: var(--content-prose)">
			<strong>Note:</strong> This callout is an <code>&lt;aside&gt;</code> element,
			not a <code>&lt;div&gt;</code>. It signals complementary content to assistive technology.
		</aside>

		<!-- Button vs link -->
		<h3>Button vs Link Semantics</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			Use <code>&lt;a href&gt;</code> when it navigates. Use
			<code>&lt;button&gt;</code> when it triggers an action.
			Never use a <code>&lt;div&gt;</code> for either.
		</p>
		<div class="cluster">
			<a
				href="#button-link-semantics"
				style="
					display: inline-flex;
					align-items: center;
					padding-block: var(--space-2);
					padding-inline: var(--space-5);
					background: var(--brand-accent);
					color: var(--brand-dark);
					border-radius: var(--radius-md);
					font-weight: var(--weight-semibold);
					text-decoration: none;
					min-height: 44px;
				"
			>
				Link — navigates →
			</a>
			<button
				type="button"
				style="
					display: inline-flex;
					align-items: center;
					padding-block: var(--space-2);
					padding-inline: var(--space-5);
					background: var(--surface-raised);
					color: var(--text-primary);
					border: 1px solid var(--border-structural);
					border-radius: var(--radius-md);
					font-weight: var(--weight-semibold);
					cursor: pointer;
					min-height: 44px;
				"
			>
				Button — triggers action
			</button>
		</div>
	</div>
</section>

<!-- ── Section / Container Pattern ───────────────────────────────────── -->
<section id="section-pattern">
	<div class="container">
		<h2>Section / Container Pattern</h2>
		<p style="max-width: var(--content-prose)">
			Every thematic block uses <code>&lt;section&gt;</code> for full-bleed background +
			vertical rhythm, and <code>.container</code> for centered max-width content.
			The <code>Section</code> Svelte component wraps this two-layer pattern.
		</p>
		<div class="cluster">
			<div class="card">Default container (72rem)</div>
			<div class="card" style="max-width: 16rem">Narrow (48rem)</div>
			<div class="card" style="max-width: 16rem">Wide (80rem)</div>
		</div>
	</div>
</section>

<!-- ── Cards ──────────────────────────────────────────────────────────── -->
<section id="cards" style="background: var(--surface-sunken)">
	<div class="container">
		<h2>Cards</h2>
		<div class="cluster">
			<div class="card" style="max-width: 18rem">
				<h3>Generic card (div)</h3>
				<p>Use <code>&lt;div&gt;</code> when the card is not self-contained content.</p>
			</div>
			<article class="card" style="max-width: 18rem">
				<h3>Content card (article)</h3>
				<p>Use <code>&lt;article&gt;</code> for blog posts, products, news items.</p>
			</article>
			<div class="card-flat" style="max-width: 18rem">
				<h3>Card flat</h3>
				<p>Same surface, no shadow. Use for dense, table-like layouts.</p>
			</div>
		</div>
	</div>
</section>

<!-- ── Interaction Utilities ─────────────────────────────────────────── -->
<section id="interaction">
	<div class="container">
		<h2>Interaction Utilities</h2>
		<div class="cluster">
			<button
				type="button"
				style="
					padding-block: var(--space-2);
					padding-inline: var(--space-4);
					background: var(--brand-accent);
					color: var(--brand-dark);
					border-radius: var(--radius-md);
					font-weight: var(--weight-semibold);
					cursor: pointer;
					min-height: 44px;
				"
			>
				Primary button
			</button>
			<article class="interactive-card card" style="max-width: 14rem; cursor: pointer">
				<h4>Interactive article card</h4>
				<p>Hover and click me.</p>
				<a href="#cards" class="card-link">
					<span class="sr-only">Go to cards section</span>
				</a>
			</article>
		</div>
	</div>
</section>

<!-- ── Animation Utilities ────────────────────────────────────────────── -->
<section id="animations" style="background: var(--surface-sunken)">
	<div class="container">
		<h2>Animation Utilities</h2>
		<div class="cluster">
			<div class="card" style="max-width: 10rem; text-align: center">
				<div
					class="animate-spin"
					style="
						width: 1.5rem; height: 1.5rem;
						border: 2px solid var(--border-structural);
						border-top-color: var(--brand-accent);
						border-radius: var(--radius-full);
						margin-inline: auto;
					"
				></div>
				<small>.animate-spin</small>
			</div>
			<div class="card animate-pulse" style="max-width: 10rem; text-align: center">
				<p>Loading…</p>
				<small>.animate-pulse</small>
			</div>
		</div>
	</div>
</section>

<!-- ── Forms ──────────────────────────────────────────────────────────── -->
<section id="forms">
	<div class="container container--narrow container-inline">
		<h2>Forms</h2>

		<form class="form">

			<!-- Form-level messages -->
			<div class="form-message" data-variant="success">
				Your message was sent successfully.
			</div>
			<div class="form-message" data-variant="warning">
				Some fields need attention before you continue.
			</div>
			<div class="form-message" data-variant="danger">
				There was a problem submitting the form. Please try again.
			</div>
			<div class="form-message">
				We found a matching account. You may want to sign in instead.
			</div>

			<div class="form-section">
				<h3>Contact information</h3>

				<div class="form-grid">
					<div class="field">
						<label class="field-label" for="sg-first-name">
							First name
							<span class="field-required" aria-hidden="true">*</span>
						</label>
						<input
							id="sg-first-name"
							class="input"
							type="text"
							placeholder="Jane"
							required
						/>
					</div>
					<div class="field">
						<label class="field-label" for="sg-last-name">Last name</label>
						<input
							id="sg-last-name"
							class="input"
							type="text"
							placeholder="Smith"
						/>
					</div>
				</div>

				<div class="field">
					<label class="field-label" for="sg-email">
						Email address
						<span class="field-required" aria-hidden="true">*</span>
					</label>
					<input
						id="sg-email"
						class="input"
						type="email"
						placeholder="jane@example.com"
						required
					/>
					<p class="field-help">We'll never share your email with anyone.</p>
				</div>

				<div class="field" data-invalid="true">
					<label class="field-label" for="sg-phone">Phone number</label>
					<input
						id="sg-phone"
						class="input"
						type="tel"
						placeholder="+1 (555) 000-0000"
						aria-invalid="true"
						aria-describedby="sg-phone-error"
					/>
					<p class="field-error" id="sg-phone-error">
						Please enter a valid phone number.
					</p>
				</div>

				<div class="field">
					<label class="field-label" for="sg-country">Country</label>
					<select id="sg-country" class="select">
						<option value="">Select a country…</option>
						<option value="us">United States</option>
						<option value="ca">Canada</option>
						<option value="gb">United Kingdom</option>
					</select>
				</div>

				<div class="field">
					<label class="field-label" for="sg-message">Message</label>
					<textarea
						id="sg-message"
						class="textarea"
						rows="4"
						placeholder="Tell us about your project…"
					></textarea>
					<p class="field-help">Max 500 characters.</p>
				</div>
			</div>

			<div class="form-section">
				<h3>Preferences</h3>

				<label class="checkbox-row">
					<input type="checkbox" />
					Subscribe to product updates
				</label>
				<label class="checkbox-row">
					<input type="checkbox" checked />
					Receive weekly digest emails
				</label>
				<label class="checkbox-row">
					<input type="checkbox" disabled />
					Disabled checkbox option
				</label>
				<label class="radio-row">
					<input type="radio" name="sg-plan" value="free" />
					Free plan
				</label>
				<label class="radio-row">
					<input type="radio" name="sg-plan" value="pro" checked />
					Pro plan
				</label>
				<label class="radio-row">
					<input type="radio" name="sg-plan" value="enterprise" disabled />
					Enterprise (contact sales)
				</label>
			</div>

			<div class="form-section">
				<h3>Disabled states</h3>
				<div class="field">
					<label class="field-label" for="sg-disabled-input">Disabled input</label>
					<input
						id="sg-disabled-input"
						class="input"
						type="text"
						value="Read-only value"
						disabled
					/>
				</div>
				<div class="field">
					<label class="field-label" for="sg-disabled-select">Disabled select</label>
					<select id="sg-disabled-select" class="select" disabled>
						<option>Unavailable</option>
					</select>
				</div>
			</div>

			<div class="form-actions">
				<button
					type="submit"
					style="
						padding-block: var(--space-2);
						padding-inline: var(--space-5);
						background: var(--brand-accent);
						color: var(--brand-dark);
						border-radius: var(--radius-md);
						font-weight: var(--weight-semibold);
						cursor: pointer;
						min-height: 44px;
					"
				>
					Submit
				</button>
				<button
					type="reset"
					style="
						padding-block: var(--space-2);
						padding-inline: var(--space-5);
						background: transparent;
						color: var(--text-secondary);
						border: 1px solid var(--border-structural);
						border-radius: var(--radius-md);
						cursor: pointer;
						min-height: 44px;
					"
				>
					Cancel
				</button>
			</div>

		</form>
	</div>
</section>

<!-- ── Images ──────────────────────────────────────────────────────────── -->
<section id="images">
	<div class="container">
		<h2>Images</h2>
		<p class="text-secondary" style="max-width: var(--content-prose)">
			Two image paths are standard. Use <code>&lt;enhanced:img&gt;</code> for developer-owned
			assets in <code>src/lib/assets/</code>. Use <code>&lt;CmsImage&gt;</code> for
			editor-uploaded images in <code>static/uploads/</code>.
			Full rules: <code>docs/design-system/images.md</code>.
		</p>

		<!-- Brand image (enhanced:img) — code pattern only (no real asset in template) -->
		<h3>Tier 1 — Brand images (<code>enhanced:img</code>)</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			For images committed to <code>src/lib/assets/</code>. SvelteKit processes them at
			build time and generates optimised variants automatically.
		</p>
		<pre><code><!-- LCP hero — never lazy-load the primary viewport image -->
&lt;enhanced:img
  src="{'{'}heroImage{'}'}"
  alt="Hero description"
  loading="eager"
  fetchpriority="high"
  width={"{"}{1200}{"}"} height={"{"}{600}{"}"}
/&gt;

&lt;!-- Below the fold --&gt;
&lt;figure&gt;
  &lt;enhanced:img
    src="{'{'}teamPhoto{'}'}"
    alt="Team description"
    loading="lazy"
    width={"{"}{800}{"}"} height={"{"}{500}{"}"}
  /&gt;
  &lt;figcaption&gt;Caption text&lt;/figcaption&gt;
&lt;/figure&gt;</code></pre>

		<!-- CmsImage — renders a live example with an inline SVG placeholder -->
		<h3>Tier 2 — CMS uploads (<code>CmsImage</code>)</h3>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			For images in <code>static/uploads/</code>. The prebuild script generates a sibling
			<code>.webp</code>; the component serves it as a <code>&lt;picture&gt;</code> with
			the original as fallback. <code>loading="lazy"</code> is the default.
		</p>

		<!-- Below-the-fold CmsImage -->
		<h4>Below-the-fold (lazy, default)</h4>
		<figure style="max-width: 32rem">
			<CmsImage
				src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui' font-size='16' fill='%2364748b'%3ECmsImage — 640%C3%97360 — lazy%3C/text%3E%3C/svg%3E"
				alt="Example CMS image — blog post featured image"
				width={640}
				height={360}
			/>
			<figcaption>CmsImage with default <code>loading="lazy"</code></figcaption>
		</figure>

		<!-- LCP CmsImage -->
		<h4 style="margin-block-start: var(--space-8)">Above-the-fold LCP image (eager)</h4>
		<p class="text-secondary text-sm" style="max-width: var(--content-prose)">
			The page's primary hero image must never use <code>loading="lazy"</code>.
			Add <code>loading="eager"</code> and <code>fetchpriority="high"</code>.
		</p>
		<figure style="max-width: 32rem">
			<CmsImage
				src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='320' viewBox='0 0 640 320'%3E%3Crect width='640' height='320' fill='%230B1120'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui' font-size='16' fill='%23a0e4cb'%3ELCP Hero — 640%C3%97320 — eager%3C/text%3E%3C/svg%3E"
				alt="Hero image — primary above-the-fold image"
				loading="eager"
				fetchpriority="high"
				width={640}
				height={320}
			/>
			<figcaption>LCP image with <code>loading="eager" fetchpriority="high"</code></figcaption>
		</figure>
	</div>
</section>

<!-- ── Typography — fonts ─────────────────────────────────────────────── -->
<section id="fonts" style="background: var(--surface-sunken)">
	<div class="container">
		<h2>Typography — Font Pair</h2>
		<p class="text-secondary" style="max-width: var(--content-prose)">
			Default pair: <strong>Plus Jakarta Sans Variable</strong> (UI/body) and
			<strong>JetBrains Mono Variable</strong> (code). Both loaded via Fontsource.
			Change the pair by updating <code>tokens.css</code> and the
			<code>@import</code> lines in <code>app.css</code>. See
			<code>docs/design-system/typography.md</code> for the full switching checklist.
		</p>
		<div class="flow" style="max-width: var(--content-prose)">
			<p style="font-family: var(--font-sans); font-size: var(--text-xl)">
				Plus Jakarta Sans Variable — body / UI font
			</p>
			<p style="font-family: var(--font-sans); font-weight: var(--weight-bold)">
				Bold weight (700) — headings, labels
			</p>
			<p style="font-family: var(--font-sans); font-weight: var(--weight-medium)">
				Medium weight (500) — emphasis, UI controls
			</p>
			<p style="font-family: var(--font-sans); font-weight: var(--weight-normal)">
				Regular weight (400) — body text, descriptions
			</p>
			<pre><code>// Mono font — code blocks, inline code, kbd shortcuts
const fontMono = 'JetBrains Mono Variable';</code></pre>
			<p class="text-muted text-sm">
				CSS tokens: <code>var(--font-sans)</code> · <code>var(--font-mono)</code>
				— never hardcode font names in component CSS.
			</p>
		</div>
	</div>
</section>

<!-- ── Token Swatches ─────────────────────────────────────────────────── -->
<section id="tokens" style="background: var(--surface-sunken)">
	<div class="container">
		<h2>Surface tokens</h2>
		<div class="cluster">
			{#each [
				['--surface-ground', 'Ground'],
				['--surface-raised', 'Raised'],
				['--surface-sunken', 'Sunken'],
			] as [token, label]}
				<div
					class="card"
					style="background: var({token}); min-width: 8rem; text-align: center"
				>
					<small class="text-muted">{token}</small>
					<p class="font-medium">{label}</p>
				</div>
			{/each}
		</div>

		<h3 style="margin-block-start: var(--space-8)">Status colors</h3>
		<div class="cluster">
			{#each [
				['var(--color-success)', 'var(--color-success-subtle)', 'Success'],
				['var(--color-warning)', 'var(--color-warning-subtle)', 'Warning'],
				['var(--color-danger)',  'var(--color-danger-subtle)',  'Danger'],
				['var(--color-info)',    'var(--color-info-subtle)',    'Info'],
			] as [fg, bg, label]}
				<div
					style="
						background: {bg};
						border-inline-start: 3px solid {fg};
						padding-block: var(--space-3);
						padding-inline: var(--space-4);
						border-radius: var(--radius-md);
						min-width: 7rem;
						color: var(--text-primary);
						font-size: var(--text-sm);
					"
				>
					{label}
				</div>
			{/each}
		</div>
	</div>
</section>
