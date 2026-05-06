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
