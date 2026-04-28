<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const groups = [
		{
			heading: 'Pricing & billing',
			items: [
				{
					q: 'Can I switch tiers later?',
					a: 'Yes. Switch up or down at any time from your account settings. Changes take effect on your next billing cycle.',
				},
				{
					q: 'Do you offer annual billing?',
					a: 'Yes — annual plans get two months free on Studio and are required on Enterprise.',
				},
				{
					q: 'What happens if I cancel?',
					a: 'Your projects stay live until the end of the current billing period, then your account moves to the free Starter tier.',
				},
			],
		},
		{
			heading: 'Process & delivery',
			items: [
				{
					q: 'Who owns the code?',
					a: 'You do. We deliver the repository on day one and you keep it whether the project continues or not.',
				},
				{
					q: 'Do you do redesigns of existing sites?',
					a: 'Sometimes — only when the existing stack is replaceable. We will tell you straight if a rebuild is the cleaner option.',
				},
				{
					q: 'How do reviews work?',
					a: 'Two scheduled reviews during a build. Async comments any time. We do not do design-by-meeting.',
				},
			],
		},
	];
</script>

<SEO
	seo={{
		title: 'FAQ example',
		description: 'A copyable accessible FAQ pattern using <details>/<summary>.',
		canonicalPath: '/examples/faq',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">FAQ</p>
		<h1>Frequently asked questions</h1>
		<p class="lede">
			Native HTML disclosure. Keyboard-accessible by default, no JavaScript required, no ARIA
			plumbing.
		</p>
	</header>
</Section>

<Section width="narrow">
	{#each groups as group (group.heading)}
		<section class="faq-group" aria-labelledby={`g-${group.heading.replace(/\s+/g, '-')}`}>
			<h2 id={`g-${group.heading.replace(/\s+/g, '-')}`}>{group.heading}</h2>
			<ul role="list" class="faq-list">
				{#each group.items as item (item.q)}
					<li>
						<details class="faq-item">
							<summary>{item.q}</summary>
							<p>{item.a}</p>
						</details>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</Section>

<Section width="narrow">
	<aside class="cta-band">
		<h2>Didn't find an answer?</h2>
		<p>Send us a question and we'll add common ones to this page.</p>
		<a href="/contact" class="btn btn-primary">Ask a question</a>
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
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.faq-group + .faq-group {
		margin-block-start: var(--space-8);
	}

	.faq-group h2 {
		margin-block-end: var(--space-3);
	}

	.faq-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.faq-item {
		border: 1px solid var(--border-structural);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		overflow: hidden;
	}

	.faq-item summary {
		cursor: pointer;
		padding: var(--space-4);
		font-weight: var(--weight-medium);
		color: var(--text-primary);
		list-style: none;
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		align-items: center;
	}

	.faq-item summary::-webkit-details-marker {
		display: none;
	}

	.faq-item summary::after {
		content: '+';
		color: var(--text-secondary);
		font-size: var(--text-xl);
		line-height: 1;
		flex-shrink: 0;
	}

	.faq-item[open] summary::after {
		content: '−';
	}

	.faq-item p {
		padding: 0 var(--space-4) var(--space-4);
		margin: 0;
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
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
