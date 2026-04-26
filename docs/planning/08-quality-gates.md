# Quality Gates

Checks that must pass before a project built from this template ships or before changes land on `main`.

## Build gates (automated)

- [ ] `bun run build` exits 0 with no errors
- [ ] `bun run check` (svelte-check / TypeScript) exits 0
- [ ] No unresolved TypeScript errors in routes or lib files
- [ ] Bundle size is within expected range (no accidental large imports)

## Lint / format gates (automated)

- [ ] ESLint exits 0 (or equivalent project linter)
- [ ] Prettier exits 0 (or equivalent formatter)
- [ ] No `console.log` left in production code

## Accessibility gates

- [ ] axe-core / Playwright accessibility scan passes with zero critical violations
- [ ] All images have `alt` text (decorative images use `alt=""`)
- [ ] All form controls have associated `<label>` elements
- [ ] All interactive elements are reachable and operable by keyboard
- [ ] Focus rings are visible on all interactive elements (spot-check `Tab` key)
- [ ] Color contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components

## Performance gates

- [ ] Lighthouse performance score ≥ 90 on mobile (production build)
- [ ] LCP ≤ 2.5s on simulated mid-tier mobile
- [ ] No render-blocking font loads (Fontsource variable fonts self-hosted via `@import`)
- [ ] No images without `width` and `height` attributes (prevents layout shift)

## CSS / design system gates

- [ ] **No `html, body { overflow: hidden }` in the website template baseline.** This is a website-first template; full-height viewport lock is not the default. Any project that deliberately adds this must leave a comment explaining why.
- [ ] **No `maximum-scale=1` or `user-scalable=0` in `app.html`.** Disabling user zoom fails WCAG 1.4.4. Website templates must not ship with zoom disabled.
- [ ] **No raw project colors inside component CSS when a semantic token exists.** Components must reference `var(--token)` — never raw oklch/hex/rgb values that belong in `tokens.css`.
- [ ] **No hardcoded spacing values in component CSS** except approved exceptions (e.g., `1px` borders, `2px` outlines, sub-pixel optical corrections). Spacing must use `var(--space-*)` tokens.
- [ ] **No `opacity` for translucent surfaces, borders, overlays, or glass effects.** Use `color-mix(in oklch, color X%, transparent)`. Opacity is allowed for whole-element fade transitions and disabled controls.
- [ ] **CSS layer order in `app.css` is unchanged:** `reset, tokens, base, utilities, components`.
- [ ] **No form behavior duplicated in CSS.** `forms.css` owns visual styling. Superforms owns validation, submission, and data binding. Do not add JS-like logic via CSS custom properties or attribute tricks that replicate Superforms behavior.

## Forms gates

- [ ] All form controls support `aria-invalid="true"` (error state via ARIA)
- [ ] All form controls support `.field-error` help text (or equivalent rendered by Superforms)
- [ ] All form controls support `.field-help` hint text
- [ ] All form controls support `:disabled` / `[disabled]` visual state
- [ ] All form controls have visible `:focus-visible` keyboard focus ring
- [ ] All interactive form controls meet 44px minimum touch target (`min-height: 44px`)
- [ ] `forms.css` does not import or depend on Superforms — it works without it

## SEO gates

- [ ] `<title>` is set per page (not the placeholder `[Site Title]`)
- [ ] `<meta name="description">` is present and unique per page
- [ ] Canonical URL is set
- [ ] `sitemap.xml` is generated and accessible
- [ ] `robots.txt` is present

## Container / deploy gates

- [ ] `podman build` (or `docker build`) completes with no errors
- [ ] Application starts and responds at the expected port
- [ ] Environment variables are validated at startup (not silently missing)
- [ ] Secrets are never committed to the repo (check `.gitignore`, pre-commit hook)

## Template integrity gates (before publishing a new template version)

- [ ] `tokens.css` is the only file that needs to change to rebrand the template
- [ ] `reset.css`, `base.css`, `animations.css`, `utilities.css`, `forms.css` contain no project-specific values
- [ ] `AGENTS.md` and `CLAUDE.md.template` are up to date with current architecture
- [ ] `docs/planning/` reflects actual decisions, not stale planning notes
- [ ] Styleguide route (`/styleguide`) renders all documented classes without errors
- [ ] No routes, components, or assets from a previous project are present
