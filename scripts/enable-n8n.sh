#!/usr/bin/env bash
# enable-n8n.sh — provision the n8n schema, role, and starter env for a
# client who is activating their own self-hosted n8n bundle.
#
# Idempotent: safe to re-run. CREATE DATABASE / CREATE ROLE both use IF NOT
# EXISTS via DO blocks; rerunning will not lose data or rotate the password.
#
# What it does:
#   1. Connects to <project>-postgres as the superuser.
#   2. Creates database <project>_n8n if missing.
#   3. Creates role <project>_n8n_user with a generated password if missing.
#   4. Grants the role full privileges on its own database only.
#   5. Prints the env shape to add to secrets.yaml (or directly to .env).
#
# Run: bun run n8n:enable

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_SLUG="${PROJECT_SLUG:-$(jq -r '.project.projectSlug' "$ROOT_DIR/site.project.json" 2>/dev/null || true)}"
if [[ -z "${PROJECT_SLUG}" || "${PROJECT_SLUG}" == "null" ]]; then
	echo "FAIL n8n:enable could not determine project slug." >&2
	echo "NEXT: Set PROJECT_SLUG=<slug> or fix site.project.json before re-running." >&2
	exit 1
fi

# Sanitize once more — Postgres identifiers must be ASCII alphanumerics + _.
SAFE_SLUG="$(echo "${PROJECT_SLUG}" | tr -c '[:alnum:]' '_' | tr '[:upper:]' '[:lower:]')"
N8N_DB="${SAFE_SLUG}_n8n"
N8N_ROLE="${SAFE_SLUG}_n8n_user"
CONTAINER="${PROJECT_SLUG}-postgres"

if ! podman container exists "${CONTAINER}"; then
	echo "FAIL n8n:enable container ${CONTAINER} not running." >&2
	echo "NEXT: Start <project>-postgres first." >&2
	exit 1
fi

# Fetch superuser credentials from the running container's env.
SUPERUSER="$(podman exec "${CONTAINER}" sh -c 'echo $POSTGRES_USER')"
if [[ -z "${SUPERUSER}" ]]; then
	echo "FAIL n8n:enable could not read POSTGRES_USER from ${CONTAINER}." >&2
	exit 1
fi

# Generate (or reuse) the n8n role password. We store it in a stable file in
# ~/secrets/ so re-runs don't rotate it. The operator hand-copies it into
# the encrypted secrets.yaml after the first run.
PW_FILE="${HOME}/secrets/${PROJECT_SLUG}.n8n-db-password"
if [[ -f "${PW_FILE}" ]]; then
	N8N_PASSWORD="$(cat "${PW_FILE}")"
	echo "n8n:enable reusing existing role password from ${PW_FILE}"
else
	N8N_PASSWORD="$(openssl rand -base64 36 | tr -d '/+=' | head -c 32)"
	mkdir -p "$(dirname "${PW_FILE}")"
	umask 077
	echo -n "${N8N_PASSWORD}" > "${PW_FILE}"
	chmod 0600 "${PW_FILE}"
	echo "n8n:enable wrote new role password to ${PW_FILE} (mode 0600)"
fi

# Run the SQL idempotently. CREATE DATABASE doesn't support IF NOT EXISTS in
# Postgres; we use a DO block + dynamic EXECUTE for the role and a SELECT
# guard for the database.
podman exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${SUPERUSER}" -d postgres <<EOF
DO \$\$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${N8N_ROLE}') THEN
		EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${N8N_ROLE}', '${N8N_PASSWORD}');
	ELSE
		EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', '${N8N_ROLE}', '${N8N_PASSWORD}');
	END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${N8N_DB} OWNER ${N8N_ROLE}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${N8N_DB}')
\\gexec

GRANT ALL PRIVILEGES ON DATABASE ${N8N_DB} TO ${N8N_ROLE};
EOF

# Generate or remind about the encryption key. We don't write the encryption
# key to disk for the operator — they generate it themselves so the value
# only enters the encrypted secrets.yaml.
ENCRYPTION_KEY_HINT="$(openssl rand -hex 32)"

cat <<INFO

n8n:enable complete for ${PROJECT_SLUG}.

Postgres state:
  database  ${N8N_DB}
  role      ${N8N_ROLE}
  password  stored in ${PW_FILE}

Add these values to secrets.yaml (then sops --encrypt --in-place):

  N8N_ENABLED: 'true'
  N8N_ENCRYPTION_KEY: '${ENCRYPTION_KEY_HINT}'    # generated; rotate only when retiring n8n
  N8N_HOST: 'n8n.<your-domain>'
  N8N_PROTOCOL: 'https'
  # Postgres connection for n8n:
  DB_POSTGRESDB_PASSWORD: '${N8N_PASSWORD}'

Then install the Quadlet:

  cp deploy/quadlets/n8n.volume    ~/.config/containers/systemd/${PROJECT_SLUG}-n8n-data.volume
  cp deploy/quadlets/n8n.container ~/.config/containers/systemd/${PROJECT_SLUG}-n8n.container
  systemctl --user daemon-reload
  systemctl --user enable --now ${PROJECT_SLUG}-n8n

And add the n8n Caddy block from deploy/Caddyfile.example.
INFO
