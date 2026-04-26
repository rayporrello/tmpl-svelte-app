# tmpl-svelte-app

Reusable SvelteKit website template. Targets websites, landing pages, content sites, and product marketing sites. Not a dashboard application scaffold.

## What's included

- SvelteKit / Svelte 5 skeleton with Bun tooling
- Token-driven CSS design system (native CSS, no Tailwind, no component library)
- `forms.css` visual form primitives — compatible with Superforms
- Sveltia CMS / file-based content conventions (planned)
- SEO, accessibility, and semantic HTML baseline (planned)
- Podman Quadlet + Caddy deployment templates (planned)
- Agent-readable operating rules (`AGENTS.md`, `CLAUDE.md.template`)

## Design system

This is a website-first SvelteKit template. The design system is native CSS, token-driven, and dependency-light.

| Guide | Purpose |
|-------|---------|
| [docs/design-system/README.md](docs/design-system/README.md) | Overview, file structure, how to customize |
| [docs/design-system/tokens-guide.md](docs/design-system/tokens-guide.md) | Complete token reference |
| [docs/design-system/component-css-rules.md](docs/design-system/component-css-rules.md) | CSS authoring rules for components |
| [docs/design-system/forms-guide.md](docs/design-system/forms-guide.md) | Forms: CSS layer + Superforms behavior |
| [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md) | Concise rules for AI agents (paste into CLAUDE.md) |

**Tailwind is not included.** Styling uses `tokens.css` + scoped Svelte `<style>` blocks.

**Superforms is the standard form behavior library.** Install per project when the first form with a server action is added: `bun add sveltekit-superforms valibot`. The CSS layer (`forms.css`) works without it for display-only forms.

## Using this template

1. Create a new repo from this template on GitHub
2. Copy `CLAUDE.md.template` → `CLAUDE.md`, fill in project details
3. Edit `tokens.css` with brand colors, fonts, and shape
4. Update `src/app.html`: title, `theme-color` hex, favicon path
5. Install Superforms when adding the first form: `bun add sveltekit-superforms valibot`
6. Activate dormant modules (Postgres, n8n, auth) only when needed

## Styleguide

Visit `/styleguide` in development to see all design system primitives rendered live.

## Dormant modules

Planned and documented but not active in the base template:

| Module | Activation |
|--------|-----------|
| Postgres + Drizzle | Add `DATABASE_URL`, create schema |
| n8n webhooks | Add webhook URL env var |
| Postmark | Add `POSTMARK_API_TOKEN`, implement mail helper |
| Better Auth | Follow auth module docs |

## Agent operating rules

- [AGENTS.md](AGENTS.md) — rules for AI coding agents
- [CLAUDE.md.template](CLAUDE.md.template) — template for per-project `CLAUDE.md`
- [docs/design-system/llm-css-rules.md](docs/design-system/llm-css-rules.md) — paste-ready CSS rules for AI agents

## What is deliberately not in this template

- Tailwind CSS
- shadcn or any pre-built component library
- A dashboard or app-shell layout
- `html, body { overflow: hidden }` — normal document scrolling is the default
- Disabled user zoom — website accessibility requires zoom to work
