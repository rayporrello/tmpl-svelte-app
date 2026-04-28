<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const quotes = [
		{
			quote:
				'Shipping with this team felt like a default-on superpower. We had analytics, SEO, and forms working before we agreed on the brand colours.',
			author: 'Priya Desai',
			role: 'Head of Marketing, Northwind',
		},
		{
			quote:
				'They turn the boring infrastructure into a checklist instead of a project. We went from kickoff to live in five weeks.',
			author: 'Daniel Cho',
			role: 'Founder, Stagecraft',
		},
		{
			quote:
				'The handover docs alone are worth it. Six months later we are still adding pages without breaking anything.',
			author: 'Mariana Costa',
			role: 'Product Lead, Loop & Co',
		},
	];
</script>

<SEO
	seo={{
		title: 'Testimonials section example',
		description: 'A copyable testimonials section archetype.',
		canonicalPath: '/examples/testimonials',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Testimonials</p>
		<h1>What clients say</h1>
		<p class="lede">
			Drop this section into a homepage or service page. Quotes use semantic
			<code>&lt;blockquote&gt;</code> + <code>&lt;cite&gt;</code> markup.
		</p>
	</header>
</Section>

<Section>
	<ul class="quote-grid" role="list">
		{#each quotes as q (q.author)}
			<li>
				<figure class="quote-card card">
					<blockquote>
						<p>{q.quote}</p>
					</blockquote>
					<figcaption>
						<strong>{q.author}</strong>
						<span>{q.role}</span>
					</figcaption>
				</figure>
			</li>
		{/each}
	</ul>
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

	.lede code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.quote-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	}

	.quote-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		height: 100%;
	}

	.quote-card blockquote {
		border: none;
		padding: 0;
		font-style: normal;
		color: var(--text-primary);
	}

	.quote-card blockquote p {
		font-size: var(--text-lg);
		line-height: var(--leading-relaxed);
		margin: 0;
	}

	.quote-card blockquote p::before {
		content: '“';
		color: var(--brand-accent);
		margin-inline-end: 0.1em;
	}

	.quote-card blockquote p::after {
		content: '”';
		color: var(--brand-accent);
		margin-inline-start: 0.1em;
	}

	.quote-card figcaption {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		margin-block-start: auto;
	}

	.quote-card figcaption strong {
		color: var(--text-primary);
		font-size: var(--text-base);
	}
</style>
