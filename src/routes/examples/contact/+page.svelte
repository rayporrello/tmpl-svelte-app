<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
</script>

<SEO
	seo={{
		title: 'Contact (pattern) example',
		description: 'A copyable contact-page layout that mirrors the real /contact route.',
		canonicalPath: '/examples/contact',
		robots: 'noindex, nofollow',
	}}
/>

<div class="contact-page">
	<div class="contact-inner">
		<header class="contact-header">
			<h1>Contact</h1>
			<p class="text-secondary">
				Have a question or want to work together? Send us a message — we usually reply within a
				business day.
			</p>
		</header>

		<aside class="note" role="note">
			<p>
				This page shows the <strong>layout</strong> only. The real form lives at
				<a href="/contact">/contact</a> and uses Superforms with server validation, persistence, and
				webhook fan-out. Copy <code>src/routes/contact/</code> in full when you want a working form,
				then customise the schema in <code>src/lib/server/contact.ts</code>.
			</p>
		</aside>

		<form class="form" novalidate>
			<div class="field">
				<label class="field-label" for="name">
					Name <span class="field-required" aria-hidden="true">*</span>
				</label>
				<input id="name" name="name" class="input" type="text" autocomplete="name" required />
			</div>

			<div class="field">
				<label class="field-label" for="email">
					Email <span class="field-required" aria-hidden="true">*</span>
				</label>
				<input id="email" name="email" class="input" type="email" autocomplete="email" required />
			</div>

			<div class="field">
				<label class="field-label" for="company">Company</label>
				<input id="company" name="company" class="input" type="text" autocomplete="organization" />
			</div>

			<div class="field">
				<label class="field-label" for="message">
					Message <span class="field-required" aria-hidden="true">*</span>
				</label>
				<textarea id="message" name="message" class="textarea" rows="6" required></textarea>
				<p class="field-hint">A few sentences is plenty.</p>
			</div>

			<div class="form-actions">
				<button type="submit" disabled>Send message (demo only)</button>
			</div>
		</form>

		<aside class="other-ways">
			<h2>Other ways to reach us</h2>
			<ul role="list">
				<li>Email: <a href="mailto:hello@example.com">hello@example.com</a></li>
				<li>Hours: weekdays, 9am–5pm Pacific</li>
			</ul>
		</aside>
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
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.contact-header h1 {
		margin-block-end: var(--space-2);
	}

	.note {
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.note p {
		margin: 0;
	}

	.note code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.field-hint {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-block-start: var(--space-1);
	}

	.other-ways {
		border-block-start: 1px solid var(--border-subtle);
		padding-block-start: var(--space-6);
	}

	.other-ways h2 {
		font-size: var(--text-lg);
		margin-block-end: var(--space-2);
	}

	.other-ways ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		color: var(--text-secondary);
	}
</style>
