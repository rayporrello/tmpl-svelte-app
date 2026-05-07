<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const severityLabel = (severity: string) => {
		if (severity === 'pass') return 'Passing';
		if (severity === 'info') return 'Info';
		if (severity === 'warn') return 'Warning';
		return 'Failure';
	};

	const glyph = (severity: string) => {
		if (severity === 'pass') return '✓';
		if (severity === 'info') return 'i';
		if (severity === 'warn') return '!';
		return '✗';
	};
</script>

<SEO
	seo={{
		title: 'Admin Health',
		description: 'Operator-only site health view.',
		canonicalPath: '/admin/health',
		robots: 'noindex, nofollow',
	}}
/>

<Section id="admin-health" class="health-page" width="wide">
	<header class="health-heading">
		<p class="eyebrow">Operator Health</p>
		<h1>Admin Health</h1>
	</header>

	{#each data.summary as item (item.id)}
		<article
			class={`health-card health-card--${item.severity}`}
			aria-labelledby={`${item.id}-title`}
		>
			<header class="card-heading">
				<span class={`severity-dot severity-dot--${item.severity}`} aria-hidden="true"
					>{glyph(item.severity)}</span
				>
				<div class="heading-copy">
					<p class="card-meta">
						<span>{item.id}</span>
						<span class="source-badge">{item.source ?? 'ledger'}</span>
						<span>{severityLabel(item.severity)}</span>
					</p>
					<h2 id={`${item.id}-title`}>{item.summary}</h2>
				</div>
			</header>
			{#if item.detail}
				<pre class="detail"><code>{item.detail}</code></pre>
			{/if}
		</article>
	{/each}

	<section class="results-section" aria-labelledby="health-results-heading">
		<h2 id="health-results-heading">Health Results</h2>
		<ul class="result-list" role="list">
			{#each data.results as item (item.id)}
				<li>
					<article
						class={`health-card health-card--${item.severity}`}
						aria-labelledby={`${item.id}-card-title`}
					>
						<header class="card-heading">
							<span class={`severity-dot severity-dot--${item.severity}`} aria-hidden="true"
								>{glyph(item.severity)}</span
							>
							<div class="heading-copy">
								<p class="card-meta">
									<span>{item.id}</span>
									<span class="source-badge">{item.source ?? 'ledger'}</span>
									<span>{severityLabel(item.severity)}</span>
								</p>
								<h3 id={`${item.id}-card-title`}>{item.summary}</h3>
							</div>
						</header>

						{#if item.detail}
							<pre class="detail"><code>{item.detail}</code></pre>
						{/if}

						{#if item.remediation?.length}
							<section class="remediation" aria-labelledby={`${item.id}-remediation-title`}>
								<h4 id={`${item.id}-remediation-title`}>Remediation</h4>
								<ol>
									{#each item.remediation as step, index (`${item.id}-${index}`)}
										<li>{step}</li>
									{/each}
								</ol>
							</section>
						{/if}

						{#if item.runbook}
							<p class="runbook">Runbook: <code>{item.runbook}</code></p>
						{/if}
					</article>
				</li>
			{/each}
		</ul>
	</section>
</Section>

<style>
	.health-page {
		background: var(--surface-ground);
	}

	.health-heading {
		display: grid;
		gap: var(--space-2);
		max-width: var(--content-narrow);
	}

	.eyebrow,
	.card-meta,
	.runbook {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.eyebrow,
	.card-meta {
		font-weight: var(--weight-medium);
	}

	.results-section {
		display: grid;
		gap: var(--space-5);
	}

	.result-list {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.health-card {
		display: grid;
		gap: var(--space-4);
		padding-block: var(--space-5);
		padding-inline: var(--space-5);
		background: var(--surface-raised);
		border: 1px solid var(--border-structural);
		border-inline-start-width: var(--space-1);
		border-radius: var(--radius-md);
	}

	.health-card--pass {
		border-inline-start-color: var(--color-success);
	}

	.health-card--info {
		border-inline-start-color: var(--color-info);
	}

	.health-card--warn {
		border-inline-start-color: var(--color-warning);
	}

	.health-card--fail {
		border-inline-start-color: var(--color-danger);
	}

	.card-heading {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.heading-copy {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
	}

	.source-badge {
		display: inline-flex;
		align-items: center;
		min-height: var(--space-6);
		padding-inline: var(--space-2);
		background: color-mix(in oklch, var(--color-info) 12%, transparent);
		border: 1px solid color-mix(in oklch, var(--color-info) 35%, transparent);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: var(--text-xs);
	}

	.severity-dot {
		display: inline-grid;
		place-items: center;
		flex: 0 0 var(--space-6);
		inline-size: var(--space-6);
		block-size: var(--space-6);
		border-radius: var(--radius-full);
		font-weight: var(--weight-bold);
	}

	.severity-dot--pass {
		background: var(--color-success-subtle);
		color: var(--color-success);
	}

	.severity-dot--info {
		background: var(--color-info-subtle);
		color: var(--color-info);
	}

	.severity-dot--warn {
		background: var(--color-warning-subtle);
		color: var(--color-warning);
	}

	.severity-dot--fail {
		background: var(--color-danger-subtle);
		color: var(--color-danger);
	}

	.detail {
		overflow-x: auto;
		padding-block: var(--space-3);
		padding-inline: var(--space-3);
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.remediation {
		display: grid;
		gap: var(--space-2);
		padding-block-start: var(--space-3);
		border-block-start: 1px solid var(--border-subtle);
	}

	.remediation ol {
		display: grid;
		gap: var(--space-2);
		padding-inline-start: var(--space-5);
		margin: 0;
	}
</style>
