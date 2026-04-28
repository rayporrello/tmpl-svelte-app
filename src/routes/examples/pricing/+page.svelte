<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const tiers = [
		{
			name: 'Starter',
			price: '$0',
			cadence: 'forever',
			summary: 'For trying things out and side projects.',
			features: ['1 project', 'Community support', 'Public deploys only', '1 GB asset storage'],
			cta: { label: 'Start free', href: '/contact', variant: 'secondary' },
			featured: false,
		},
		{
			name: 'Studio',
			price: '$49',
			cadence: 'per editor / month',
			summary: 'For small teams shipping client work.',
			features: [
				'Unlimited projects',
				'Email support, 1-day response',
				'Private deploys',
				'50 GB asset storage',
				'Custom domain',
			],
			cta: { label: 'Start a trial', href: '/contact', variant: 'primary' },
			featured: true,
		},
		{
			name: 'Enterprise',
			price: 'Talk to us',
			cadence: 'annual contract',
			summary: 'For agencies and brand teams with compliance needs.',
			features: [
				'Everything in Studio',
				'SSO and SCIM',
				'Self-hosted option',
				'Named support contact',
				'SLA + DPA',
			],
			cta: { label: 'Contact sales', href: '/contact', variant: 'secondary' },
			featured: false,
		},
	];
</script>

<SEO
	seo={{
		title: 'Pricing example',
		description: 'A copyable three-tier pricing page archetype.',
		canonicalPath: '/examples/pricing',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Pricing</p>
		<h1>Pick the plan that fits the work</h1>
		<p class="lede">
			No per-seat surprises, no annual lock-in on the lower tiers. Switch between Starter and Studio
			any time.
		</p>
	</header>
</Section>

<Section>
	<ul class="tier-grid" role="list">
		{#each tiers as tier (tier.name)}
			<li>
				<article class="card tier" data-featured={tier.featured ? 'true' : undefined}>
					{#if tier.featured}
						<p class="tier-badge">Most teams pick this</p>
					{/if}
					<h2>{tier.name}</h2>
					<p class="tier-price">
						<span class="amount">{tier.price}</span>
						<span class="cadence">{tier.cadence}</span>
					</p>
					<p class="tier-summary">{tier.summary}</p>
					<ul class="tier-features" role="list">
						{#each tier.features as feature (feature)}
							<li>{feature}</li>
						{/each}
					</ul>
					<a href={tier.cta.href} class="btn btn-{tier.cta.variant}">
						{tier.cta.label}
					</a>
				</article>
			</li>
		{/each}
	</ul>
</Section>

<Section width="narrow">
	<aside class="faq-prompt">
		<h2>Pricing questions</h2>
		<p>See the <a href="/examples/faq">FAQ</a> for common pricing and billing questions.</p>
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
		max-inline-size: 22ch;
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.tier-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		align-items: stretch;
	}

	.tier {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		height: 100%;
		padding: var(--space-6);
	}

	.tier[data-featured='true'] {
		border-color: var(--brand-accent);
		box-shadow: var(--shadow-md);
	}

	.tier-badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--brand-accent);
		margin: 0;
	}

	.tier h2 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.tier-price {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-block: var(--space-2);
	}

	.tier-price .amount {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		color: var(--text-primary);
	}

	.tier-price .cadence {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.tier-summary {
		color: var(--text-secondary);
	}

	.tier-features {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--text-secondary);
		flex: 1;
	}

	.tier-features li::before {
		content: '✓ ';
		color: var(--brand-accent);
		font-weight: var(--weight-bold);
	}

	.faq-prompt {
		text-align: center;
		color: var(--text-secondary);
	}
</style>
