/**
 * Canonical Quadlet set for the website-only production artifact.
 * Shared Postgres, fleet worker, backups, and the platform network are owned
 * by the separate web-data-platform repo.
 *
 * Consumers:
 * - pass 05 rollback CLI imports ROLLBACK_QUADLETS.
 * - pass 06 deploy:apply imports ALL_QUADLETS.
 * - pass 09 health:live imports ALL_QUADLETS.
 *
 * Per-site variation is intentionally not supported here.
 */
export const ALL_QUADLETS = ['web.container'] as const;

export const ROLLBACK_QUADLETS = ['web.container'] as const;

export type QuadletFilename = (typeof ALL_QUADLETS)[number];
