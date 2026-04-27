<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const articles = $derived(data.articles);

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	}
</script>

<SEO
	seo={{
		title: 'Articles',
		description: 'All published articles',
		canonicalPath: '/articles',
	}}
/>

<section>
	<div class="container">
		<h1>Articles</h1>
		{#if articles.length === 0}
			<p class="text-secondary">No articles yet.</p>
		{:else}
			<div class="stack">
				{#each articles as article (article.slug)}
					<article class="card">
						<h2><a href="/articles/{article.slug}">{article.title}</a></h2>
						<p>{article.description}</p>
						<time datetime={article.date}>{formatDate(article.date)}</time>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</section>
