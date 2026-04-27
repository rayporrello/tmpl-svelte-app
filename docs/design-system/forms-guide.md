# Forms Guide

## Contact form — activation walkthrough

The template ships a ready-to-use contact form at `src/routes/contact-example/`. It is
dormant by default (`noindex`, route name has `-example` suffix). Activation takes five
minutes.

### Step 1 — Rename the route

```bash
mv src/routes/contact-example src/routes/contact
```

### Step 2 — Update SEO registration

In [src/lib/seo/routes.ts](../../src/lib/seo/routes.ts), change the path and make the
route indexable:

```ts
{ path: '/contact', indexable: true, changefreq: 'yearly', priority: 0.5 }
```

Also update the `canonicalPath` in `+page.svelte` from `/contact-example` to `/contact`
and remove the `robots: 'noindex, nofollow'` override.

### Step 3 — Set env vars

In your `.env` (or via Infisical):

```
CONTACT_TO_EMAIL=hello@yourdomain.com
CONTACT_FROM_EMAIL=noreply@yourdomain.com
```

With just these two steps the form logs submissions to stdout via the console provider.
That's enough to validate the integration before wiring a real email provider.

### Step 4 (optional) — Enable rate limiting

```
RATE_LIMIT_ENABLED=true
```

This activates the in-process token-bucket limiter (5 burst, 1/min refill, keyed by IP).
It is a local abuse guard — buckets reset on server restart. For distributed deployments,
replace `src/lib/server/forms/rate-limit.ts` with a Redis-backed implementation.

### Step 5 (optional) — Swap the email provider

The console provider logs to stdout. To send real email via Postmark:

1. Copy `src/lib/server/forms/providers/postmark.example.ts` → `postmark.ts`.
2. Set `POSTMARK_SERVER_TOKEN` in your env (already declared in `env.ts`).
3. In `src/routes/contact/+page.server.ts`, replace:
   ```ts
   import { consoleProvider } from '$lib/server/forms/providers/console';
   ```
   with:
   ```ts
   import { makePostmarkProvider } from '$lib/server/forms/providers/postmark';
   import { privateEnv } from '$lib/server/env';
   const emailProvider = makePostmarkProvider(privateEnv.POSTMARK_SERVER_TOKEN!);
   ```
   Then use `emailProvider` instead of `consoleProvider` in the action.

4. **CSP:** Postmark's API is called server-side, so no `connect-src` change is needed.
   If you redirect form submission to an external endpoint instead, widen `form-action`
   in `src/lib/server/csp.ts`:
   ```ts
   'form-action': ["'self'", 'https://api.postmarkapp.com'],
   ```

### Provider interface

All email providers implement `EmailProvider` from
`src/lib/server/forms/email-provider.ts`. The interface is minimal — implement `send()`
and the form action works without changes:

```ts
export interface EmailProvider {
  send(payload: EmailPayload): Promise<void>;
}
```

---

## The two-layer model

Forms in this template use two layers with a clear responsibility split:

| Layer | What it owns | How to add |
|-------|-------------|------------|
| **`forms.css`** | Visual layout, control appearance, accessible states, error/help text, focus rings, form messages | Already present in template |
| **Superforms** | Validation, data binding, submission, progressive enhancement, server errors, constraint API | `bun add sveltekit-superforms valibot` |

These layers are independent. `forms.css` works without Superforms (for static display, contact forms before JavaScript loads, etc.). When a form needs submission behavior, add Superforms — the CSS layer needs no changes.

## Why Superforms

Superforms is the standard form behavior library for projects built from this template.

- It handles the hard parts: client/server validation with the same schema, type-safe form data, progressive enhancement, pending states, and multi-step form patterns.
- It integrates natively with SvelteKit server actions.
- It works with Valibot (default) or Zod for schema definitions.
- It generates the same HTML markup patterns that `forms.css` already styles.

Do not build a custom form submission layer or reach for a different form library. When a project needs forms with behavior, the answer is Superforms.

## When to install Superforms

`sveltekit-superforms` is already installed as a devDependency — no install step needed.
`valibot` is also present. Both are bundled into the server output at build time.

When a project cloned from this template needs its first form, the package is already
there. Just import from it.

## CSS class surface

These classes come from `forms.css`. Use them regardless of whether Superforms is installed.

### Containers

```html
<!-- Full form wrapper: vertical stack -->
<form class="form">

  <!-- Named logical group within a form -->
  <div class="form-section">
    <h3>Contact information</h3>
    …
  </div>

  <!-- Auto-responsive 1→2 column field grid -->
  <div class="form-grid">
    …
  </div>

  <!-- Submit / cancel cluster -->
  <div class="form-actions">
    <button type="submit">Submit</button>
    <button type="button">Cancel</button>
  </div>

</form>
```

### Field unit

Each field is a self-contained unit: label + control + help + error.

```html
<div class="field">
  <label class="field-label" for="email">
    Email address
    <span class="field-required" aria-hidden="true">*</span>
  </label>
  <input
    id="email"
    name="email"
    class="input"
    type="email"
    aria-describedby="email-help"
  />
  <p class="field-help" id="email-help">We won't share your email.</p>
  <p class="field-error">...</p>  <!-- rendered by Superforms when invalid -->
</div>
```

### Controls

