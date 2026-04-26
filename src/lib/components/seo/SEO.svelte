<script lang="ts">
	import { site } from '$lib/config/site';
	import { resolvePageSeo } from '$lib/seo/metadata';
	import type { PageSeoInput } from '$lib/seo/types';

	let { seo }: { seo: PageSeoInput } = $props();

	const resolved = $derived(resolvePageSeo(seo));

	const schemaJson = $derived(
		resolved.schema
			? JSON.stringify(
					Array.isArray(resolved.schema) ? resolved.schema : [resolved.schema],
					null,
					2
				)
			: null
	);

	const isArticle = $derived(resolved.type === 'article');
</script>

<svelte:head>
	<title>{resolved.title}</title>
	<meta name="description" content={resolved.description} />
	<link rel="canonical" href={resolved.canonicalUrl} />
	<meta name="robots" content={resolved.robots} />

	<!-- Open Graph -->
	<meta property="og:type" content={resolved.type} />
	<meta property="og:title" content={resolved.title} />
	<meta property="og:description" content={resolved.description} />
	<meta property="og:url" content={resolved.canonicalUrl} />
	<meta property="og:image" content={resolved.imageUrl} />
	<meta property="og:image:alt" content={resolved.imageAlt} />
	<meta property="og:site_name" content={site.name} />
	<meta property="og:locale" content={site.locale} />

	<!-- Twitter / X Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={resolved.title} />
	<meta name="twitter:description" content={resolved.description} />
	<meta name="twitter:image" content={resolved.imageUrl} />
	<meta name="twitter:image:alt" content={resolved.imageAlt} />

	<!-- Article-specific meta -->
	{#if isArticle && resolved.publishedDate}
		<meta property="article:published_time" content={resolved.publishedDate} />
	{/if}
	{#if isArticle && resolved.modifiedDate}
		<meta property="article:modified_time" content={resolved.modifiedDate} />
	{/if}

	<!-- Search Console verification (only if configured) -->
	{#if site.searchConsoleVerification}
		<meta
			name="google-site-verification"
			content={site.searchConsoleVerification}
		/>
	{/if}

	<!-- JSON-LD -->
	{#if schemaJson}
		{@html `<script type="application/ld+json">${schemaJson}<\/script>`}
	{/if}
</svelte:head>
