# Pass 04 — Lock site bundle: remove bundled n8n

## Goal

Implement
[ADR-027](../adrs/ADR-027-lead-gen-bundle-excludes-n8n.md): remove
`deploy/quadlets/n8n.container`, `deploy/quadlets/n8n.volume`, and
`scripts/enable-n8n.sh` from the template; strip every reference
that treats those files as bundled site infrastructure; lock the
Quadlet set as a constants module so passes 05/06/09 read from one
place.

This pass replaces the previously-drafted "Per-site Quadlet
manifest" pass (per withdrawn
[ADR-026](../adrs/ADR-026-per-site-quadlet-manifest.md)).

## Pre-conditions

- Passes 01, 02, 03 merged.
- ADR-027 is the binding decision.
- ADR-026 is Withdrawn (record only; no implementation occurred).
- Audit confirms the n8n footprint spans 11+ source/script/config
  files plus 2 Quadlet files plus a shell script.

## Scope

The pass touches a moderate number of files but each change is
small. The work is mechanical: delete bundled-n8n files, remove
references, replace any "all Quadlets" list with the new constants
module.

### Files removed (delete entirely)

- `deploy/quadlets/n8n.container`
- `deploy/quadlets/n8n.volume`
- `scripts/enable-n8n.sh`

### New file

`scripts/lib/quadlets.ts`:

```ts
/**
 * Canonical Quadlet set for the lead-gen website appliance per
 * ADR-024 and ADR-027. Filenames are relative to deploy/quadlets/.
 *
 * Consumers:
 * - pass 05 rollback CLI imports ROLLBACK_QUADLETS.
 * - pass 06 deploy:apply imports ALL_QUADLETS.
 * - pass 09 health:live imports ALL_QUADLETS.
 *
 * Per-site variation is intentionally not supported here. If a
 * future template variant requires a different shape (e.g. adds
 * Redis or search), update this module; if per-site variation
 * appears, revisit ADR-026.
 */
export const ALL_QUADLETS = ['web.container', 'postgres.container', 'worker.container'] as const;

export const ROLLBACK_QUADLETS = ['web.container', 'worker.container'] as const;

export type QuadletFilename = (typeof ALL_QUADLETS)[number];
```

### Files modified

`package.json`:

- Remove the `n8n:enable` script entry. If it currently sits
  between two related scripts, preserve the surrounding ordering.

`scripts/lib/protected-files.ts`:

- Remove `'deploy/quadlets/n8n.container'` and
  `'deploy/quadlets/n8n.volume'` from `PROTECTED_FILES`.
- Remove the same entries from `INIT_SITE_OWNED_FILES`.

`scripts/lib/site-project.ts`:

- Delete the `rewriteN8nQuadlet` function and the
  `rewriteN8nVolume` function.
- Delete their entries from the rewriter dispatch object (the map
  near line 643–644 that wires file paths to rewriter functions).
- Remove the regex sweep that targets `n8n.example.com` /
  `Description=n8n —` style strings (lines around 410, 604–617).
  Those rewrites were only meaningful when the n8n Quadlets were
  part of the template; with the files gone, the rewrites have no
  target.
- Run any test that exercises this module to confirm no remaining
  n8n-specific code path is left dangling.

`scripts/check-init-site.ts`:

- Remove the n8n entries from the file-list constant (lines around
  54–55).
- Remove the `'deploy/quadlets/n8n.container'` and
  `'deploy/quadlets/n8n.volume'` keys from the
  expected-content map (lines around 125–131).

`scripts/check-bootstrap.ts`:

- Remove the n8n entries from whatever expected-files list lives
  there (lines around 84–85).

`.github/workflows/ci.yml`:

- Update the alternation block on lines 219–220 that special-cases
  the n8n Quadlets. Confirm what the alternation feeds (likely a
  "files allowed to differ in clones" or "files protected from
  init-site sweep" exclusion). Drop the n8n Quadlet entries from
  it. If the alternation has no remaining entries after the drop,
  remove the surrounding clause cleanly.

`src/lib/server/env.ts`:

- Around lines 53–54: rewrite the comment block. The comment
  currently describes a "per-client n8n bundle (optional, off by
  default). Only consumed by the n8n.container Quadlet and the
  enable-n8n helper." Replace with a comment that says the n8n env
  vars now configure connection to an **external** n8n endpoint
  (n8n.cloud or self-hosted on a separate host).
- **Do NOT remove** `v.literal('n8n')` from the
  `AUTOMATION_PROVIDER` schema (line 35). `n8n` remains a valid
  provider name; it just points at external endpoints now.
