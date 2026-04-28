<script lang="ts">
	import '../app.css';
	import SEO from '$lib/components/seo/SEO.svelte';
	import AnalyticsHead from '$lib/components/analytics/AnalyticsHead.svelte';
	import AnalyticsBody from '$lib/components/analytics/AnalyticsBody.svelte';
	import { organizationSchema, websiteSchema } from '$lib/seo/schemas';
	import { site } from '$lib/config/site';
	import { page } from '$app/state';

	let { children } = $props();

	// Root-level schema injected on every page. Page-specific schema is added
	// via the SEO component on individual routes — do not duplicate it here.
	const rootSchema = [organizationSchema(), websiteSchema()];
</script>

<SEO
	seo={{
		title: site.defaultTitle,
		description: site.defaultDescription,
		canonicalPath: '/',
		schema: rootSchema,
	}}
/>

<!--
  Analytics: GTM head snippet + Cloudflare Web Analytics (when enabled via env vars).
  Disabled by default — set PUBLIC_ANALYTICS_ENABLED=true in production env only.
  See docs/analytics/README.md.
-->
<AnalyticsHead />

<!-- GTM noscript fallback — as close to <body> as SvelteKit layout allows -->
<AnalyticsBody />

<!-- Skip link — first element, visible on focus -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<header class="site-header">
	<div class="container">
		<a href="/" class="site-logo">[Site Name]</a>
		<nav aria-label="Primary">
			<ul role="list" class="nav-list">
				<li>
					<a href="/" class="nav-link" aria-current={page.url.pathname === '/' ? 'page' : undefined}
						>Home</a
					>
				</li>
				<li>
					<a
						href="/articles"
						class="nav-link"
						aria-current={page.url.pathname.startsWith('/articles') ? 'page' : undefined}
						>Articles</a
					>
				</li>
			</ul>
		</nav>
	</div>
</header>

<main id="main-content">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="container">
		<nav aria-label="Footer">
			<ul role="list" class="nav-list">
				<li>
					<a href="/" class="nav-link" aria-current={page.url.pathname === '/' ? 'page' : undefined}
						>Home</a
					>
				</li>
				<li>
					<a
						href="/articles"
						class="nav-link"
						aria-current={page.url.pathname.startsWith('/articles') ? 'page' : undefined}
						>Articles</a
					>
				</li>
				{#if import.meta.env.DEV}
					<li>
						<a href="/styleguide" class="nav-link">Styleguide</a>
					</li>
					<li>
						<a href="/examples" class="nav-link">Examples</a>
					</li>
				{/if}
			</ul>
		</nav>
		<p><small>&copy; [Year] [Site Name]. All rights reserved.</small></p>
	</div>
</footer>

<style>
	/* Skip link — hidden off-screen, slides into view on focus */
	.skip-link {
		position: absolute;
		top: calc(-1 * var(--space-20));
		inset-inline-start: var(--space-4);
		padding-block: var(--space-2);
		padding-inline: var(--space-4);
		background: var(--surface-raised);
		color: var(--text-primary);
		border: 2px solid var(--border-focus);
		border-radius: var(--radius-md);
		z-index: var(--z-toast);
		text-decoration: none;
		font-weight: var(--weight-medium);
		transition: top var(--duration-fast) var(--ease-decel);
	}

	.skip-link:focus-visible {
		top: var(--space-4);
	}

	/* Site header */
	.site-header {
		padding-block: var(--space-4);
		padding-inline: var(--gutter);
		background: var(--surface-ground);
		border-block-end: 1px solid var(--border-subtle);
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
	}

	.site-header .container {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}

	.site-logo {
		font-weight: var(--weight-semibold);
		font-size: var(--text-lg);
		color: var(--text-primary);
		text-decoration: none;
	}

	.nav-list {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.nav-link {
		color: var(--text-secondary);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		padding-block: var(--space-1);
		transition: color var(--duration-fast);
	}

	.nav-link:hover {
		color: var(--text-primary);
	}

	.nav-link[aria-current='page'] {
		color: var(--text-primary);
		font-weight: var(--weight-semibold);
		text-decoration: underline;
		text-decoration-color: var(--brand-accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
	}

	/* Site footer */
	.site-footer {
		padding-block: var(--space-8);
		padding-inline: var(--gutter);
		background: var(--surface-ground);
		border-block-start: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.site-footer .container {
		gap: var(--space-6);
	}
</style>
