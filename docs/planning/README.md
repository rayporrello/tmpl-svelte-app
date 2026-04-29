# Planning Docs — Status Notice

The files in this directory are **historical context and decision records**, not active implementation guidance.

## Source of truth order

When any conflict exists, this is the authority order — top wins:

1. **Actual files under `src/`** — the implementation is the truth
2. **`AGENTS.md`** — agent operating rules
3. **`CLAUDE.md.template`** — per-project AI context template
4. **`docs/design-system/`** — real design system documentation
5. **Accepted ADRs in `docs/planning/adrs/`** — architectural decisions
6. **Other planning docs and backlog notes** — historical context only

## What planning docs are for

- Explaining _why_ a decision was made (ADRs)
- Recording what was considered and rejected (scope docs)
- Tracking remaining implementation work (backlog)
- Providing context for future maintenance decisions

## What planning docs are not for

- Overriding implemented CSS architecture
- Reopening accepted decisions without an ADR update
- Resurrecting abandoned dependencies (Tailwind, SQLite, etc.)
- Describing a different file structure than the one that exists under `src/`

## If a planning doc conflicts with real files

The real files win. Update the planning doc, not the implementation.

## New implementation work

Update `docs/design-system/` and `AGENTS.md` first, then update ADRs only when an architectural decision actually changes. Do not use planning doc notes to drive implementation changes without validating against the current `src/` files.

## Files in this directory

| File                           | Purpose                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `00-vision.md`                 | What the template is and who it is for                                                                                                                 |
| `01-principles.md`             | Guiding constraints for all decisions                                                                                                                  |
| `02-scope-and-non-goals.md`    | What is always-on, what is dormant, what is out of scope                                                                                               |
| `03-stack-decisions.md`        | Stack rationale                                                                                                                                        |
| `04-content-model.md`          | Editorial content vs. runtime data model                                                                                                               |
| `07-template-repo-spec.md`     | File structure spec — the structural contract                                                                                                          |
| `08-quality-gates.md`          | Quality gate checklist                                                                                                                                 |
| `09-maintenance-loop.md`       | Ongoing maintenance process                                                                                                                            |
| `10-build-decision-ledger.md`  | Decision status ledger (Batches A1–F all ACCEPTED)                                                                                                     |
| `11-template-build-backlog.md` | Implementation backlog with v1.0.0 readiness list at the top                                                                                           |
| `12-post-v1-roadmap.md`        | Beyond-baseline topics — each gets its own thread before code lands                                                                                    |
| `maintainer-context.md`        | One-shot LLM briefing for template-maintainer threads. Drifts; verify against `src/` before trusting any specific claim.                               |
| `adrs/`                        | Architecture Decision Records — ADR-001, 002, 004, 005, 007–019. (003 and 006 were never written; superseded by ADR-014 and `AGENTS.md` respectively.) |

> Numbered files have gaps (no `05`, no `06`) — those slots were used by earlier drafts that have since been superseded by `docs/design-system/` and `AGENTS.md`. The numbers are not renumbered because cross-references in commits and ADRs would break.
