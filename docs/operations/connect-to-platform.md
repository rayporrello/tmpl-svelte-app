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
bun run web:provision-client -- --slug=<client-slug>
```

Edit `clients.json` for the new client:

- set `productionDomain` to the real host name
- set `repoPath` to the website checkout
- confirm the allocated `loopbackPort`
- keep `active: false` until the website is ready for the fleet worker

Provisioning creates the database, app role, fleet-worker role, and SOPS secret
entries. If an existing client needs grant repair after an upgrade, run:

```bash
bun run web:ensure-grants -- --slug=<client-slug>
```

The migration gate also performs DB-only grant repair before and after applying
migrations. The before pass is drift insurance; the after pass covers newly
created tables and sequences.

## 3. Render Runtime Files

From `~/web-data-platform`:

```bash
bun run web:render-client-env -- --slug=<client-slug>
bun run web:render-caddy-sites -- --client=<client-slug> --output=<client-slug>.caddy
```

Install the rendered env file at `~/secrets/<client-slug>.prod.env` and install
the Caddy block into the host Caddy config. Run `caddy validate` before reload.

Website clones do not participate in `web:rotate-sops-recipient`. Platform
production secrets live in `web-data-platform/secrets.yaml`; any clone-local
`secrets.yaml` is dev-only and encrypted to that clone's own age recipient.

## 4. Install And Deploy The Website

From the website repo on the host:

```bash
export WEB_DATA_PLATFORM_PATH="$HOME/web-data-platform"
bun run deploy:preflight
systemctl --user daemon-reload
systemctl --user enable --now <client-slug>-web.service
bun run deploy:apply -- --image=ghcr.io/<owner>/<repo>:<sha> --sha=<sha> --safety=rollback-safe
bun run deploy:smoke -- --url https://your-domain.example
```

Use `--safety=rollback-blocked` instead when the previous web image cannot run
against the post-migration schema. Use `--skip-migration-gate` only for an
approved manual migration exception.

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