- **Do NOT remove** the `N8N_*` env-var schema entries themselves.
  They configure the runtime provider when
  `AUTOMATION_PROVIDER=n8n`.

`docs/deployment/runbook.md`:

- Remove any section that walks the operator through enabling a
  bundled n8n. Replace with a one-paragraph note: "If a client uses
  n8n, provision n8n separately (n8n.cloud subscription, or its
  own Quadlet bundle on a separate host) and set
  `AUTOMATION_PROVIDER=n8n` with `N8N_WEBHOOK_URL` /
  `N8N_WEBHOOK_SECRET` pointing at that endpoint."

`docs/deployment/README.md`:

- Confirm the site bundle is the three baseline Quadlets. Drop any
  reference to `n8n.container` as an in-bundle component.

`docs/automations/README.md`:

- Replace any "enable n8n locally" content with the three real
  cases:
  - **No automation:** `AUTOMATION_PROVIDER=noop`. Outbox + worker
    log; no delivery.
  - **External non-n8n platform:** `AUTOMATION_PROVIDER=webhook`
    with URL + secret. Covers Zapier, Make, custom backends.
  - **External n8n (shared self-hosted or n8n.cloud):**
    `AUTOMATION_PROVIDER=n8n` with the same URL + secret pattern,
    using the n8n-specific body shape.
- Cross-link ADR-024 and ADR-027.

`docs/getting-started.md`:

- Add a one-paragraph note: "Automation is external. This template
  builds the website. If a client uses n8n, Zapier, Make, or any
  other automation platform, set the relevant
  `AUTOMATION_PROVIDER` env var and webhook URL/secret."
- Remove any walk-through of `bun run n8n:enable` (the script is
  gone).

`docs/automations/security-and-secrets.md` (touched in pass 01):

- Drop any mention of provisioning n8n inside the site's Postgres
  or copying n8n Quadlets into systemd. Confirm the document
  describes only env-var-level secret management, which is still
  valid.

`docs/observability/n8n-workflows.md` (touched in pass 01):

- Either delete the file (if it documents a bundled-n8n setup that
  no longer exists) or rewrite it to describe observing an
  external n8n. The default should be deletion unless the content
  is genuinely useful for external n8n; in that case rewrite the
  framing.

`docs/documentation-map.md`:

- Add the ADR-027 reference and the new
  `scripts/lib/quadlets.ts` module reference. Remove or update any
  pointer to deleted artifacts.

`README.md`:

- Update the "Reliability surface" table from pass 01. The
  "Optional n8n automation" row becomes "External automation
  provider" with status: "Implemented; `AUTOMATION_PROVIDER=n8n`
  or `webhook`; n8n is external per ADR-027 — not bundled."

`site.project.json`:

- Confirm no n8n-specific fields exist. The `deployment` block has
  `unitName` and `containerImage`; do **not** add the
  `quadlets` / `rollbackQuadlets` fields from the withdrawn
  ADR-026.

`.env.example` and `deploy/env.example`:

- Re-anchor the n8n vars under a comment that says they configure
  an **external** n8n endpoint. Keep the variable names; just
  update the surrounding comment so operators don't read "n8n
  locally" any more. Pass 01 already touched these; this is a
  light update.

`secrets.example.yaml`:

- Same: ensure the n8n keys are commented as external-endpoint
  config, not bundled-service config.

### Tests

`tests/unit/quadlets.test.ts` (new):

- `ALL_QUADLETS` length is 3 and contents match the expected
  baseline (snapshot or explicit assertion).
- `ROLLBACK_QUADLETS` is a strict subset of `ALL_QUADLETS`.
- Each entry resolves to a real file under `deploy/quadlets/` (this
  doubles as the "no Quadlet went missing" check).

Existing tests:

- `tests/unit/init-site.*.test.ts` (or similar) — drop any
  fixture/expectation that references the n8n Quadlets.
- `tests/unit/check-bootstrap.*.test.ts` — same.
- `tests/unit/site-project.*.test.ts` — drop fixtures and
  assertions tied to n8n rewriters; if a rewriter test file
  becomes empty, delete it.
- `tests/unit/launch-blockers.test.ts`, `tests/unit/deploy-preflight.test.ts`,
  `tests/unit/automation-providers.test.ts` (from pass 01) —
  confirm they still pass; `AUTOMATION_PROVIDER=n8n` cases stay
  valid for external n8n with URL+secret.
- Doctor fixtures (`tests/fixtures/doctor/...`) — drop any n8n
  Quadlet expectations.
- `tests/fixtures/ready-to-launch/production.env` — the env
  currently sets `AUTOMATION_PROVIDER=n8n` with
  `N8N_WEBHOOK_URL=https://n8n.ready.example/webhook/lead`; that
  is an external URL and stays valid.

