# Design-System Guardrails

This catalog defines the automated design-system policy checks for this
template. The checker is intentionally repo-specific: it enforces the rules
that keep the template from drifting while leaving judgment-heavy design work
to the documentation and review process.

Run:

```bash
bun run check:design-system
```

## Profiles

Rules apply through file profiles. A file may match more than one profile.

| Profile                | Files                                                                                  | Purpose                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `token-files`          | `src/lib/styles/tokens.css`, `src/lib/styles/brand.example.css`                        | Token definitions and brand examples. Raw token values are expected here.                            |
| `architecture-files`   | `src/lib/styles/reset.css`, `base.css`, `utilities.css`, `animations.css`, `forms.css` | Shared design-system architecture. Some baseline CSS patterns are allowed.                           |
| `styleguide`           | `src/routes/styleguide/**`                                                             | Living documentation and examples. Some demo markup is intentionally looser.                         |
| `examples`             | `src/routes/examples/**`                                                               | Example routes. Kept useful without making examples block unrelated template work.                   |
| `section-component`    | `src/lib/components/Section.svelte`                                                    | The only component allowed to render the canonical raw `<section>` wrapper.                          |
| `cms-image-component`  | `src/lib/components/CmsImage.svelte`                                                   | The only component allowed to render internal plain `<img>` elements for CMS images.                 |
| `app-html-theme-color` | `src/app.html` theme-color meta only                                                   | Browser chrome color must be a literal value because CSS variables are unavailable in HTML metadata. |
| `data-uri-svg`         | `url(data:image/svg+xml,...)` and `src="data:image/svg+xml,..."`                       | Placeholder/demo SVGs and select chevron data URIs may contain encoded color values.                 |

## Suppressions

Use suppressions sparingly. The checker recognizes this exact escape hatch:

```css
/* ds-allow <rule-id>: <reason of at least 10 characters> */
```

The suppression applies to the same line or the next line. The reason is
required so exceptions stay reviewable. The reason must contain at least 10
characters after trimming surrounding whitespace. Too-short reasons are
reported as `ds/suppression-reason`, and the suppression does not take effect.
Valid suppressions that do not suppress a violation are reported as
`ds/suppression-orphan` warnings during full-file checks.

Pass:

```css
/* ds-allow ds/theme-color: browser theme color requires literal metadata */
```

Fail:

```css
/* ds-allow ds/theme-color: ok */
```

## Suppression Hygiene Rules

### ds/suppression-reason

Severity: `error`

Profiles: all files. A `ds-allow` comment with a reason shorter than 10
characters is invalid and does not suppress the target rule.

Pass:

```css
/* ds-allow ds/missing-token: token injected by project */
```

Fail:

```css
/* ds-allow ds/missing-token: ok */
```

### ds/suppression-orphan

Severity: `warn`

Profiles: all files during full checks. A valid `ds-allow` comment is an orphan
when its target rule does not fire on the same line or the next line. Orphan
detection is skipped during incremental `--changed` runs because those runs may
not have enough whole-file context.

Pass:

```css
.card {
	/* ds-allow ds/missing-token: token injected by project */
	color: var(--project-token);
}
```

Fail:

```css
.card {
	/* ds-allow ds/missing-token: token injected by project */
	color: var(--text-primary);
}
```

## Wave 1 Rules

### ds/missing-token

Severity: `error`

Profiles: all files. Token definitions come from `tokens.css` plus architecture
CSS files. Explicit local custom properties start with `--flow-space`.

Suppression:

```css
/* ds-allow ds/missing-token: local token is injected by consuming project */
```

Pass:

```css
.card {
	color: var(--text-primary);
}
```

Fail:

```css
.card {
	color: var(--text-unknown);
}
```

### ds/viewport-lock

Severity: `error`

Profiles: all HTML and Svelte files.

Suppression:

```css
/* ds-allow ds/viewport-lock: kiosk route intentionally disables zoom */
```

