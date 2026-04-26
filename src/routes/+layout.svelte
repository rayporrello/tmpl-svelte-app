<script lang="ts">
	import '../app.css';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { organizationSchema, websiteSchema } from '$lib/seo/schemas';
	import { site } from '$lib/config/site';

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
		schema: rootSchema
	}}
/>

<!-- Skip link — first element, visible on focus -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<header class="site-header">
	<div class="container">
		<a href="/" class="site-logo">[Site Name]</a>
		<nav aria-label="Primary">
			<!-- Navigation placeholder — add links per project -->
		</nav>
	</div>
</header>

<main id="main-content">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="container">
		<nav aria-label="Footer">
			<!-- Footer nav placeholder -->
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
