<script lang="ts">
	import type { PageSeoInput } from '$lib/seo/types';

	let { schema }: { schema: PageSeoInput['schema'] | null | undefined } = $props();

	const schemaJson = $derived(
		schema
			? JSON.stringify(Array.isArray(schema) ? schema : [schema], null, 2).replace(
					/<\/script/gi,
					'<\\/script'
				)
			: null
	);
</script>

<svelte:head>
	{#if schemaJson}
		<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- JSON-LD uses internal schema data; <\/script> escape prevents premature script closing -->
		{@html `<script type="application/ld+json">${schemaJson}<\/script>`}
	{/if}
</svelte:head>
