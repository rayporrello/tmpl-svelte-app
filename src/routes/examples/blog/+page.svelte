<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const featured = {
		slug: 'why-we-stopped-using-tailwind',
		title: 'Why we stopped using Tailwind',
		description:
			'A short retrospective on switching back to native CSS for marketing sites — what we kept, what we let go, and what surprised us.',
		date: '2026-04-15',
		readingTime: '6 min read',
	};

	const recent = [
		{
			slug: 'opinionated-defaults',
			title: 'Opinionated defaults are a feature',
			description: 'When a starter kit picks for you, building the next thing gets faster.',
			date: '2026-04-08',
			readingTime: '4 min read',
		},
		{
			slug: 'shipping-the-boring-bits',
			title: 'Shipping the boring bits first',
			description: 'A case for finishing SEO, forms, and analytics before the design lands.',
			date: '2026-03-29',
			readingTime: '7 min read',
		},
		{
			slug: 'sveltekit-and-the-content-layer',
			title: 'SvelteKit and the Git-backed content layer',
			description: 'Why we moved client content out of the database and into Markdown files.',
			date: '2026-03-12',
			readingTime: '9 min read',
		},
	];

	function formatDate(d: string) {
		return new Date(d).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	}
</script>

<SEO
	seo={{
		title: 'Blog example',
		description: 'A copyable blog landing page archetype with featured post and list.',
		canonicalPath: '/examples/blog',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Field notes</p>
		<h1>Writing</h1>
		<p class="lede">Short pieces on how we work and what we've learned shipping marketing sites.</p>
	</header>
</Section>

<Section>
	<article class="featured card interactive-card">
		<p class="featured-label">Featured</p>
		<h2><a href="/examples/blog#{featured.slug}" class="card-link">{featured.title}</a></h2>
		<p class="featured-desc">{featured.description}</p>
		<p class="meta">
			<time datetime={featured.date}>{formatDate(featured.date)}</time>
			<span aria-hidden="true">·</span>
			<span>{featured.readingTime}</span>
		</p>
	</article>
</Section>

<Section>
	<header class="section-header">
		<h2>More writing</h2>
	</header>
	<ul class="article-list" role="list">
		{#each recent as post (post.slug)}
			<li>
				<article class="card interactive-card">
					<h3><a href="/examples/blog#{post.slug}" class="card-link">{post.title}</a></h3>
					<p>{post.description}</p>
					<p class="meta">
						<time datetime={post.date}>{formatDate(post.date)}</time>
						<span aria-hidden="true">·</span>
						<span>{post.readingTime}</span>
					</p>
				</article>
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
		line-height: var(--leading-tight);
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.featured {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-8);
	}

	.featured-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--brand-accent);
		margin: 0;
	}

	.featured h2 {
		font-size: var(--text-2xl);
		margin: 0;
	}

	.featured-desc {
		color: var(--text-secondary);
		font-size: var(--text-lg);
		max-inline-size: 55ch;
	}

	.section-header {
		margin-block-end: var(--space-6);
	}

	.article-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	}

	.article-list h3 {
		font-size: var(--text-lg);
		margin-block-end: var(--space-2);
	}

	.article-list p {
		color: var(--text-secondary);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-block-start: var(--space-3);
	}
</style>
