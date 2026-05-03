# Template Update Strategy

## What kind of thing is this template?

`tmpl-svelte-app` is a **clone-and-customize starting point**, not an
upstream-managed framework. When you create a new project from this template:

- You get a full copy of the repo at a point in time.
- That copy is yours to modify freely.
- There is no upstream to pull from — you own every file.

This is intentional. A framework forces every project onto a shared upgrade
treadmill; a template lets each project evolve at its own pace without
coordinating with every other site that started from the same base.

---

## How to stay current without an upstream

Template improvements happen after the template exists, not before. When the
template itself gets better (better security defaults, new SEO helpers, improved
token architecture), projects that started from an older clone do not receive
those improvements automatically.

The practical update strategy for clone-based projects:

1. **Read the template's git log occasionally.** The commit messages are
   written to be informative (`B: security baseline + env contract + init:site`).
   Skim for anything that looks relevant to your project's current needs.

2. **Cherry-pick specific improvements.** If the template adds a useful script
   or fixes a security default, copy the relevant file(s) manually into your
   project. This is a few minutes of work, not a merge conflict marathon.

3. **Keep your own CHANGELOG-style notes.** When you diverge significantly from
   the template (custom layout, different token names, additional modules),
   note it. It makes future cherry-picks easier to reason about.

4. **Do not try to maintain a live upstream relationship.** `git remote add
template https://…` and `git pull template main` will produce large,
   hard-to-resolve merge conflicts after any meaningful divergence. Avoid it.

---

## Future extraction path

Once three or more projects have been built from this template, a pattern will
emerge: certain helpers get copied into every project verbatim, and bugs fixed
in one project's copy never propagate to the others.

The appropriate response at that point is to extract the shared logic into a
versioned package:

```
@<owner>/web-template-utils
```

Candidates for extraction (once the pattern is clear):

| Candidate                                              | Why it's a good package candidate                     |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `scripts/check-seo.ts` + `scripts/check-launch.ts`     | Pure functions over config; no SvelteKit coupling     |
| `scripts/check-assets.ts`                              | Sharp-based; depends only on file system paths        |
| `src/lib/server/env.ts` (Valibot schema helpers)       | Schema-building utilities; no project-specific values |
| `src/lib/seo/` (metadata helpers, schema builders)     | Pure functions; easily tree-shaken                    |
| `src/lib/content/markdown.ts` (renderer + trust tiers) | No project-specific config; trust model is generic    |

**The bar for extraction is three real uses, not one hypothetical use.** Before
extracting:

- The API must be stable across at least two projects.
- The package must be worth the overhead of a separate release process.
- The package must not carry SvelteKit as a peer dependency unless every
  consumer is a SvelteKit project.

---

## What stays in the template (not extracted)

Some things should never become a shared package because they are
project-specific by nature:

- `site.project.json` / generated `src/lib/config/site.ts` — one set of values per project
- `src/lib/styles/tokens.css` — one brand per project
- `src/lib/seo/routes.ts` — one route registry per project
- `src/lib/server/csp.ts` — one CSP policy per project
- `static/admin/config.yml` — one CMS backend per project
- `content/` — content is always project-specific

These stay as editable files in each project's repo, not as imported config.

---

## Template versioning

The template itself does not use semantic versioning today. The commit history
is the version history. If versioned releases become useful (e.g. a CHANGELOG
that maps to git tags), add a `CHANGELOG.md` and a `git tag` workflow at that
point — do not add versioning overhead before there is a demonstrated need.
