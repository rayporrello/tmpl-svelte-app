<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const examples = [
		{
			href: '/examples/homepage',
			title: 'Homepage',
			description:
				'Hero, value props, social proof strip, primary CTA. A second flavor of the home page.',
		},
		{
			href: '/examples/about',
			title: 'About',
			description: 'Story, mission, values, and team. Establishes credibility and tone.',
		},
		{
			href: '/examples/services',
			title: 'Services landing',
			description: 'A directory of what you offer, each linking to a service detail page.',
		},
		{
			href: '/examples/services/example-service',
			title: 'Service detail',
			description: 'Deep page for a single service: outcomes, process, pricing, CTA.',
		},
		{
			href: '/examples/pricing',
			title: 'Pricing',
			description: 'Three-tier price table with feature comparison and a quiet enterprise tier.',
		},
		{
			href: '/examples/blog',
			title: 'Blog landing',
			description: 'Article index with featured post and reverse-chronological list.',
		},
		{
			href: '/examples/contact',
			title: 'Contact (pattern)',
			description: 'Layout that mirrors the real /contact route, minus the live form behavior.',
		},
		{
			href: '/examples/faq',
			title: 'FAQ',
			description: 'Accessible disclosure pattern using <details>/<summary>. No JS required.',
		},
		{
			href: '/examples/testimonials',
			title: 'Testimonials section',
			description: 'Quote cards in a responsive grid. Drop into any page.',
		},
		{
			href: '/examples/cta',
			title: 'Call-to-action section',
			description: 'A focused band designed to be the last thing a reader sees before clicking.',
		},
		{
			href: '/examples/legal',
			title: 'Legal / privacy skeleton',
			description: 'Long-form prose page with TOC anchors and "Last updated" line.',
		},
	];
</script>

<SEO
	seo={{
		title: 'Examples',
		description: 'Copyable page archetypes for real website builds.',
		canonicalPath: '/examples',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Template patterns</p>
		<h1>Examples</h1>
		<p class="lede">
			Each page below is a self-contained, copyable starting point. They use the same tokens,
			components, and semantic HTML conventions as the rest of the template — so copying one into a
			real route should feel like editing existing code, not bolting on a new system.
		</p>
	</header>
</Section>

<Section>
	<h2 class="visually-hidden">Available examples</h2>
	<ul class="example-grid" role="list">
		{#each examples as ex (ex.href)}
			<li>
				<article class="card example-card interactive-card">
					<h3><a href={ex.href} class="card-link">{ex.title}</a></h3>
					<p>{ex.description}</p>
					<p class="card-meta"><code>{ex.href}</code></p>
				</article>
			</li>
		{/each}
	</ul>
</Section>

<Section width="narrow">
	<aside class="how-to" aria-labelledby="how-to-heading">
		<h2 id="how-to-heading">How to use these</h2>
		<ol>
			<li>Open the example you want and read the full <code>+page.svelte</code> source.</li>
			<li>
				Copy the file into a real route — for example, <code>src/routes/about/+page.svelte</code>.
			</li>
			<li>
				Add the new route to <code>src/lib/seo/routes.ts</code> and remove the
				<code>robots: 'noindex, nofollow'</code> override.
			</li>
			<li>Replace placeholder copy and links with real content.</li>
			<li>
				Delete the example from <code>src/routes/examples/</code> if you no longer need the reference.
			</li>
		</ol>
		<p class="text-secondary">
			Full guide: <a href="https://github.com/" rel="noopener">docs/examples/README.md</a>
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

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
		margin-block-start: var(--space-3);
		max-inline-size: 60ch;
	}

	.example-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
	}

	.example-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: 100%;
	}

	.example-card h3 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.example-card p {
		color: var(--text-secondary);
	}

	.card-meta {
		margin-block-start: auto;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.card-meta code {
		font-family: var(--font-mono);
	}

	.how-to {
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-6);
	}

	.how-to h2 {
		margin-block-end: var(--space-3);
	}

	.how-to ol {
		padding-inline-start: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
