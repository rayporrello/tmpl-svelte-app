# ADR-022 — PITR Backup Strategy (WAL-G + Cloudflare R2)

**Status:** Accepted
**Date:** 2026-05-05
**Batch:** Pass 3

---

## Context

The bundled Postgres path needed a real disaster-recovery story. The
prior backup posture was nightly `pg_dump` + `tar` of `static/uploads/`
pushed to an `rclone` remote — fine for "I want a copy of the database
yesterday" but inadequate for:

- Recovering from an accidental `DELETE` 5 minutes ago.
- Bounded data loss when the host disk fails.
- Atomic restore across the per-client Postgres cluster (which now
  hosts both `<project>_app` and `<project>_n8n` databases when the
  client activates n8n — see ADR-022's companion architecture doc at
  `docs/operations/architecture.md`).
- Proof that backups are real, not just bytes in a bucket.

The template's positioning ("personal lead-gen website superpower")
needed a backup posture that is honest about what would actually happen
during an incident, not a checkbox-grade story.

---

## Decision

**WAL-G v3.0.8 baked into the bundled Postgres image, streaming WAL +
nightly base backups to Cloudflare R2 with 14-day PITR retention.**

### Image and binary

- `deploy/Containerfile.postgres` builds on `postgres:18-bookworm` (not
  alpine — WAL-G ships glibc binaries that need a glibc base).
- WAL-G binary downloaded from the official GitHub release at v3.0.8,
  pinned by SHA-256 for both amd64 and aarch64. Bumping is a deliberate
  change tracked in CHANGELOG.md.
- The image is built and pushed by CI alongside the web image, scanned
  by Trivy CRITICAL (blocking), and `wal-g --version` smoked before push.

### Postgres configuration

The Quadlet at `deploy/quadlets/postgres.container` runs Postgres with
these `-c` flags so the operator can change them without rebuilding the
image:

```
archive_mode=on
wal_level=replica
archive_timeout=60
archive_command='/usr/local/bin/wal-g wal-push %p'
restore_command='/usr/local/bin/wal-g wal-fetch %f %p'
```

`archive_timeout=60` caps the worst-case data-loss window at one minute.
On a busy site, the 16 MB WAL fill threshold fires more often than the
timeout — the timeout is the floor for quiet sites that would otherwise
go hours between archive pushes.

### Object storage

Cloudflare R2 is the canonical default. The user-facing env contract
uses `R2_*` names; the postgres Quadlet maps them internally to the
`AWS_*` and `WALG_*` names WAL-G actually reads:

```
R2_ACCESS_KEY_ID    → AWS_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY → AWS_SECRET_ACCESS_KEY
R2_ENDPOINT          → AWS_ENDPOINT
R2_BUCKET + R2_PREFIX → WALG_S3_PREFIX (= s3://<bucket>/<prefix>)
```

