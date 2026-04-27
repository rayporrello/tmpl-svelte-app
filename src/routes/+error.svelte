<script lang="ts">
	import { page } from '$app/state';

	const messages: Record<number, string> = {
		404: "The page you were looking for doesn't exist.",
		403: "You don't have permission to view this page.",
		500: 'The server encountered an error. Please try again in a moment.',
		503: 'The service is temporarily unavailable. Please try again shortly.'
	};

	const heading = page.status === 404 ? 'Page not found' : 'Something went wrong';
	const detail = messages[page.status] ?? 'An error occurred. Please try again.';
</script>

<svelte:head>
	<title>Error {page.status}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="error-page" aria-labelledby="error-heading">
	<p class="error-status" aria-hidden="true">{page.status}</p>
	<h1 id="error-heading">{heading}</h1>
	<p class="error-detail">{detail}</p>
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

	.error-home-link {
		display: inline-block;
		margin-block-start: var(--space-2);
		color: var(--color-accent);
		text-underline-offset: 0.2em;
	}

	.error-home-link:hover {
		text-decoration-thickness: 2px;
	}
</style>
