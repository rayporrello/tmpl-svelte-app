<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const services = [
		{
			slug: 'example-service',
			name: 'Marketing site builds',
			summary: 'Full marketing site from blank page to launch in 4–6 weeks.',
			outcomes: 'Live site, content layer, analytics, SEO baseline.',
		},
		{
			slug: 'example-service',
			name: 'Content layer + CMS',
			summary: 'Stand up a Git-backed CMS on an existing codebase.',
			outcomes: 'Editor UI, validation, deploy on commit.',
		},
		{
			slug: 'example-service',
			name: 'Performance + SEO audits',
			summary: 'Two-week deep dive on a live site with a written report.',
			outcomes: 'Prioritised fix list, lighthouse baseline, follow-up plan.',
		},
	];
</script>

<SEO
	seo={{
		title: 'Services example',
		description: 'A copyable services landing page archetype.',
		canonicalPath: '/examples/services',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Services</p>
		<h1>What we do</h1>
		<p class="lede">
			Three things we do well. Each links to a detail page with timelines, what's included, and how
			to start.
		</p>
	</header>
</Section>

<Section>
	<ul class="service-grid" role="list">
		{#each services as service (service.name)}
			<li>
				<article class="card service-card interactive-card">
					<h2><a href="/examples/services/{service.slug}" class="card-link">{service.name}</a></h2>
					<p class="summary">{service.summary}</p>
					<dl class="meta">
						<dt>Outcomes</dt>
						<dd>{service.outcomes}</dd>
					</dl>
				</article>
			</li>
		{/each}
	</ul>
</Section>

<Section width="narrow">
	<aside class="cta-band">
		<h2>Not sure which fits?</h2>
		<p>Send a few sentences about your project and we'll point you at the right one.</p>
		<a href="/contact" class="btn btn-primary">Get in touch</a>
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
		line-height: var(--leading-tight);
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.service-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	}

	.service-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		height: 100%;
	}

	.service-card h2 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.summary {
		color: var(--text-secondary);
	}

	.meta {
		margin: 0;
		padding-block-start: var(--space-2);
		border-block-start: 1px solid var(--border-subtle);
		font-size: var(--text-sm);
	}

	.meta dt {
		font-weight: var(--weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		font-size: var(--text-xs);
		margin-block-end: var(--space-1);
	}

	.meta dd {
		margin: 0;
		color: var(--text-primary);
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
