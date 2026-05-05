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

## 2026-05-05 — Pass 2 (n8n-first reliability)

### Security / reliability

- **Production preflight rejects silently-misconfigured automation.**
  `bun run deploy:preflight` and `bun run check:launch` now both fail when
  `AUTOMATION_PROVIDER` is `n8n` or `webhook` without a URL+secret, or when
  it is `console` (which is dev-only). The new gates surface as
  `PREFLIGHT-AUTOMATION-001` and `LAUNCH-AUTOMATION-001`. Set
  `AUTOMATION_PROVIDER=noop` explicitly when a site has no automation needs.
- **Header auth is the new default for n8n delivery.** The site sends
  `X-Site-Auth: <secret>` by default, matching n8n's built-in Header Auth
  credential — no Code node required on the receiver. HMAC body signing
  remains supported as a stronger opt-in via `N8N_WEBHOOK_AUTH_MODE=hmac`.
  This is a **default change**: workflows that were verifying
  `X-Webhook-Signature` need either to switch to Header Auth or to set
  `N8N_WEBHOOK_AUTH_MODE=hmac` to keep the old behavior.
- **Observability headers added to every webhook request.**
  `X-Site-Event-Id`, `X-Site-Event-Type`, `X-Site-Timestamp` are now sent
  alongside the JSON body so receivers can deduplicate and correlate
  without parsing the envelope.

### Tooling

- **Worker logs a single loud warning when its provider is misconfigured.**
  `warnIfAutomationConfigIncomplete()` runs at worker startup; an operator
  who sees `[automation:worker] provider="n8n" is misconfigured` in
  journald has actionable output instead of silent skipped events.

### Env contract

- New: `N8N_WEBHOOK_AUTH_MODE`, `N8N_WEBHOOK_AUTH_HEADER`,
  `AUTOMATION_WEBHOOK_AUTH_MODE`, `AUTOMATION_WEBHOOK_AUTH_HEADER` (all
  optional). Defaults: `header` mode with `X-Site-Auth` header name.
  `.env.example` and `secrets.example.yaml` updated.

### Docs

- New: `docs/automations/n8n-workflow-contract.md` — the wire-level
  contract: payload, headers, auth modes, idempotency, replay,
  dead-letter handling, what to do when n8n is down.
- `docs/automations/README.md` rewritten for n8n-first framing. Webhook
  remains an escape hatch but is no longer presented as equally preferred.
- `docs/automations/security-and-secrets.md` covers both auth modes and
  the new env contract; production checklist is stricter.
- `docs/observability/n8n-workflows.md` updated to reference the contract
  doc and to call out per-client n8n isolation.

---

## 2026-05-05 — Pass 1 (safety baseline)

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
