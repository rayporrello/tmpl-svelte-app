<script lang="ts">
	import { page } from '$app/state';
	import { site } from '$lib/config/site';

	const messages: Record<number, string> = {
		404: "The page you were looking for doesn't exist.",
		403: "You don't have permission to view this page.",
		500: 'The server encountered an error. Please try again in a moment.',
		503: 'The service is temporarily unavailable. Please try again shortly.',
	};

	const heading = page.status === 404 ? 'Page not found' : 'Something went wrong';
	const detail = messages[page.status] ?? 'An error occurred. Please try again.';
	const requestId = page.error?.requestId;

	let copied = $state(false);

	async function copyRequestId() {
		if (!requestId) return;
		await navigator.clipboard.writeText(requestId);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>Error {page.status}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="error-page" aria-labelledby="error-heading">
	<p class="error-status" aria-hidden="true">{page.status}</p>
	<h1 id="error-heading">{heading}</h1>
	<p class="error-detail">{detail}</p>

	{#if requestId}
		<div class="error-request-id">
			<p class="error-request-id-label">Reference ID</p>
			<div class="error-request-id-row">
				<code class="error-request-id-value">{requestId}</code>
				<button
					type="button"
					class="error-copy-btn"
					onclick={copyRequestId}
					aria-label="Copy reference ID to clipboard"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<p class="error-contact-hint">
				When contacting support, include this reference ID.
				<a href="mailto:{site.contact.email}">Contact support</a>
			</p>
		</div>
	{/if}

	{#if import.meta.env.DEV && page.error?.message}
		<details class="error-dev-details">
			<summary>Developer details</summary>
			<pre class="error-dev-stack">{page.error.message}</pre>
		</details>
	{/if}

	<a href="/" class="error-home-link">Go back home</a>
</section>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding-block: var(--space-16);
		padding-inline: var(--space-4);
		min-height: 50dvh;
		gap: var(--space-4);
	}

	.error-status {
		font-size: var(--text-5xl);
		font-weight: 700;
		color: var(--text-muted);
		line-height: 1;
		margin: 0;
	}

	h1 {
		font-size: var(--text-2xl);
		color: var(--text-primary);
		margin: 0;
	}

	.error-detail {
		font-size: var(--text-base);
		color: var(--text-secondary);
		max-width: 40ch;
		margin: 0;
	}

	.error-request-id {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		background: var(--surface-raised);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
	}

	.error-request-id-label {
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.error-request-id-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.error-request-id-value {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-primary);
		user-select: all;
	}

	.error-copy-btn {
		font-size: var(--text-xs);
		color: var(--border-focus);
		background: none;
		border: 1px solid var(--border-focus);
		border-radius: var(--radius-sm);
		padding-block: calc(var(--space-1) / 2);
		padding-inline: var(--space-2);
		cursor: pointer;
		min-height: 28px;
	}

	.error-copy-btn:hover {
		background: color-mix(in oklch, var(--border-focus) 10%, transparent);
	}

	.error-contact-hint {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
	}

	.error-contact-hint a {
		color: var(--border-focus);
		text-underline-offset: 0.2em;
	}

	.error-dev-details {
		max-width: 60ch;
		text-align: start;
		background: var(--surface-raised);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		padding: var(--space-3) var(--space-4);
	}

	.error-dev-details summary {
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}

	.error-dev-stack {
		margin-block-start: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.error-home-link {
		display: inline-block;
		margin-block-start: var(--space-2);
		color: var(--border-focus);
		text-underline-offset: 0.2em;
	}

	.error-home-link:hover {
		text-decoration-thickness: 2px;
	}
</style>
