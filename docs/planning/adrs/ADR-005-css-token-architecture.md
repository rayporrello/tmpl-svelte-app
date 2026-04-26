# ADR-005: CSS Token Architecture as Default Styling

## Status

Accepted

## Context

Tailwind CSS appeared in early planning notes as the default styling approach. Tailwind is a legitimate tool, but using it as the template default introduces a mandatory build-time dependency and conflicts with the goal of a hand-authored, project-specific design system.

The template was also initially scaffolded with app-shell CSS defaults (`html, body { height: 100%; overflow: hidden; }`). This template targets websites and landing pages, not dashboard applications. Normal document scrolling must be the default.

## Decision

Use CSS custom properties (design tokens), explicit CSS layers, and hand-authored Svelte component styles as the default styling architecture for this template. This is a **website-first** template. Tailwind is not a default dependency.

Key decisions:

- **`tokens.css` is the brand file.** All custom properties live here. To rebrand a project, edit only this file — the architecture files read from it and never need to change.
- **Explicit cascade layers:** `@layer reset, tokens, base, utilities, components` declared in `app.css`.
- **`forms.css` is visual-only.** It provides field layout, control appearance, accessible states, error/help text, disabled styles, focus rings, and form messages. It is CSS-only with no Superforms dependency.
- **Superforms is the standard form behavior library.** Any form with submission behavior uses Superforms (`sveltekit-superforms` + `valibot`). The CSS layer works independently of Superforms and is compatible with both plain HTML forms and Superforms-enhanced forms.
- **Website-first defaults:** `html, body` do not have `overflow: hidden`. `app.html` viewport is `width=device-width, initial-scale=1` — user zoom is not disabled.
- **Opacity rule:** `opacity` is not used to create translucent surfaces — `color-mix(in oklch, color X%, transparent)` is used instead. Opacity is allowed for whole-element fade transitions, skeleton/pulse effects, and disabled controls.

## Implementation

| File | Role |
|------|------|
| `src/lib/styles/tokens.css` | Brand file — edit per project |
| `src/lib/styles/reset.css` | Architecture — do not edit |
| `src/lib/styles/base.css` | Architecture — do not edit |
| `src/lib/styles/animations.css` | Architecture — add brand motion below marker |
| `src/lib/styles/utilities.css` | Architecture — add brand utilities below marker |
| `src/lib/styles/forms.css` | Architecture — add brand form overrides below marker |
| `src/app.css` | Entry — imports only, layer declaration |
| `src/app.html` | HTML shell — update title, theme-color, favicon |
| `src/routes/+layout.svelte` | Root layout — imports `app.css` |
| `src/routes/styleguide/+page.svelte` | Design system demo |

Real design system documentation: `docs/design-system/`

## Consequences

- The CSS is explicit and readable — not dependent on a build tool.
- Tailwind can be added to a specific project that wants it without affecting the template.
- The template does not ship an opinionated component library — component styles are written per project.
- `forms.css` works for static display forms without Superforms; when a project needs form submission, Superforms is added without changing the CSS layer.
- Token naming and layer structure are documented in `docs/design-system/` so agents follow consistent conventions.

## Revisit triggers

- If a project consistently needs a component library and the per-project addition cost is high.
- If Tailwind becomes necessary for a specific downstream project.
- If CSS custom property browser support degrades significantly (unlikely).
- If Superforms is superseded by a clearly better SvelteKit-native solution.
