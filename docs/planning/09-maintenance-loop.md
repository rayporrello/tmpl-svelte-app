# Maintenance Loop

> Historical note: this planning checklist is superseded by
> [docs/template-maintenance.md](../template-maintenance.md),
> [docs/operations/backups.md](../operations/backups.md), and
> [docs/observability/runbook.md](../observability/runbook.md).

Recurring operational checks for sites built from this template. Adapt frequency and scope to the site tier.

---

## Weekly checks (all tiers)

- [ ] Review uptime monitor status — confirm no alerts were silently dismissed
- [ ] Review app/server error logs — scan for new error patterns or unexpected spikes
- [ ] Review Caddy access logs — look for unusual traffic patterns or repeated 4xx/5xx
- [ ] Confirm `/healthz` is responding correctly from outside the server

---

## After any content-heavy editing session (CMS or direct)

- [ ] Run `bun run check:content-diff` before committing — catch destructive rewrites
- [ ] Run `bun run check:content` to validate all content files
- [ ] Review the git diff for content changes — do not commit without understanding the diff
- [ ] Confirm no required frontmatter fields were blanked

---

## Before every deploy

- [ ] Run `bun run validate` (includes `check`, `build`, `check:seo`, `check:cms`, `check:content`)
- [ ] Review `bun run check:content-diff` for any content changes in the branch
- [ ] Verify no secrets or `.env` files are staged
- [ ] Confirm the `/healthz` endpoint responds correctly after deploy

---

## Monthly checks (Tier 1)

- [ ] Review SSL certificate expiry — Caddy auto-renews, but verify no renewal failures in logs
- [ ] Review dependency updates — check for security advisories on direct dependencies
- [ ] Review `bun run check:seo` output — confirm no new placeholder values crept in
- [ ] Update `docs/template-maintenance.md` if the toolchain changed

---

## Monthly checks (Tier 2 additions)

- [ ] Review Sentry issue queue — resolve or triage new error clusters
- [ ] Test form-to-email pipeline end-to-end — submit a test lead and verify delivery
- [ ] Review n8n Error Workflow history — check for silently caught failures
- [ ] Review workflow heartbeat logs — confirm scheduled workflows are running
- [ ] Verify backup — restore the most recent backup to a temporary database and confirm integrity
- [ ] Review Postgres connection and query health — look for slow queries or connection pool exhaustion

---

## Monthly checks (Tier 3 additions)

- [ ] Review SLO compliance — check uptime, latency, and error rate against targets
- [ ] Review dead-letter table — process any undelivered webhook events
- [ ] Review alert severity history — confirm P1/P2 incidents were fully resolved
- [ ] Update incident runbooks if any procedures changed

---

## Quarterly checks (all tiers)

- [ ] Rotate secrets that have long-running TTLs (webhook signing secrets, API keys)
- [ ] Review the full dependency tree — remove unused packages
- [ ] Audit `static/admin/config.yml` — confirm all collections and fields still match `types.ts`
- [ ] Review CMS content model for drift — field names, required/optional, format settings
- [ ] Run a full content validation: `bun run check:content`
- [ ] Verify agent rules in `AGENTS.md` and `CLAUDE.md` are up to date with current architecture

---

## After a deployment incident

- [ ] Write or update the runbook entry for the failure mode that occurred
- [ ] If Tier 3: complete a post-incident review using the template in `docs/observability/runbook.md`
- [ ] Verify the failure will be caught earlier next time — add a check or alert if not
- [ ] Confirm no data was silently lost during the incident

---

## n8n-enabled sites (ongoing)

- [ ] Review failed workflow executions weekly
- [ ] Review the n8n Error Workflow history — confirm catch-all is working
- [ ] Confirm heartbeat workflows are firing on schedule
- [ ] Review webhook payload logs for schema drift — payload shapes evolve as the site grows
- [ ] Keep n8n patched — subscribe to release notes for security advisories
