# Connect A Website Clone To web-data-platform

Use this runbook when turning a fresh website clone into a client of the shared
`web-data-platform` database cluster.

## 1. Initialize The Website

From the website repo:

```bash
bun install --frozen-lockfile
./bootstrap
bun run init:site
bun run project:check
```

Confirm `site.project.json` has the final `project.projectSlug`,
`site.productionUrl`, `site.productionDomain`, and
`deployment.loopbackPort`. `init:site` renders the web Quadlet and Caddy example
from that manifest.

## 2. Provision The Platform Client

From `~/web-data-platform`:

```bash
bun install --frozen-lockfile
bun run web:check
bun run launch:site -- \
  --slug=<client-slug> \
  --repo=<website-root> \
  --domain=<production-domain> \
  --contact-to=<lead-recipient> \
  --contact-from='Website <website@production-domain>'
```

`launch:site` is the groundwork phase. It creates or verifies the platform
client, keeps `active: false`, updates `clients.json` with the real domain and
repo path, runs the website init/project/bootstrap checks, ensures database
grants, renders env/Caddy files, installs the website Quadlet symlink, and runs
`systemctl --user daemon-reload`.

If an existing client needs grant repair after an upgrade, run:

```bash
bun run web:ensure-grants -- --slug=<client-slug>
```

The migration gate also performs DB-only grant repair before and after applying
migrations. The before pass is drift insurance; the after pass covers newly
created tables and sequences.

## 3. Complete Manual Integrations

From `~/web-data-platform`:

```bash
bun run launch:checklist -- --client=<client-slug>
```

Manual items gate the first deploy. Add DNS records in your DNS provider, create
the Postmark server and sender/domain records, wait until Postmark reports DKIM
and Return-Path verification, configure the website Postmark server token in
`web-data-platform/secrets.yaml`, configure fleet-worker provider settings, and
then mark only verified items done:

```bash
bun run launch:checklist -- --client=<client-slug> --set=dns_records_created:done
bun run launch:checklist -- --client=<client-slug> --set=postmark_server_token_configured:done
bun run launch:checklist -- --client=<client-slug> --set=fleet_provider_configured:done
bun run launch:checklist -- --client=<client-slug> --set=postmark_dkim_verified:done
bun run launch:checklist -- --client=<client-slug> --set=postmark_return_path_verified:done
```

If you update `secrets.yaml`, re-render runtime files:

```bash
bun run web:render-client-env -- --slug=<client-slug> --out ~/secrets/<client-slug>.prod.env
bun run web:render-cluster-env -- --out ~/secrets/web-platform-cluster.env
```

Install the rendered Caddy block into the host Caddy config. Run
`caddy validate` before reload.

Website clones do not participate in `web:rotate-sops-recipient`. Platform
production secrets live in `web-data-platform/secrets.yaml`; any clone-local
`secrets.yaml` is dev-only and encrypted to that clone's own age recipient.

## 4. First Deploy The Website

From the website repo on the host:

```bash
export WEB_DATA_PLATFORM_PATH="$HOME/web-data-platform"
bun run launch:deploy -- --client=<client-slug> --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha> --safety=rollback-safe
```

Use `--safety=rollback-blocked` instead when the previous web image cannot run
against the post-migration schema. Use `--skip-migration-gate` only for an
approved manual migration exception.

`launch:deploy` checks the platform checklist before delegating to
`deploy:apply`. `deploy:apply` runs the migration gate, swaps the image,
restarts the configured `<client-slug>-web.service`, waits for `/readyz`, and
runs `deploy:smoke`. After that succeeds, `launch:deploy` runs the platform
`web:test-contact-delivery` end-to-end smoke and marks the
`contact_delivery_smoke_passed` checklist item done.

## 5. Activate Operations

From `~/web-data-platform`, set `active: true` for the client when the outbox
tables exist and provider settings are ready, then restart or wait for the fleet
worker:

```bash
systemctl --user restart web-platform-fleet-worker.service
bun run web:fleet-worker-status -- --client=<client-slug>
```

Verify platform health:

```bash
curl -fsS http://127.0.0.1:9100/healthz
curl -fsS http://127.0.0.1:9100/readyz
podman inspect web-platform-fleet-worker --format '{{.State.Health.Status}}'
```

## Contact Delivery Smoke

`launch:deploy` runs `web:test-contact-delivery` automatically. To rerun that
check manually from this repo:

```bash
bun run --cwd "$WEB_DATA_PLATFORM_PATH" web:test-contact-delivery -- --client=<client-slug>
```

That command proves the full public form -> database -> outbox -> fleet worker
-> Postmark acceptance path with one smoke contact. Failure does not trigger an
automatic rollback; investigate the printed platform failure before announcing
the launch.
