<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';
</script>

<SEO
	seo={{
		title: 'Service detail example',
		description: 'A copyable service detail page archetype.',
		canonicalPath: '/examples/services/example-service',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<nav aria-label="Breadcrumb" class="crumbs">
		<ol>
			<li><a href="/examples/services">Services</a></li>
			<li aria-current="page">Marketing site builds</li>
		</ol>
	</nav>
	<header class="page-header">
		<h1>Marketing site builds</h1>
		<p class="lede">
			Full marketing site from blank page to launch in 4–6 weeks. Includes content layer, analytics,
			SEO baseline, and a written handoff.
		</p>
	</header>
</Section>

<Section>
	<div class="two-col">
		<article class="prose">
			<h2>What you get</h2>
			<ul>
				<li>Up to 8 page templates with live content</li>
				<li>Sveltia CMS configured for your team</li>
				<li>Analytics and consent layer wired in</li>
				<li>SEO baseline: sitemap, robots, OG image, JSON-LD</li>
				<li>One round of post-launch fixes within 30 days</li>
			</ul>

			<h2>How it works</h2>
			<ol>
				<li><strong>Week 1.</strong> Discovery, content audit, design tokens.</li>
				<li><strong>Weeks 2–3.</strong> Build and content load.</li>
				<li><strong>Week 4.</strong> Review, polish, accessibility pass.</li>
				<li><strong>Week 5.</strong> Launch and monitor.</li>
			</ol>

			<h2>Who it's for</h2>
			<p>
				Founders or small teams who need a real site live in a month, not a quarter. If you have
				more than 30 pages or need a complex back-office, talk to us first.
			</p>
		</article>

		<aside class="rail">
			<div class="card">
				<h2 class="rail-heading">From</h2>
				<p class="price">$18k</p>
				<p class="text-secondary">Fixed scope, fixed price. 50% to start.</p>
				<a href="/contact" class="btn btn-primary">Start a project</a>
			</div>
			<div class="card">
				<h2 class="rail-heading">Timeline</h2>
				<p class="text-secondary">4–6 weeks from kickoff to launch.</p>
			</div>
		</aside>
	</div>
</Section>

<Section width="narrow">
	<aside class="cta-band">
		<h2>Ready when you are</h2>
		<p>Send a brief about the site you want and we'll come back with questions.</p>
		<a href="/contact" class="btn btn-primary btn-lg">Get a proposal</a>
	</aside>
</Section>

<style>
	.crumbs {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-block-end: var(--space-4);
	}

	.crumbs ol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.crumbs li + li::before {
		content: '/';
		margin-inline-end: var(--space-2);
		color: var(--text-muted);
	}

	.crumbs [aria-current='page'] {
		color: var(--text-primary);
	}

	.page-header {
		padding-block-start: var(--space-2);
	}

	h1 {
		font-size: var(--text-fluid-4xl);
		line-height: var(--leading-tight);
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.two-col {
		display: grid;
		gap: var(--space-8);
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
	}

	@media (width < 48rem) {
		.two-col {
			grid-template-columns: 1fr;
		}
	}

	.prose h2 {
		margin-block-start: var(--space-8);
		margin-block-end: var(--space-3);
	}

	.prose h2:first-child {
		margin-block-start: 0;
	}

	.prose ul,
	.prose ol {
		padding-inline-start: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--text-secondary);
	}

	.prose p {
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
	}

	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.rail .card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.rail-heading {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--text-secondary);
		margin: 0;
	}

	.price {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		color: var(--text-primary);
		margin: 0;
	}

	.cta-band {
		text-align: center;
		padding: var(--space-8);
		background: var(--surface-sunken);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: center;
	}
</style>
