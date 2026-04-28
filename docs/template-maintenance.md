# Template Maintenance

Reference for anyone maintaining or evolving `tmpl-svelte-app`. Covers the Bun-first workflow, Git hygiene, generated artifact policy, and validation commands. See [ADR-012](planning/adrs/ADR-012-bun-first-dependency-and-build-artifact-policy.md) for the rationale behind these decisions.

---

## Bun-first workflow

This repo uses **Bun** for everything: package management, script execution, and the development server. Never substitute npm, npx, pnpm, or yarn.

### Common commands

```bash
bun install                      # install from bun.lock (add --frozen-lockfile in CI)
bun add <pkg>                    # add a dependency
bun add -d <pkg>                 # add a devDependency
bun run dev                      # start development server
bun run build                    # production build (image optimizer runs first via prebuild hook)
bun run preview                  # preview the production build
bun run check                    # TypeScript type-check via svelte-check
bun run lint                     # ESLint (flat config)
bun run format                   # Prettier
bun run images:optimize          # run the image prebuild pipeline manually (idempotent)
bun run test                     # Vitest unit tests
bun run test:e2e                 # Playwright + axe e2e smoke tests (builds first; runs against bun ./build/index.js)
bun run check:seo                # validate SEO config and route registry
bun run check:cms                # validate static/admin/config.yml (Sveltia)
bun run check:content            # validate Markdown / YAML files under content/
bun run check:content-diff       # detect destructive content changes (release-grade)
bun run check:assets             # verify favicon / og-default / manifest defaults exist
bun run check:launch             # verify production env (ORIGIN/PUBLIC_SITE_URL look like real HTTPS)
bun run init:site                # interactive/stdin site initializer (rewrites 10 files)
bun run secrets:render           # decrypt secrets.yaml → .env (requires SOPS + age)
bun run secrets:check            # verify no plaintext secrets are tracked
bun run validate                 # PR-grade: check → seo → cms → content → assets → images → build → unit → e2e
bun run validate:launch          # release-grade: validate + check:launch + check:content-diff
```

### init:site prompt order

`bun run init:site` prompts in this order:

1. Package name (`package.json` `"name"`)
2. Site name (shown in titles and OG tags)
3. Production URL (HTTPS, no trailing slash)
4. Default meta description (≤155 chars)
5. GitHub owner (username or org)
6. GitHub repository name
7. Support contact email (shown on error pages)
8. Project slug (used for container/Quadlet names)
9. Production domain (for Caddyfile)
10. PWA short name (≤12 chars, for `site.webmanifest`)

For deterministic non-interactive runs, feed the same answers through stdin:

```ts
const answers = `my-cool-site
Acme Studio
https://acme-studio.dev
Portrait and brand photography for independent makers.
acme-org
my-cool-site
hello@acme-studio.dev
my-cool-site
acme-studio.dev
Acme
`;

const proc = Bun.spawn(['bun', 'run', 'init:site'], {
	stdin: 'pipe',
	stdout: 'inherit',
	stderr: 'inherit',
});

proc.stdin.write(answers);
proc.stdin.end();
process.exit(await proc.exited);
```

`init:site` is idempotent: running it twice with the same answers produces no
file changes. It does not update `src/app.html`. `validate:launch` still fails
after init until `static/og-default.png` is replaced with a real 1200×630 OG
image; that is intentional because the default OG image is a manual launch
asset.

### Updating dependencies

- **Never** run `bun update` or `bun upgrade` on protected packages without explicit approval:
  - `svelte`, `@sveltejs/kit`, `@sveltejs/adapter-*`, `svelte-adapter-bun`, `better-auth`, `esm-env`, `vite`
- After any dependency change, diff `bun.lock` and review changes before committing.
- Bun uses `"resolutions"` (Yarn syntax) in `package.json` for version pins — not `"overrides"` (npm; silently ignored by Bun).

---

## Git hygiene

### What to commit

| Path                                                  | Commit?               | Notes                                            |
| ----------------------------------------------------- | --------------------- | ------------------------------------------------ |
| `src/`                                                | **Yes**               | All source files                                 |
| `static/`                                             | **Yes, with caveats** | See image artifact policy below                  |
| `docs/`                                               | **Yes**               | All documentation                                |
| `scripts/`                                            | **Yes**               | Build scripts                                    |
| `bun.lock`                                            | **Yes**               | Text lockfile — tracks exact dependency versions |
| `package.json`                                        | **Yes**               |                                                  |
| `svelte.config.js`, `vite.config.ts`, `tsconfig.json` | **Yes**               |                                                  |
| `.gitignore`                                          | **Yes**               |                                                  |
| `AGENTS.md`, `CLAUDE.md.template`                     | **Yes**               |                                                  |
| `.env.example`                                        | **Yes**               | Safe defaults only — no real secrets             |

### What never to commit

| Path                     | Reason                                          |
| ------------------------ | ----------------------------------------------- |
| `node_modules/`          | Installed from `bun.lock` on every machine      |
| `.svelte-kit/`           | Generated by SvelteKit on dev/sync — not source |
| `build/`                 | Production output — regenerated every deploy    |
| `dist/`                  | Alternative output — same policy                |
| `.env`, `.env.*`         | May contain real secrets                        |
| `bun.lockb`              | Binary lockfile, legacy format — not used here  |
| Anything in `~/secrets/` | Never. This applies to all repos on this host.  |

### Image artifact policy

The template uses a two-tier image system. See [docs/design-system/images.md](design-system/images.md) and [ADR-009](planning/adrs/ADR-009-image-pipeline.md).

