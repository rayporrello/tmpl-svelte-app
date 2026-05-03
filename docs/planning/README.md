# Planning Docs — Status Notice

The files in this directory are **historical context plus ADRs**. They are not
the primary implementation manual. For a current system-by-system map, see
[docs/documentation-map.md](../documentation-map.md).

## Source of Truth Order

When any conflict exists, this is the authority order — top wins:

1. **Actual files under `src/` and `scripts/`** — implementation is truth
2. **`AGENTS.md`** — agent operating rules
3. **`CLAUDE.md.template`** — per-project AI context template
4. **Permanent docs under `docs/`** — design-system, SEO, CMS, forms, database, automations, analytics, deployment, operations, privacy, observability
5. **Accepted ADRs in `docs/planning/adrs/`** — architectural decisions and rationale
6. **Other planning docs and backlog notes** — historical context only

## Keep These Decision Files

Keep accepted ADRs unless a replacement ADR supersedes them. Current ADRs are:

- `ADR-001`, `ADR-002`, `ADR-004`, `ADR-005`
- `ADR-007` through `ADR-021`

`ADR-003` and `ADR-006` were never written. Their topics were superseded by
later ADRs and agent rules.

## Permanent Docs To Trust First

| System                                         | Current docs                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| New-site setup and maintenance                 | `docs/getting-started.md`, `docs/template-maintenance.md`, `docs/template-update-strategy.md` |
| Design system, semantic HTML, images, forms UI | `docs/design-system/`                                                                         |
| SEO, routes, feeds, schema                     | `docs/seo/`                                                                                   |
| CMS and Git-backed content                     | `docs/cms/`, `docs/content/`                                                                  |
| Database and business forms                    | `docs/database/README.md`, `docs/forms/README.md`                                             |
| Runtime automation                             | `docs/automations/`                                                                           |
| Analytics and consent                          | `docs/analytics/`, `docs/modules/cookie-consent.md`                                           |
| Deployment, secrets, backups, restore          | `docs/deployment/`, `docs/operations/`, `docs/privacy/`                                       |
| Observability and runbooks                     | `docs/observability/`                                                                         |
| Optional modules                               | `docs/modules/`                                                                               |

## Planning Files By Current Use

| File                               | Current status                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `00-vision.md`                     | Keep if you want narrative context for the template's purpose.                                                             |
| `01-principles.md`                 | Keep if you want high-level decision principles.                                                                           |
| `02-scope-and-non-goals.md`        | Keep if you want the always-on vs optional-module boundary.                                                                |
| `03-stack-decisions.md`            | Keep as a concise stack rationale, but ADRs and permanent docs are more authoritative.                                     |
| `04-content-model.md`              | Keep only if useful; mostly superseded by `docs/cms/`, `docs/content/`, and `docs/database/`.                              |
| `07-template-repo-spec.md`         | Archive/delete candidate; `src/`, `README.md`, `AGENTS.md`, and `docs/documentation-map.md` are the current structure map. |
| `08-quality-gates.md`              | Archive/delete candidate; `package.json`, `docs/template-maintenance.md`, and CI are current.                              |
| `09-maintenance-loop.md`           | Archive/delete candidate; mostly superseded by current maintenance, operations, and runbook docs.                          |
| `10-build-decision-ledger.md`      | Archive/delete candidate after v1; useful only as implementation history. Accepted ADRs now hold durable decisions.        |
| `11-template-build-backlog.md`     | Keep until v1 tagging/history is no longer useful; not a live task list.                                                   |
| `12-post-v1-roadmap.md`            | Keep if you want an idea backlog for future project threads.                                                               |
| `13-bootstrap-contract-project.md` | Archive/delete candidate once ADR-021 and bootstrap docs are enough.                                                       |
| `13-bootstrap-contract-phases/`    | Delete/archive candidate; phase prompts are implementation history and should not guide new work.                          |
| `Do-this-next.md`                  | Archive/delete candidate; snapshot only.                                                                                   |
| `maintainer-context.md`            | Archive/delete candidate; one-shot LLM briefing that drifts by design.                                                     |

## Deletion Guidance

Safe first deletion/archive batch:

- `docs/planning/13-bootstrap-contract-phases/`
- `docs/planning/Do-this-next.md`
- `docs/planning/maintainer-context.md`

Likely safe second batch after v1 is tagged and no one needs the build history:

- `docs/planning/07-template-repo-spec.md`
- `docs/planning/08-quality-gates.md`
- `docs/planning/09-maintenance-loop.md`
- `docs/planning/10-build-decision-ledger.md`
- `docs/planning/13-bootstrap-contract-project.md`

Keep ADRs, and keep any planning file that still answers a useful "why" question
better than the permanent docs. When deleting, search for inbound links first:

```bash
rg 'planning/(FILENAME|DIRECTORY)' .
```

## New Implementation Work

Update the relevant permanent doc and `AGENTS.md` first. Update an ADR only when
an architectural decision changes. Do not use a planning note to drive
implementation without validating against current `src/`, `scripts/`, and
`package.json`.

> Numbered files have gaps (no `05`, no `06`) because earlier drafts were
> superseded by `docs/design-system/` and `AGENTS.md`. The numbers are not
> renumbered because old commits and ADRs may reference them.
