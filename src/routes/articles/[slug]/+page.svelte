<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { site } from '$lib/config/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const seo = $derived({
		title: data.article.title,
		description: data.article.description,
		canonicalPath: `/articles/${data.slug}`,
		image: data.article.image || undefined,
		imageAlt: data.article.image_alt || undefined,
		type: 'article' as const,
		publishedDate: data.article.date,
		schema: {
			'@context': 'https://schema.org',
			'@type': 'Article',
			headline: data.article.title,
			description: data.article.description,
			datePublished: data.article.date,
			...(data.article.image ? { image: data.article.image } : {}),
			author: {
				'@type': 'Organization',
				name: site.organization.name
			},
			publisher: {
				'@type': 'Organization',
				name: site.organization.name,
				logo: {
					'@type': 'ImageObject',
					url: site.organization.logo
				}
			}
		}
	});
</script>

<SEO seo={seo} />

<div class="article-page">
	<article>
		<header class="article-header">
			<h1>{data.article.title}</h1>
			<p class="article-description text-secondary">{data.article.description}</p>
			<time class="article-date" datetime={data.article.date}>
				{new Date(data.article.date).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})}
			</time>
		</header>
		<div class="article-body prose">
			{@html data.html}
		</div>
	</article>
</div>

<style>
	.article-page {
		padding-block: var(--space-12);
	}

	article {
		max-width: var(--content-prose);
		margin-inline: auto;
		padding-inline: var(--space-4);
	}

	.article-header {
		margin-block-end: var(--space-8);
		padding-block-end: var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	.article-header h1 {
		margin-block-end: var(--space-3);
	}

	.article-description {
		font-size: var(--text-lg);
		margin-block-end: var(--space-3);
	}

	.article-date {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.article-body :global(h2),
	.article-body :global(h3),
	.article-body :global(h4) {
		margin-block-start: var(--space-8);
		margin-block-end: var(--space-3);
	}

	.article-body :global(p) {
		margin-block-end: var(--space-4);
		line-height: var(--leading-relaxed);
	}

	.article-body :global(ul),
	.article-body :global(ol) {
		padding-inline-start: var(--space-6);
		margin-block-end: var(--space-4);
	}

	.article-body :global(li) {
		margin-block-end: var(--space-2);
	}

	.article-body :global(pre) {
		padding: var(--space-4);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
		overflow-x: auto;
		margin-block-end: var(--space-4);
	}

	.article-body :global(code) {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.article-body :global(blockquote) {
		border-inline-start: 3px solid var(--color-border);
		padding-inline-start: var(--space-4);
		margin-inline-start: 0;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.article-body :global(a) {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.article-body :global(a:hover) {
		text-decoration: none;
	}
</style>
