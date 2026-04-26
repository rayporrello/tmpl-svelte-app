# ADR-001: One Generic Template With Configurable Modules

## Status

Accepted

## Context

Early planning considered maintaining separate templates for different project types: a minimal "spark" site, a content site, a landing page template, and a more advanced app-capable site. This creates maintenance overhead — changes to shared defaults (CSS tokens, deploy config, agent rules) must be propagated to every template variant. It also creates a decision problem: future-me must pick the "right" template before knowing how big a project will grow.

## Decision

Use one reusable golden template with configurable and dormant modules instead of separate templates for different site types.

The single template covers: landing pages, content sites, product sites, founder projects, and advanced marketing sites. App-capable seams (forms, runtime data, automations, auth, admin) are present in the template but dormant by default.

## Consequences

- Maintenance is simpler: one place to keep deploy config, agent rules, CSS baseline, and content conventions up to date.
- A simple landing page project activates only what it needs — dormant modules add no runtime cost.
- An advanced project that grows into auth or runtime data does not require migrating to a different template.
- The template's scope must be kept honest: "one template" does not mean "everything on by default." Core must remain lean.

## Implementation Notes

- The template is structured around an always-on core and clearly labeled dormant modules.
- Dormant modules are activated by enabling a defined seam (uncommenting a Quadlet service, adding credentials, enabling a route guard) — not by structural refactoring.
- See ADR-002 for the definition of core vs dormant.

## Revisit Triggers

- If the always-on core grows so heavy that a simple landing page is paying meaningful overhead.
- If two project types need fundamentally incompatible defaults (e.g., a static-only export path that conflicts with runtime features).