**Tier 1 — `src/lib/assets/`:** Always commit. These are developer-owned source files that Vite processes at build time.

**Tier 2 — `static/uploads/`:** Commit source images (`*.jpg`, `*.png`, `*.tiff`) AND their generated `.webp` siblings when they are intentional demo or seed assets. Rationale: committing both allows the site to function without a prebuild step on every checkout. The prebuild script is idempotent — it skips `.webp` files that are already newer than their source.

Do not gitignore `*.webp` files inside `static/uploads/`.

If a future project separates CMS uploads from the repo (e.g. all uploads stay in cloud storage), the `.gitignore` includes commented-out entries for common generated output directories (`static/uploads/optimized/`, etc.) — uncomment those as needed.

---

## Validation before shipping a template change

The template has a two-tier validation lifecycle (see [ADR-018](planning/adrs/ADR-018-production-runtime-and-deployment-contract.md)):

```bash
bun run validate          # PR-grade — runs on every push and pull request
bun run validate:launch   # release-grade — run before tagging or shipping a release
```

Then confirm no generated artifacts leaked into the tracked file set:

```bash
git status --short
git ls-files node_modules .svelte-kit build
```

Both git commands should produce empty output.

### What each pipeline runs

`bun run validate` (in order):

| Step                      | What it validates                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `bun run check`           | TypeScript types; Svelte component types; `svelte-check`                               |
| `bun run check:seo`       | SEO source structure and route registry are valid; placeholder values warn only        |
| `bun run check:cms`       | `static/admin/config.yml` schema is valid (no broken collection or field config)       |
| `bun run check:content`   | content/ files parse and pass field validation; no blank required fields, no bad dates |
| `bun run check:assets`    | Default static assets (favicon, og-default, manifest) exist and are non-empty          |
| `bun run images:optimize` | Image pipeline runs, exits 0 on empty uploads                                          |
| `bun run build`           | Vite build succeeds; adapter output is valid                                           |
| `bun run test`            | Vitest unit tests (env validation, SEO metadata, articles loader)                      |
| `bun run test:e2e`        | Playwright smoke + `@axe-core/playwright` zero-violation gate                          |

`bun run validate:launch` adds:

| Step                         | What it validates                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `bun run check:launch`       | `ORIGIN` and `PUBLIC_SITE_URL` look like a real HTTPS production URL (not placeholder, not `localhost`) |
| `bun run check:content-diff` | No destructive content rewrites are about to ship (compares git diff against `content/`)                |

CI runs `validate` on every push and `validate:launch` on tags. See [.github/workflows/ci.yml](../.github/workflows/ci.yml).

---

## Adapter: svelte-adapter-bun

This template uses `svelte-adapter-bun`. Output goes to `build/` and is served with `bun ./build/index.js`. This is the right choice for:

- Podman/container deployments
- Bun-native servers
- SSR sites with server-side logic

If a future project needs a fully static output (no server), swap to `@sveltejs/adapter-static` and enable prerender in `svelte.config.js`. That change requires an ADR update and a test of the full build pipeline.

---

## Extending the template

When adding new capabilities to the base template:

1. **Implement in `src/`** — implementation is truth.
2. **Write or update the relevant doc** in `docs/design-system/`, `docs/seo/`, `docs/cms/`, or `docs/automations/`.
3. **Update `AGENTS.md`** — add or update the relevant section so agents know the new rule.
4. **Write an ADR** if the decision involves a third-party tool, a non-obvious tradeoff, or overrides a previous decision.
5. **Run `bun run validate`** and confirm it exits 0.
6. **Verify `git ls-files node_modules .svelte-kit build`** returns nothing.

Never add Tailwind, shadcn, React, Prisma, SQLite, or a pre-built component library to the base template.

---

## Adding or changing CMS collections

When adding a new CMS collection (e.g., jobs, services, events):

1. Create a starter content file in the new `content/{collection}/` directory
2. Add the collection to `static/admin/config.yml`
3. Add the TypeScript interface to `src/lib/content/types.ts`
4. Add a loader function to `src/lib/content/` and export it from `index.ts`
5. Wire the loader to a `+page.server.ts` route
6. Register the route in `src/lib/seo/routes.ts`
7. Document the collection in `docs/cms/collection-patterns.md` — include the automation-safe write policy
8. Run `bun run check` and `bun run build` to confirm no TypeScript errors

When renaming a CMS field:

- Update `static/admin/config.yml` (field definition)
- Update all existing content files in `content/` that use the field
- Update `src/lib/content/types.ts` (interface property)
- Update any component that reads the field
- Update `docs/cms/sveltia-content-contract.md` if the naming convention changes

---

## Reviewing automation workflows before enabling on a new site

Before enabling an n8n content automation on a new site:

1. Test the workflow on a branch (not `main`) — verify the generated file matches the CMS schema
2. Run `bun run build` with the generated file present — build must exit 0
3. Confirm AI-generated content uses `draft: true` or `published: false`
4. Confirm the GitHub token used by n8n has minimum required permissions (`Contents: write` only)
5. Confirm `N8N_WEBHOOK_SECRET` is set and the webhook signature is verified in n8n
6. Document the workflow in the project's CLAUDE.md under "Project-specific rules"

Before enabling a runtime webhook automation (Phase 5):

1. Confirm the server action does not `await` the webhook call
2. Test with `N8N_WEBHOOK_URL` unset — form submission must still succeed
3. Test with n8n returning a 500 — form submission must still succeed
4. Confirm the webhook call uses HMAC signing with `N8N_WEBHOOK_SECRET`
