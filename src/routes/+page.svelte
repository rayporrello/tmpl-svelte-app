<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const home = $derived(data.home);
</script>

<SEO
	seo={{
		title: home.title,
		description: home.description,
		canonicalPath: '/',
	}}
/>

<Section>
	<div class="hero">
		{#if home.hero.eyebrow}
			<p class="eyebrow">{home.hero.eyebrow}</p>
		{/if}
		<h1>{home.hero.headline}</h1>
		{#if home.hero.subheadline}
			<p class="subheadline">{home.hero.subheadline}</p>
		{/if}
		{#if home.hero.primary_cta || home.hero.secondary_cta}
			<div class="cta-group">
				{#if home.hero.primary_cta}
					<a href={home.hero.primary_cta.href} class="btn btn-primary">
						{home.hero.primary_cta.label}
					</a>
				{/if}
				{#if home.hero.secondary_cta}
					<a href={home.hero.secondary_cta.href} class="btn btn-secondary">
						{home.hero.secondary_cta.label}
					</a>
				{/if}
			</div>
		{/if}
	</div>
</Section>

{#if home.sections}
	{#each home.sections as section, i (i)}
		<Section>
			<h2>{section.title}</h2>
			<p>{section.body}</p>
			{#if section.items}
				<ul class="feature-list">
					{#each section.items as item, j (j)}
						<li>{item.text}</li>
					{/each}
				</ul>
			{/if}
		</Section>
	{/each}
{/if}

<style>
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-block: var(--space-16);
	}

	.eyebrow {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	h1 {
		font-size: var(--text-fluid-5xl);
		font-weight: var(--weight-bold);
		color: var(--text-primary);
		line-height: var(--leading-tight);
		max-inline-size: 18ch;
	}

	.subheadline {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
		max-inline-size: 55ch;
	}

	.cta-group {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		padding-block-start: var(--space-4);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		padding-block: var(--space-3);
		padding-inline: var(--space-6);
		border-radius: var(--radius-md);
		font-weight: var(--weight-medium);
		font-size: var(--text-base);
		text-decoration: none;
		transition: opacity var(--duration-fast);
		min-height: 44px;
	}

	.btn-primary {
		background: var(--brand-accent);
		color: var(--brand-dark);
	}

	.btn-secondary {
		background: var(--surface-raised);
		color: var(--text-primary);
		border: 1px solid var(--border-structural);
	}

	.btn:hover {
		opacity: 0.85;
	}

	h2 {
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--text-primary);
		margin-block-end: var(--space-3);
	}

	p {
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
	}

	.feature-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-block-start: var(--space-4);
	}

	.feature-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
	}

	.feature-list li::before {
		content: '✓';
		color: var(--brand-accent);
		font-weight: var(--weight-bold);
		flex-shrink: 0;
	}
</style>
