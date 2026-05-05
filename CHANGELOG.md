# Template changelog

This changelog tracks security-, operations-, and contract-relevant changes to
the template itself. It is intentionally lightweight — entries are appended in
reverse-chronological order, grouped by date, with enough detail that a project
forked from an earlier snapshot can decide whether to cherry-pick a given
change.

This is **not** a semver release log. The template is clone-and-customize, not
upstream-managed; downstream projects pull improvements selectively rather than
running a `template update` command.

When to add an entry:

- Security default changes (HSTS, CSP, headers, secrets handling)
- Runtime contract changes (env vars, adapter, container, deploy artifacts)
- CI gate changes (Trivy thresholds, new required checks)
- Backup or recovery posture changes
- Bun, Postgres, or other pinned-tool version bumps
- Removal or deprecation of a documented capability

When to skip:

- Internal refactors with no observable contract change
- Doc rewrites that do not change behavior
- Test-only changes

---

## 2026-05-05

### Security

- **HSTS preload removed from default.** `deploy/Caddyfile.example` and
  `src/lib/server/security-headers.ts` now ship `Strict-Transport-Security`
  with `max-age=31536000` only — no `includeSubDomains`, no `preload`. Both
  stronger forms are documented opt-ins in `docs/deployment/runbook.md`. The
  HSTS preload list is a one-way browser-shipped commitment that is
  inappropriate as a template default.

### Tooling

- **Bun pinned to 1.3.13.** `packageManager` is `bun@1.3.13`; `engines.bun`
  is `>=1.3.13 <1.4.0`. The `preinstall` guard in `scripts/ensure-bun.ts`
  enforces both that the package manager is Bun and that the running Bun
  version satisfies the range. Future bumps within the 1.3.x series are
  routine; bumping to 1.4.x is a deliberate change tracked in this changelog.

### Validation

- **Added `bun run validate:fast`.** New inner-loop validation entry point
  that runs `format:check`, `check`, `project:check`, `routes:check`,
  `forms:check`, and unit tests — skipping the heavyweight build,
  performance budget, asset, security-header, and image-optimization
  checks. Use `validate:fast` while iterating; use `validate:core` before
  pushing.

### Docs

- **Removed site-tier framing.** The template no longer presents
  "small / medium / large" site tiers. The observability spine is now one
  baseline with optional extensions activated per project. The deleted
  `docs/observability/tiers.md` content has been folded into
  `docs/observability/README.md`.
- **`Containerfile.node.example` demoted to reference only.** The
  adapter-node swap recipe is no longer presented as a reliable escape
  hatch. It is documented as a starting point that will need adaptation
  if ever activated.
