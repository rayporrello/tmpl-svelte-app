<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';
</script>

<SEO
	seo={{
		title: 'Homepage example',
		description: 'A copyable homepage archetype: hero, value props, social proof, CTA.',
		canonicalPath: '/examples/homepage',
		robots: 'noindex, nofollow',
	}}
/>

<!-- ── Hero ──────────────────────────────────────────────────────────────── -->
<Section width="narrow">
	<div class="hero">
		<p class="eyebrow">For teams that ship</p>
		<h1>Stop wiring the same boilerplate every time</h1>
		<p class="subheadline">
			A starter kit for marketing sites that comes with the unglamorous parts already finished —
			SEO, forms, analytics, content layer, deploy.
		</p>
		<div class="cta-group">
			<a href="#contact" class="btn btn-primary">Start a project</a>
			<a href="#how" class="btn btn-secondary">See how it works</a>
		</div>
	</div>
</Section>

<!-- ── Logo strip / social proof ─────────────────────────────────────────── -->
<Section>
	<p class="proof-label">Used by teams at</p>
	<ul class="logo-strip" role="list" aria-label="Customer logos">
		<li>Acme</li>
		<li>Globex</li>
		<li>Initech</li>
		<li>Umbrella</li>
		<li>Vandelay</li>
		<li>Soylent</li>
	</ul>
</Section>

<!-- ── Value props ───────────────────────────────────────────────────────── -->
<Section id="how">
	<header class="section-header">
		<h2>Three things you don't have to build</h2>
		<p class="section-lede">The parts that take a week and never feel done — already done.</p>
	</header>
	<ul class="feature-grid" role="list">
		<li class="card">
			<h3>SEO that actually works</h3>
			<p>
				Per-route metadata, sitemap, robots, JSON-LD schema, OG image fallback. Wired into the
				validate pipeline so it can't quietly rot.
			</p>
		</li>
		<li class="card">
			<h3>Forms that don't lose data</h3>
			<p>
				Superforms-backed contact form with validation, anti-spam, server persistence, and a webhook
				fan-out to whatever automation tool you use.
			</p>
		</li>
		<li class="card">
			<h3>Content without a database</h3>
			<p>
				Git-backed Markdown + YAML, edited through Sveltia CMS or pull requests. Same files, same
				schema, regardless of who's writing.
			</p>
		</li>
	</ul>
</Section>

<!-- ── Final CTA ─────────────────────────────────────────────────────────── -->
<Section id="contact" width="narrow">
	<div class="cta-band">
		<h2>Have a site to build?</h2>
		<p>Tell us what you're working on. We'll write back within a business day.</p>
		<a href="/contact" class="btn btn-primary btn-lg">Get in touch</a>
	</div>
</Section>

<style>
	.hero {
		padding-block: var(--space-16);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
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
		line-height: var(--leading-tight);
		max-inline-size: 22ch;
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

	.proof-label {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		text-align: center;
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.logo-strip {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-8);
		color: var(--text-muted);
		font-weight: var(--weight-semibold);
		font-size: var(--text-lg);
	}

	.section-header {
		max-inline-size: 50ch;
		margin-block-end: var(--space-8);
	}

	.section-lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-2);
	}

	.feature-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
	}

	.feature-grid h3 {
		margin-block-end: var(--space-2);
	}

	.feature-grid p {
		color: var(--text-secondary);
	}

	.cta-band {
		text-align: center;
		padding: var(--space-12);
		background: var(--surface-sunken);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		align-items: center;
	}

	.cta-band p {
		color: var(--text-secondary);
		max-inline-size: 40ch;
	}
</style>
