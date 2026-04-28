<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';
</script>

<SEO
	seo={{
		title: 'Call-to-action section example',
		description: 'A copyable call-to-action section archetype.',
		canonicalPath: '/examples/cta',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Call to action</p>
		<h1>The "next thing they should do" band</h1>
		<p class="lede">
			Three flavours below. Drop one at the bottom of any page where you want a single, obvious next
			step. Pick the variant that matches the page's tone — bold for marketing, quiet for editorial.
		</p>
	</header>
</Section>

<Section width="narrow">
	<h2 class="variant-label">Variant 1 — bold</h2>
	<aside class="cta cta--bold">
		<div class="cta-copy">
			<h3>Ready to start?</h3>
			<p>Tell us about your project and we'll come back within a business day.</p>
		</div>
		<div class="cta-actions">
			<a href="/contact" class="btn btn-primary btn-lg">Start a project</a>
		</div>
	</aside>
</Section>

<Section width="narrow">
	<h2 class="variant-label">Variant 2 — split, with secondary action</h2>
	<aside class="cta cta--split">
		<div class="cta-copy">
			<h3>Have something to share?</h3>
			<p>Send a link, a wireframe, or a vague idea. We respond to all three.</p>
		</div>
		<div class="cta-actions">
			<a href="/contact" class="btn btn-primary">Send a brief</a>
			<a href="/articles" class="btn btn-ghost">Read first</a>
		</div>
	</aside>
</Section>

<Section width="narrow">
	<h2 class="variant-label">Variant 3 — quiet inline</h2>
	<aside class="cta cta--quiet">
		<p>
			Want this kind of section on your own site?
			<a href="/contact">Get in touch</a>.
		</p>
	</aside>
</Section>

<style>
	.page-header {
		padding-block-start: var(--space-4);
	}

	.eyebrow {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		margin-block-end: var(--space-2);
	}

	h1 {
		font-size: var(--text-fluid-4xl);
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.variant-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--text-secondary);
		margin-block-end: var(--space-3);
	}

	.cta {
		border-radius: var(--radius-lg);
		padding: var(--space-8);
		display: flex;
		gap: var(--space-6);
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
	}

	.cta-copy h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-2xl);
	}

	.cta-copy p {
		margin: 0;
		color: var(--text-secondary);
		max-inline-size: 45ch;
	}

	.cta-actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.cta--bold {
		background: var(--brand-accent);
	}

	.cta--bold h3,
	.cta--bold .cta-copy p {
		color: var(--brand-dark);
	}

	.cta--bold .cta-copy p {
		opacity: 0.85;
	}

	.cta--split {
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
	}

	.cta--quiet {
		background: transparent;
		border-block: 1px solid var(--border-subtle);
		border-radius: 0;
		padding: var(--space-6) 0;
		justify-content: center;
		text-align: center;
	}

	.cta--quiet p {
		margin: 0;
		color: var(--text-secondary);
	}
</style>