### Validation

- `bun run format:check`
- `bun run check`
- `bun run test`
- `bun run doctor` — should pass without any n8n-related check
  (template-placeholder failures from pass 02 may still appear;
  confirm none reference n8n.container).
- `bun run check:launch` — should not reference n8n Quadlets.
- `find deploy/quadlets/ -name 'n8n.*'` — must return nothing.
- `grep -r 'n8n\.container\|n8n\.volume\|enable-n8n' --include='*.ts' --include='*.sh' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.md' . | grep -vE '(node_modules|\.svelte-kit|build/|test-results/|CHANGELOG|docs/planning/(adrs/ADR-026|passes/04-quadlet-manifest))'`
  must return nothing in active source. CHANGELOG, ADR-026
  (withdrawn), and the obsolete `04-quadlet-manifest.md` (if it
  still exists) are acceptable historical references.

## Out of scope

Each item is binding.

- **A per-site manifest of any kind.** ADR-026 is withdrawn. If a
  real second variation case appears in the future, that's when to
  reconsider.
- **Provisioning instructions for external n8n.** Operator/ops-level
  concern. The template links out to vendor docs at most.
- **New automation provider implementations** (e.g.
  `MakeProvider`, `SalesforceProvider`). The webhook provider
  already covers any HTTPS+secret target. Pass 01's
  `AutomationProvider` interface makes adding new shapes easy when
  a real client requires one.
- **Removing the `'n8n'` provider option.** Stays as a valid
  runtime selection for clients pointing at external n8n.
- **Retrofitting `scripts/deploy-preflight.ts` or
  `scripts/deploy-smoke.ts` to OpsResult.** Per pass 02 deferral;
  those land alongside pass 06.

## Deliverable

Return:

- Summary of changed files (paths only).
- Exact commands run and pass/fail status.
- Output of the `find` and `grep` commands above (proof of clean
  removal).
- Public API of `scripts/lib/quadlets.ts` (constants and types).
- Any reference site that broke (`.github/workflows/ci.yml`'s
  alternation block is the most likely surprise — describe what
  the block did before and after).
- Confirmation that `AUTOMATION_PROVIDER=n8n` still validates
  cleanly when paired with a non-bundled URL.
- Recommendation: "Pass 05 (Rollback CLI) is the next slice. It
  imports `ROLLBACK_QUADLETS` from `scripts/lib/quadlets.ts`."

## Codex prompt

You are implementing pass 04 of the `tmpl-svelte-app` reliability
roadmap. The binding decision is
[ADR-027](../adrs/ADR-027-lead-gen-bundle-excludes-n8n.md). The
full scope and file list are above in this document. The pass is
mechanical (delete + reference cleanup + small new module) but
spans many files; do not skip any callsite.

Read these first, in order, before writing any code:

1. This file (`docs/planning/passes/04-bundle-scope.md`)
2. `docs/planning/adrs/ADR-027-lead-gen-bundle-excludes-n8n.md`
3. `docs/planning/adrs/ADR-026-per-site-quadlet-manifest.md`
   (withdrawn — read for context only; do not implement its
   manifest)
4. `docs/planning/adrs/ADR-024-lead-gen-website-appliance.md`
5. `scripts/enable-n8n.sh` (to confirm what's being deleted)
6. `scripts/lib/protected-files.ts`
7. `scripts/lib/site-project.ts` (find rewriter functions and
   their dispatch)
8. `scripts/check-init-site.ts`
9. `scripts/check-bootstrap.ts`
10. `src/lib/server/env.ts` (do NOT remove the `'n8n'` provider
    literal; only update the comment about bundled n8n)
11. `.github/workflows/ci.yml` (lines around 219–220)
12. `package.json` (the `n8n:enable` script entry)
13. `deploy/quadlets/` directory listing (confirm n8n files exist
    before deleting)

Then implement the **Scope** section above and **only** that. The
**Out of scope** section is binding — do not add a manifest, do
not remove the `'n8n'` runtime provider option, do not write
external-n8n provisioning docs.

If the `.github/workflows/ci.yml` block is doing something that
isn't obvious from the surrounding context, describe what it does
in the deliverable rather than guessing. Keep CI green.

When done, run the validation commands and return the deliverable
in the exact shape requested.

## Note on prior pass-04 draft

A previous draft of pass 04 lived at
`docs/planning/passes/04-quadlet-manifest.md` and proposed a
per-site manifest under withdrawn ADR-026. That file should be
removed as part of this pass (or left for the next routine doc
sweep — operator's choice).
