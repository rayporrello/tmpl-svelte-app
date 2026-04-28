<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const team = [
		{
			name: 'Alex Rivera',
			role: 'Founder, design lead',
			bio: 'Designs the system. Reviews every shipped page.',
		},
		{
			name: 'Sam Patel',
			role: 'Engineering lead',
			bio: 'Owns the build pipeline and the boring parts of going live.',
		},
		{
			name: 'Jordan Lee',
			role: 'Operations',
			bio: 'Keeps projects on schedule and the team talking.',
		},
	];

	const values = [
		{
			title: 'Ship boring infrastructure',
			body: 'SEO, forms, deploys — they have to work the first time.',
		},
		{
			title: 'Edit-in-place defaults',
			body: 'Every choice should be obvious to inherit and easy to override.',
		},
		{
			title: 'No-magic stack',
			body: 'Plain HTML, plain CSS, the fewest moving parts that solve the problem.',
		},
	];
</script>

<SEO
	seo={{
		title: 'About example',
		description: 'A copyable about-page archetype with story, values, and team.',
		canonicalPath: '/examples/about',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">About</p>
		<h1>We build the websites we wish other agencies built</h1>
		<p class="lede">
			Small studio. Native web tools. Sites that work without fighting their own framework.
		</p>
	</header>
</Section>

<Section width="narrow">
	<article class="prose">
		<h2>Our story</h2>
		<p>
			We started in 2024 after one too many client projects spent re-implementing the same handful
			of features — sitemaps, forms, OG images, deploys — across whatever stack happened to be
			fashionable that year. So we stopped, picked one stack, and made the boilerplate good.
		</p>
		<p>
			We work with founders, marketers, and small product teams who want a marketing site that's
			fast, accessible, and easy to keep up to date — without the overhead of a full CMS rebuild
			every two years.
		</p>
	</article>
</Section>

<Section>
	<header class="section-header">
		<h2>What we believe</h2>
	</header>
	<dl class="values-list">
		{#each values as value (value.title)}
			<div class="value">
				<dt>{value.title}</dt>
				<dd>{value.body}</dd>
			</div>
		{/each}
	</dl>
</Section>

<Section>
	<header class="section-header">
		<h2>The team</h2>
		<p class="section-lede">Three people. Everyone touches every project.</p>
	</header>
	<ul class="team-grid" role="list">
		{#each team as member (member.name)}
			<li>
				<article class="card">
					<h3>{member.name}</h3>
					<p class="role">{member.role}</p>
					<p>{member.bio}</p>
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
		max-inline-size: 22ch;
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.prose h2 {
		margin-block-end: var(--space-3);
	}

	.prose p {
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
		margin-block-end: var(--space-4);
	}

	.section-header {
		margin-block-end: var(--space-8);
	}

	.section-lede {
		color: var(--text-secondary);
		margin-block-start: var(--space-2);
	}

	.values-list {
		display: grid;
		gap: var(--space-6);
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		margin: 0;
	}

	.value dt {
		font-weight: var(--weight-semibold);
		font-size: var(--text-lg);
		margin-block-end: var(--space-2);
	}

	.value dd {
		margin: 0;
		color: var(--text-secondary);
	}

	.team-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	}

	.team-grid h3 {
		margin-block-end: var(--space-1);
	}

	.team-grid .role {
		color: var(--brand-accent);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		margin-block-end: var(--space-3);
	}

	.team-grid p:not(.role) {
		color: var(--text-secondary);
	}
</style>