Region is hardcoded to `auto` (R2's S3 compatibility mode). Compression
is `zstd`. `WALG_PREVENT_WAL_OVERWRITE=true` is set as belt-and-braces.

R2 is for backups by default, not runtime media — see ADR-022's role
clarification in `docs/operations/architecture.md`.

### Schedule

| When               | What                                                             | Unit                           |
| ------------------ | ---------------------------------------------------------------- | ------------------------------ |
| Continuous         | WAL push every 60s or 16 MB fill                                 | postgres `archive_command`     |
| Daily 03:15 UTC    | Base backup (`wal-g backup-push /var/lib/postgresql/data`)       | `<project>-backup-base.timer`  |
| Every 6 h          | PITR freshness check (latest base ≤ 2 days, latest WAL ≤ 10 min) | `<project>-backup-check.timer` |
| Quarterly (manual) | Non-destructive restore drill                                    | `bun run backup:restore:drill` |

### Retention

`PITR_RETENTION_DAYS=14` (env-tunable). Matches n8n's default
execution-data prune horizon (`EXECUTIONS_DATA_MAX_AGE=336` hours), so
the PITR window covers the full n8n operational history when n8n is
active for a client.

### Restore drill

`backup-restore-drill.ts` is a TypeScript script the operator runs
manually (or from a quarterly cron). It:

1. Spins up a temp Postgres container off the same image.
2. Restores the latest base backup from R2 into a scratch volume.
3. Replays WAL up to "now − 1 hour".
4. Runs a read-only sanity SELECT against `contact_submissions`.
5. Tears the container + volume down.

It is **not** wired to a systemd timer. An automated drill that fails
silently is worse than no drill — the load-bearing piece is operator
visibility. Run it the first time after activating PITR for any new
client, then quarterly.

---

## Why WAL-G (not pgBackRest)

| Criterion                     | WAL-G v3                                           | pgBackRest                                     |
| ----------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| S3-compatible (R2) target     | First-class                                        | First-class                                    |
| New PG release latency        | Generally tracks within weeks of GA                | Comparable                                     |
| Single-host deploy complexity | Lower — one binary baked into the PG image         | Heavier — separate config repo, stanza concept |
| Container-friendly            | Drops in as `archive_command`                      | Possible but adds operational surface          |
| Encryption at rest            | Optional GPG (we leave to R2's at-rest encryption) | Optional                                       |
| Multi-host, replication       | Less polished                                      | Strong                                         |
| Solo-operator ergonomics      | Better fit                                         | More machinery than this template needs        |

For a per-client lead-gen site running rootless Podman with one
Postgres container per client, WAL-G is the right level of machinery.
pgBackRest is the right tool for fleet-scale multi-host Postgres with
streaming replicas and complex retention policies — not what this
template targets. A future project that outgrows the bundled path can
swap in pgBackRest deliberately, with its own ADR.

---

## Why R2 (not S3 / B2 / managed Postgres backups)

- **R2 is the operator's existing primary cloud.** All client sites
  already use R2 for image storage when they need it. One vendor, one
  bill, one auth flow.
- **No egress fees.** Restores are free. PITR restores can be heavy
  (base + WAL chain); R2's zero-egress model removes the
  restore-cost-anxiety that AWS S3 imposes.
- **S3-compatible API.** Anything that speaks S3 (WAL-G, rclone,
  s3cmd, Postman) works against R2 unchanged.
- **Managed Postgres providers** (Supabase, Neon, RDS) handle their
  own backups. The template detects this case via `DATABASE_URL`
  hostname — when it does not point at `<project>-postgres`, the PITR
  preflight check skips cleanly with a "managed provider handles its
  own backups" pass.

---

## Consequences

### Positive

- Worst-case RPO is ~60 seconds on a healthy site.
- Restore can target any second within the last 14 days.
- The same backup covers `<project>_app` and `<project>_n8n` atomically.
- The operator can prove PITR works without touching production via the
  drill script.
- WAL-G is the only new binary in the chain; one supply-chain pin to
  maintain.

### Accepted tradeoffs

- The Postgres image is now custom (not stock postgres:18). CI builds
  it on every push to main; per-client GHCR storage cost is small.
- bookworm vs alpine costs ~50 MB. Worth it for glibc compatibility.
- `archive_timeout=60` produces ~1440 archive pushes per day per site.
  R2 PUT cost is ~$0.003/site/month — negligible.
- WAL-G's editor + restore syntax is operator territory, not
  framework-friendly. The runbook in `docs/operations/restore.md` is
  the load-bearing reference.
- The legacy `pg_dump` path remains supported as a convenience export.
  Two backup paths is more docs to maintain, but `pg_dump` is genuinely
  useful for handing a client a single-file copy.

### Risks watched

- **WAL-G binary supply chain.** Mitigated by pinning version + SHA-256
  in `deploy/Containerfile.postgres`. Bumps are deliberate, tracked in
  CHANGELOG.
- **Drill drift.** The drill is manual; quarterly cadence depends on
  the operator. Operations doc explicitly calls this out, and the
  `<project>-backup-check.timer` runs every 6 hours as a continuous
  freshness signal between drills.
- **R2 API change.** R2 has been stable on the S3-compat API since
  GA. If R2 ever breaks the surface, the WAL-G env mapping is one
  drop-in change in the postgres Quadlet.

---

## Alternatives considered

### Stock postgres image + host-installed WAL-G

Rejected. `archive_command` runs from inside the container as the
postgres user. A host-installed WAL-G is invisible to that process
under rootless Podman without volume mounts and PATH gymnastics that
defeat the simplicity goal. Baking WAL-G into the image is correct.

### Logical replication to a hot standby

Rejected for the baseline. Adds a second always-on Postgres container
per client, doubles RAM cost, complicates n8n's per-client database
boundaries. Worth re-evaluating if a future client outgrows PITR (e.g.,
streaming financial data with sub-minute RPO requirements).

### Managed Postgres for everything

Rejected as a default. The template's value is "lead-gen website
superpower on a Linux box you operate" — outsourcing Postgres
contradicts that. The bundled path is the default; managed Postgres is
fully supported as an opt-out (PITR preflight detects and skips, the
operator runs whatever backup story their provider offers).

---

## Related

- `deploy/Containerfile.postgres` — image definition
- `deploy/quadlets/postgres.container` — Quadlet wiring
- `deploy/systemd/backup-base.{service,timer}` — daily base backup
- `deploy/systemd/backup-check.{service,timer}` — PITR freshness check
- `scripts/backup-base.sh`, `backup-wal-check.sh`,
  `backup-pitr-check.sh`, `backup-restore-drill.ts` — operator commands
- `docs/operations/backups.md` — full backup workflow
- `docs/operations/restore.md` — incident-time restore runbook (PITR + pg_dump)
- `docs/operations/architecture.md` — where R2 fits in the per-client bundle
- `ADR-018` — Production runtime and deployment contract (parent ADR)
- `ADR-021` — Local bootstrap contract (sibling)
