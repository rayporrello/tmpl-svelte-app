# Phase 6 — Sveltia Local-Editing Docs

> Plan reference: §2 (CMS local editing), §6 Phase 6.

## Goal

Document the correct local-editing path for Sveltia CMS: the **"Work with
Local Repository"** browser flow. No proxy server, no `local_backend` in
`config.yml`, no extra scripts.

## Prereqs

- Phase 0 merged. (No code dependency on prior phases — this is doc-only,
  but it sequences after Phase 5 because the bootstrap summary message
  refers to this workflow.)

## Files to modify

| Path                      | Change                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/cms/README.md`      | Replace any proxy or `local_backend` guidance with the Work-with-Local-Repository flow. Add a clearly labeled "Local development" section.                                                                                                             |
| `docs/getting-started.md` | Step 8 admin verification should mention the Work-with-Local-Repository flow as the canonical local path; the existing `local_backend: true` paragraph should be removed (it conflicts with current Sveltia docs that say `local_backend` is ignored). |
| `static/admin/index.html` | Confirm the script tag is `<script src="…sveltia-cms.js">` in `<body>` with no `type="module"` and no stylesheet link (per `CLAUDE.md.template` line 128). No change unless drift is found.                                                            |
| `static/admin/config.yml` | Confirm there is no `local_backend` key. Existing `check:cms` blocks deploys with it; this phase confirms the comment-level guidance matches.                                                                                                          |

## Behavior contract

### Local-development section in `docs/cms/README.md`

Insert a section like this (adapt wording to match the rest of the file's
voice):

```markdown
## Local development — Work with Local Repository

Sveltia CMS supports editing content directly against your local Git
working copy from a Chromium-based browser, with no proxy server and no
GitHub auth. This is the recommended local-development workflow.

1. Run the dev server: `bun run dev`
2. Open `http://127.0.0.1:5173/admin/index.html` in a Chromium-based
   browser (Chrome, Edge, Brave, Arc).
3. Click **Work with Local Repository**.
4. Select this project's root directory in the file picker.
5. Edit content in the CMS UI. Sveltia writes directly to your working
   copy. Commit changes with Git as usual.

Sveltia does not perform Git operations itself — committing, pulling, and
pushing remain your responsibility (or your IDE's).

> **Note.** Sveltia ignores `local_backend` in `config.yml`; it is not
> part of the local workflow. Do not add it. The current `check:cms`
> gate fails any deploy that re-introduces it.
```

### Step 8 update in `docs/getting-started.md`

Replace the existing `local_backend: true` bullet under "If the editor
fails to load or auth fails" with:

```markdown
- For local-only editing without GitHub auth, follow the
  Work-with-Local-Repository flow in
  [docs/cms/README.md](cms/README.md#local-development--work-with-local-repository).
  Open `/admin/index.html` in a Chromium-based browser, click
  **Work with Local Repository**, and select this project root.
```

### Production CMS auth

Keep the production guidance as-is: GitHub backend with token (quick
start) or OAuth (multi-user). Note in `docs/cms/README.md` that the
`backend.repo` placeholder must be replaced before deploy and that
`check:cms` enforces this.

## Acceptance criteria

- [ ] `docs/cms/README.md` documents the Work-with-Local-Repository flow
      as the recommended local-development path.
- [ ] No reference to `@sveltia/cms-proxy-server`,
      `netlify-cms-proxy-server`, `decap-server`, or any proxy in any doc.
- [ ] `static/admin/config.yml` does not contain `local_backend`.
- [ ] `docs/getting-started.md` Step 8 points to the new local-dev
      section instead of recommending `local_backend: true`.
- [ ] On a fresh-bootstrapped repo, `bun run dev` and opening
      `/admin/index.html` in Chrome → "Work with Local Repository" → select
      project root produces a working content editor with the four
      collections (Pages, Articles, Team, Testimonials) visible.
- [ ] `bun run check:cms` and `bun run validate` pass.

## Commit message

```
docs(cms): document Sveltia "Work with Local Repository" as local path

Sveltia's current local workflow uses the browser File System Access API
and ignores local_backend. Document that as the canonical
local-development path:

- Run bun run dev
- Open /admin/index.html in a Chromium-based browser
- Click "Work with Local Repository"
- Select the project root
- Edit; commit with Git as usual

Remove the older local_backend: true guidance from getting-started.md
Step 8. The check:cms gate already blocks deploys that re-introduce
local_backend.

Production CMS auth (GitHub token / OAuth) remains a documented launch
task.

Refs: docs/planning/13-bootstrap-contract-project.md §2, §6 Phase 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Pitfalls

- **No new scripts.** The earlier draft of this plan proposed a
  `cms:dev` script and a proxy server. Both are wrong for current
  Sveltia. Don't add them.
- **Chromium-based browser is required.** The File System Access API is
  not in stable Firefox/Safari yet. Be explicit in the docs.
- **Sveltia does not commit for the user.** Make sure the docs say so —
  someone reading them is going to expect the CMS to behave like
  Wordpress/Decap, and it doesn't.
- **`/admin/` vs `/admin/index.html`.** Some browsers handle the
  trailing-slash redirect differently for the File System Access API
  flow. Use the explicit `index.html` URL in instructions to avoid
  surprise.