```html
<!-- Text inputs -->
<input class="input" type="text" />
<input class="input" type="email" />
<input class="input" type="tel" />

<!-- Textarea -->
<textarea class="textarea" rows="4"></textarea>

<!-- Select -->
<select class="select">
  <option value="">Choose one…</option>
  <option value="a">Option A</option>
</select>

<!-- Checkbox (inline label wraps the input) -->
<label class="checkbox-row">
  <input type="checkbox" />
  Receive product updates
</label>

<!-- Radio (inline label wraps the input) -->
<label class="radio-row">
  <input type="radio" name="plan" value="free" />
  Free plan
</label>
```

### Form-level messages

```html
<!-- Default / info -->
<div class="form-message">
  Something to know before you submit.
</div>

<!-- Success -->
<div class="form-message" data-variant="success">
  Your message was sent successfully.
</div>

<!-- Warning -->
<div class="form-message" data-variant="warning">
  Some fields need attention.
</div>

<!-- Danger / error -->
<div class="form-message" data-variant="danger">
  There was a problem. Please try again.
</div>
```

## Invalid field states

Three selector patterns are supported. Use whichever fits your render approach.

### 1. ARIA (universal)

```html
<input class="input" aria-invalid="true" />
```

Superforms sets `aria-invalid` automatically when a field has an error. This is the recommended pattern.

### 2. Data attribute (easy with Superforms enhance)

```html
<input class="input" data-invalid="true" />
```

### 3. Parent field wrapper

```html
<div class="field" data-invalid="true">
  <label class="field-label">…</label>
  <input class="input" />
  <p class="field-error">…</p>
</div>
```

When `.field[data-invalid="true"]` is present:
- The `.field-label` shifts to the error color
- All `.input`, `.textarea`, `.select` children get the error border

## Disabled state

```html
<input class="input" disabled />
<select class="select" disabled />
<textarea class="textarea" disabled />

<!-- Checkbox/radio rows dim when their input is disabled -->
<label class="checkbox-row">
  <input type="checkbox" disabled />
  Unavailable option
</label>
```

Disabled controls use `opacity: 0.5` — this is intentional whole-element dimming (the placeholder, icon, and control surface all dim together). See the opacity rule in [component-css-rules.md](component-css-rules.md).

## Full Superforms integration pattern

Once Superforms is installed, the typical pattern for a SvelteKit server-action form:

### Schema (Valibot)

```ts
// src/lib/schemas/contact.ts
import { object, string, email, minLength } from 'valibot';

export const contactSchema = object({
  name:    string([minLength(1, 'Name is required')]),
  email:   string([email('Please enter a valid email')]),
  message: string([minLength(10, 'Message must be at least 10 characters')]),
});
```

### Server action

```ts
// src/routes/contact/+page.server.ts
import { superValidate, message } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { contactSchema } from '$lib/schemas/contact';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { form: await superValidate(valibot(contactSchema)) };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, valibot(contactSchema));
    if (!form.valid) return fail(400, { form });

    // … send email, save to DB, etc.

    return message(form, 'Message sent!');
  },
};
```

### Svelte page

```svelte
<!-- src/routes/contact/+page.svelte -->
<script>
  import { superForm } from 'sveltekit-superforms';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const { form, errors, enhance, message, delayed } = superForm(data.form);
</script>

{#if $message}
  <div class="form-message" data-variant="success">{$message}</div>
{/if}

<form class="form" method="POST" use:enhance>

  {#if $errors._errors}
    <div class="form-message" data-variant="danger">
      {$errors._errors.join(', ')}
    </div>
  {/if}

  <div class="field" data-invalid={$errors.name ? 'true' : undefined}>
    <label class="field-label" for="name">Name</label>
    <input
      id="name"
      name="name"
      class="input"
      type="text"
      bind:value={$form.name}
      aria-invalid={$errors.name ? 'true' : undefined}
      aria-describedby={$errors.name ? 'name-error' : undefined}
    />
    {#if $errors.name}
      <p class="field-error" id="name-error">{$errors.name}</p>
    {/if}
  </div>

  <div class="field" data-invalid={$errors.email ? 'true' : undefined}>
    <label class="field-label" for="email">Email</label>
    <input
      id="email"
      name="email"
      class="input"
      type="email"
      bind:value={$form.email}
      aria-invalid={$errors.email ? 'true' : undefined}
    />
    {#if $errors.email}
      <p class="field-error">{$errors.email}</p>
    {/if}
  </div>

  <div class="field" data-invalid={$errors.message ? 'true' : undefined}>
    <label class="field-label" for="message">Message</label>
    <textarea
      id="message"
      name="message"
      class="textarea"
      bind:value={$form.message}
      aria-invalid={$errors.message ? 'true' : undefined}
    ></textarea>
    {#if $errors.message}
      <p class="field-error">{$errors.message}</p>
    {/if}
  </div>

  <div class="form-actions">
    <button type="submit" disabled={$delayed}>
      {$delayed ? 'Sending…' : 'Send message'}
    </button>
  </div>

</form>
```

## What NOT to do

- Do not add form validation logic to `forms.css` or any other CSS file.
- Do not build a custom form submission handler — use Superforms server actions.
- Do not use Formsnap. Superforms is the standard; Formsnap is not needed.
- Do not add a competing form schema library (Zod can be used instead of Valibot, but both are fine — just be consistent within a project).
- Do not hardcode error styles inside component `<style>` blocks when `forms.css` already handles them.
