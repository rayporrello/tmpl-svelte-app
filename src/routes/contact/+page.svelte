<script lang="ts">
	import { untrack } from 'svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { form, errors, enhance, message, delayed, submitting } = superForm(
		untrack(() => data.form),
		{ resetForm: true }
	);
</script>

<SEO
	seo={{
		title: 'Contact',
		description: 'Send us a message.',
		canonicalPath: '/contact',
	}}
/>

<div class="contact-page">
	<div class="contact-inner">
		<header class="contact-header">
			<h1>Contact</h1>
			<p class="text-secondary">Have a question or want to work together? Send us a message.</p>
		</header>

		{#if $message}
			<div
				class="form-message"
				data-variant={$message.startsWith('Message sent') ? 'success' : 'danger'}
			>
				{$message}
			</div>
		{/if}

		<form class="form" method="POST" use:enhance>
			<div class="honeypot" aria-hidden="true">
				<label>
					Website
					<input
						type="text"
						name="website"
						tabindex="-1"
						autocomplete="off"
						bind:value={$form.website}
					/>
				</label>
			</div>

			{#if $errors._errors}
				<div class="form-message" data-variant="danger">
					{$errors._errors.join(', ')}
				</div>
			{/if}

			<div class="field" data-invalid={$errors.name ? 'true' : undefined}>
				<label class="field-label" for="name">
					Name
					<span class="field-required" aria-hidden="true">*</span>
				</label>
				<input
					id="name"
					name="name"
					class="input"
					type="text"
					autocomplete="name"
					bind:value={$form.name}
					aria-invalid={$errors.name ? 'true' : undefined}
					aria-describedby={$errors.name ? 'name-error' : undefined}
				/>
				{#if $errors.name}
					<p class="field-error" id="name-error">{$errors.name}</p>
				{/if}
			</div>

			<div class="field" data-invalid={$errors.email ? 'true' : undefined}>
				<label class="field-label" for="email">
					Email
					<span class="field-required" aria-hidden="true">*</span>
				</label>
				<input
					id="email"
					name="email"
					class="input"
					type="email"
					autocomplete="email"
					bind:value={$form.email}
					aria-invalid={$errors.email ? 'true' : undefined}
					aria-describedby={$errors.email ? 'email-error' : undefined}
				/>
				{#if $errors.email}
					<p class="field-error" id="email-error">{$errors.email}</p>
				{/if}
			</div>

			<div class="field" data-invalid={$errors.message ? 'true' : undefined}>
				<label class="field-label" for="message">
					Message
					<span class="field-required" aria-hidden="true">*</span>
				</label>
				<textarea
					id="message"
					name="message"
					class="textarea"
					rows="6"
					bind:value={$form.message}
					aria-invalid={$errors.message ? 'true' : undefined}
					aria-describedby={$errors.message ? 'message-error' : undefined}
				></textarea>
				{#if $errors.message}
					<p class="field-error" id="message-error">{$errors.message}</p>
				{/if}
			</div>

			<div class="form-actions">
				<button type="submit" disabled={$submitting || $delayed}>
					{$delayed ? 'Sending…' : 'Send message'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.contact-page {
		padding-block: var(--space-12);
	}

	.contact-inner {
		max-width: var(--content-narrow);
		margin-inline: auto;
		padding-inline: var(--space-4);
	}

	.contact-header {
		margin-block-end: var(--space-8);
	}

	.contact-header h1 {
		margin-block-end: var(--space-2);
	}

	.form {
		margin-block-start: var(--space-6);
	}

	.honeypot {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
</style>