Pass:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Fail:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
```

### ds/body-overflow-hidden

Severity: `error`

Profiles: all CSS and Svelte style blocks.

Suppression:

```css
/* ds-allow ds/body-overflow-hidden: route wrapper handles its own scroll */
```

Pass:

```css
.modal-open {
	overflow: hidden;
}
```

Fail:

```css
html,
body {
	overflow: hidden;
}
```

### ds/no-tailwind

Severity: `error`

Profiles: all source, config, and package files.

Suppression:

```css
/* ds-allow ds/no-tailwind: temporary migration fixture documents unsupported input */
```

Pass:

```ts
import Section from '$lib/components/Section.svelte';
```

Fail:

```css
@tailwind utilities;
```

### ds/route-main

Severity: `error`

Profiles: Svelte route/component files. `src/routes/+layout.svelte` is the only
allowed file for the page `<main id="main-content">`.

Suppression:

```css
/* ds-allow ds/route-main: isolated fixture renders a full document */
```

Pass:

```svelte
<article>
	<h1>Article title</h1>
</article>
```

Fail:

```svelte
<main>
	<h1>Page title</h1>
</main>
```

### ds/nav-aria-label

Severity: `error`

Profiles: all Svelte files.

Suppression:

```css
/* ds-allow ds/nav-aria-label: label comes from generated wrapper */
```

Pass:

```svelte
<nav aria-label="Primary">
	<a href="/">Home</a>
</nav>
```

Fail:

```svelte
<nav>
	<a href="/">Home</a>
</nav>
```

### ds/image-attrs

Severity: `error`

Profiles: all Svelte files. Applies to `<img>`, `<CmsImage>`, and
`<enhanced:img>`. Decorative images pass with `alt=""` as long as `alt`,
`width`, and `height` are present.

Suppression:

```css
/* ds-allow ds/image-attrs: third-party widget injects dimensions at runtime */
```

Pass:

```svelte
<CmsImage src="/uploads/team.jpg" alt="Team portrait" width={400} height={400} />
```

Fail:

```svelte
<CmsImage src="/uploads/team.jpg" alt="Team portrait" />
```

### ds/layer-order

Severity: `error`

Profiles: all CSS and Svelte style blocks. Allowed layer names are `reset`,
`tokens`, `base`, `utilities`, and `components`. `src/app.css` must declare
them in that order before imports.

Suppression:

```css
/* ds-allow ds/layer-order: fixture intentionally demonstrates invalid layer */
```

Pass:

```css
@layer reset, tokens, base, utilities, components;
```

Fail:

```css
@layer reset, tokens, components, utilities;
```

### ds/theme-color

Severity: `error`

Profiles: all files, with the `app-html-theme-color` and `data-uri-svg`
allowances.

Suppression:

```css
/* ds-allow ds/theme-color: fixture intentionally shows raw hex color */
```

Pass:

```html
<meta name="theme-color" content="#0B1120" />
```

Fail:

```css
.card {
	background: #0b1120;
}
```

## Reserved Wave 2 and Wave 3 IDs

These IDs are reserved so future checks keep stable names.

| Rule ID                           | Target severity     | Planned wave | Notes                                                          |
| --------------------------------- | ------------------- | ------------ | -------------------------------------------------------------- |
| `ds/no-raw-color`                 | `error`             | Wave 2       | For raw color functions and named colors outside token files.  |
| `ds/brand-primitive-in-component` | `warn` then `error` | Wave 2       | For `var(--brand-*)` usage in component CSS.                   |
| `ds/raw-section`                  | `warn` then `error` | Wave 2       | For raw thematic `<section>` outside `Section.svelte`.         |
| `ds/physical-properties`          | `warn`              | Wave 3       | For directional physical CSS properties and shorthands.        |
| `ds/hardcoded-spacing`            | `warn`              | Wave 3       | For spacing values that should use tokens.                     |
| `ds/opacity-surface`              | `warn`              | Wave 3       | For opacity used as a translucent surface effect.              |
| `ds/plain-meaningful-img`         | `warn`              | Wave 3       | For plain images that should use `CmsImage` or `enhanced:img`. |
