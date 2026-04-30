<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Section from '$lib/components/Section.svelte';

	const sections = [
		{ id: 'overview', title: 'Overview' },
		{ id: 'data-we-collect', title: 'Data we collect' },
		{ id: 'how-we-use-it', title: 'How we use it' },
		{ id: 'retention', title: 'Retention' },
		{ id: 'sharing', title: 'Sharing with third parties' },
		{ id: 'cookies', title: 'Cookies and analytics' },
		{ id: 'your-rights', title: 'Your rights' },
		{ id: 'contact', title: 'Contact' },
	];
</script>

<SEO
	seo={{
		title: 'Privacy policy example',
		description: 'A copyable legal/privacy page skeleton with TOC.',
		canonicalPath: '/examples/legal',
		robots: 'noindex, nofollow',
	}}
/>

<Section width="narrow">
	<header class="page-header">
		<p class="eyebrow">Legal</p>
		<h1>Privacy policy</h1>
		<p class="meta">Last updated: April 27, 2026</p>
		<p class="lede">
			This is a structural skeleton — not legal advice. Replace each section with copy reviewed by
			your own counsel before you ship a real policy.
		</p>
	</header>
</Section>

<Section width="narrow">
	<div class="legal-layout">
		<nav class="toc" aria-label="Table of contents">
			<h2>Contents</h2>
			<ol>
				{#each sections as s (s.id)}
					<li><a href="#{s.id}">{s.title}</a></li>
				{/each}
			</ol>
		</nav>

		<article class="prose">
			<section id="overview">
				<h2>Overview</h2>
				<p>
					This policy explains what data we collect when you visit our website, how we use it, and
					the choices you have. It applies to <em>example.com</em> and any subdomain we operate.
				</p>
			</section>

			<section id="data-we-collect">
				<h2>Data we collect</h2>
				<ul>
					<li>Information you submit through forms (e.g. name, email, message).</li>
					<li>Basic technical data your browser sends with every request (IP, user-agent).</li>
					<li>Anonymous analytics events when you accept the analytics cookie.</li>
				</ul>
			</section>

			<section id="how-we-use-it">
				<h2>How we use it</h2>
				<p>
					Form submissions are routed to our team inbox and an automation tool we use to track
					follow-ups. Technical data is used to operate the site safely (rate-limiting, security).
					Analytics events help us understand which pages people read.
				</p>
			</section>

			<section id="retention">
				<h2>Retention</h2>
				<p>
					We keep contact form submissions only as long as needed to respond and handle follow-up.
					Operational automation records and backups are retained on a separate schedule. Replace
					this paragraph with your project's actual retention windows before launch.
				</p>
			</section>

			<section id="sharing">
				<h2>Sharing with third parties</h2>
				<p>
					We don't sell your data. We share only what's necessary with service providers we use to
					operate the site (hosting, email delivery, analytics). A current list is available on
					request.
				</p>
			</section>

			<section id="cookies">
				<h2>Cookies and analytics</h2>
				<p>
					Analytics is opt-in. If you decline, no third-party scripts load and no cookies are set
					beyond what's required to remember that choice.
				</p>
			</section>

			<section id="your-rights">
				<h2>Your rights</h2>
				<p>
					You can request a copy or deletion of any personal data we hold about you. Email
					<a href="mailto:privacy@example.com">privacy@example.com</a> and we will respond within 30 days.
				</p>
			</section>

			<section id="contact">
				<h2>Contact</h2>
				<p>
					Questions? Reach us at
					<a href="mailto:privacy@example.com">privacy@example.com</a> or use the
					<a href="/contact">contact form</a>.
				</p>
			</section>
		</article>
	</div>
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

	.meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-block-start: var(--space-2);
	}

	.lede {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		margin-block-start: var(--space-3);
		max-inline-size: 55ch;
	}

	.legal-layout {
		display: grid;
		gap: var(--space-8);
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
	}

	@media (width < 48rem) {
		.legal-layout {
			grid-template-columns: 1fr;
		}
	}

	.toc {
		position: sticky;
		top: var(--space-8);
		align-self: start;
		font-size: var(--text-sm);
	}

	.toc h2 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--text-secondary);
		margin-block-end: var(--space-3);
	}

	.toc ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.toc a {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.toc a:hover {
		color: var(--text-primary);
		text-decoration: underline;
	}

	.prose section + section {
		margin-block-start: var(--space-8);
	}

	.prose h2 {
		margin-block-end: var(--space-3);
		scroll-margin-block-start: var(--space-8);
	}

	.prose p {
		color: var(--text-secondary);
		line-height: var(--leading-relaxed);
		margin-block-end: var(--space-3);
	}

	.prose ul {
		padding-inline-start: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--text-secondary);
	}
</style>
