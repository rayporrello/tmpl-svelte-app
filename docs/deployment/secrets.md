# Secrets Management

## What we are building

Normal websites need secrets management. Even a simple marketing site has secrets: a database password, a transactional email token, an OAuth client secret, a session signing key. Without a managed workflow, these values accumulate as hand-copied `.env` files living on developer laptops and production servers, drifting from each other over time, invisible in Git history, impossible to audit, and easy to leak.

This template uses **SOPS + age** to solve that problem without requiring a SaaS dependency or a running secrets control plane.

The key distinctions:

- **SOPS + age is encrypted config management, not a runtime secrets control plane.** It stores secrets in a Git-tracked encrypted file. It does not rotate tokens, issue dynamic credentials, or enforce per-service access policies.
- **Normal websites have static deployment config.** A session key, a Postmark token, and a database URL are set once and changed deliberately. That is what SOPS + age handles well.
- **OpenBao (or Vault-compatible tools) is reserved for larger apps** where secrets are dynamic, leased, workflow-created, or require fine-grained multi-service access control. That is not this template. See [Escalation path](#escalation-path) below.
- **Plain `.env` files are rendered artifacts, not sources of truth.** The encrypted `secrets.yaml` is the source of truth. `.env` is a derived output for local development or container startup.

---

## Tool roles

| Tool     | Role                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SOPS** | Manages encrypted structured files. Knows which keys to encrypt (by path or regex), which encryption backends to use, and how to re-encrypt when recipients change.                                        |
| **age**  | Provides the public/private key encryption backend. A keypair is a one-time `age-keygen` call; the public key goes into SOPS config, the private key stays on the operator's machine (or a secure backup). |

SOPS supports multiple backends (PGP, AWS KMS, GCP KMS, Azure Key Vault, age). This template defaults to **age** because it is simple, local-first, provider-independent, and has no cloud dependency. Switching to a KMS backend later is a `.sops.yaml` change, not an application change.

---

## File model

| File                          | Role                                                                                              | Committed?           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| `.env.example`                | Public contract: lists required variable names without values                                     | Yes                  |
| `secrets.example.yaml`        | Example shape for a real `secrets.yaml` — shows structure with fake values                        | Yes                  |
| `.sops.yaml.example`          | Example SOPS encryption config — shows the pattern to copy                                        | Yes                  |
| `.sops.yaml`                  | Real project SOPS config with public recipients — safe to commit once values are public keys only | Yes                  |
| `secrets.yaml`                | Encrypted source of truth — commit only after encryption                                          | Yes (encrypted only) |
| `.env`                        | Rendered local/runtime env file — derived from `secrets.yaml`                                     | **Never**            |
| `~/.config/sops/age/keys.txt` | Operator's private age identity                                                                   | **Never**            |

---

## Initial machine setup

### macOS

```bash
brew install sops age

# Generate your personal age keypair
age-keygen -o ~/.config/sops/age/keys.txt

# Tell SOPS where your private key lives
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
# Add the above export to your shell profile (~/.zshrc or ~/.bashrc)

chmod 600 ~/.config/sops/age/keys.txt
```

### Linux / server

Install `sops` and `age` from your distribution's package manager or from the official release pages for each tool. The steps after installation are the same: `age-keygen`, set `SOPS_AGE_KEY_FILE`, `chmod 600`.

Your public key is the line starting with `age1...` inside `~/.config/sops/age/keys.txt`. The private key starts with `AGE-SECRET-KEY-1...` and must never leave the machine or be committed anywhere.

---

## Initial project setup

```bash
# Copy the example SOPS config and replace the placeholder recipient
cp .sops.yaml.example .sops.yaml

# Open .sops.yaml and replace `age1replacewithyourpublicrecipientkey`
# with the `age1...` public key from your ~/.config/sops/age/keys.txt
#
# Example:
#   age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Copy the example secrets file and fill in real values
cp secrets.example.yaml secrets.yaml
# Edit secrets.yaml — replace every `replace-me` and placeholder value

# Encrypt the file in place
sops --encrypt --in-place secrets.yaml

# Commit the safe artifacts
git add .sops.yaml secrets.yaml .env.example
git commit -m "add encrypted secrets"
```

**Warnings:**

- Never commit `secrets.yaml` before running `sops --encrypt --in-place`. Verify it is encrypted by checking that the file contains a `sops:` block at the bottom.
- Never commit `.env` — it is plaintext.
- Never manually edit the encrypted blobs inside `secrets.yaml`. Use `sops secrets.yaml` to open, edit, and re-encrypt atomically.

---

## Local development

### Option A — render `.env` once, then use it

```bash
./scripts/render-secrets.sh
bun --bun run dev
```

The rendered `.env` is gitignored and plaintext. Treat it like a credential file — do not share it or leave it in untrusted locations.

### Option B — avoid writing `.env` entirely

```bash
sops exec-env secrets.yaml 'bun --bun run dev'
```

This injects decrypted variables into the process environment without writing them to disk. Useful in CI or when you want to avoid plaintext files even locally.

---

## Editing secrets

```bash
sops secrets.yaml
# SOPS decrypts to a temp file, opens your $EDITOR, re-encrypts on save.

git add secrets.yaml
git commit -m "update encrypted secrets"
```

Do not decrypt manually and then re-encrypt — `sops secrets.yaml` handles the full round-trip atomically.

---

## Deployment

The intended pattern for Podman/Quadlet deployments:

```bash
# Render to the container env file path
./scripts/render-secrets.sh secrets.yaml ~/.config/containers/env/SITENAME.env
```

The Quadlet unit reads the rendered env file. The rendered file is **not** the source of truth — `secrets.yaml` is. If the server loses the rendered file, re-run the render script.

Do not commit rendered env files to the repo or bake them into container images.

---

## Rotation

When a secret needs to change (compromised token, scheduled rotation, provider change):

1. Rotate the secret at the provider (revoke old, generate new).
2. Edit `secrets.yaml` with the new value: `sops secrets.yaml`
3. Commit the updated encrypted file.
4. Redeploy (re-render `.env` on the server and restart the service).
5. Revoke the old provider token if you have not already.

SOPS does not perform provider-side rotation. It only manages the encrypted file.

---

## Adding another machine or operator

When a second developer or server needs to decrypt `secrets.yaml`:

1. Generate an age keypair on the new machine: `age-keygen -o ~/.config/sops/age/keys.txt`
2. Share the **public** key (`age1...`) with the project — add it to `.sops.yaml` as an additional recipient.
3. From the machine that can currently decrypt, run: `sops updatekeys secrets.yaml`
4. Commit `.sops.yaml` and the rekeyed `secrets.yaml`.

The new machine can now decrypt. The old key still works until removed.

---

## What belongs in secrets

These values belong in `secrets.yaml`:

- `DATABASE_URL` — includes username and password
- `POSTMARK_SERVER_TOKEN` — transactional email API key
- `SESSION_SECRET` — must be a long random string; never a placeholder
- OAuth client secrets and callback tokens
- Webhook signing secrets
- Private API tokens for any external service
- Any value that, if leaked, would compromise the site or its users

---

## What does not belong in secrets

These do not need to be in `secrets.yaml`:

- Brand name, tagline, copy
- CSS tokens and design values
- Public site URL (unless the URL itself is sensitive)
- Public analytics IDs when intentionally exposed to the browser
- Content: blog posts, team bios, page text
- Any value that is safe to expose publicly or is already in the source code

Do not encrypt every config value just because it is config. SOPS overhead adds friction — reserve it for values that are genuinely secret.

---

## Gotchas

- **Losing the age private key means losing access.** Back up `~/.config/sops/age/keys.txt` securely (password manager, encrypted backup). If no other recipient is configured and the key is lost, the file cannot be recovered.
- **SOPS does not rotate provider secrets for you.** You must change the value at the provider first, then update `secrets.yaml`.
- **Rendered `.env` files are plaintext.** Protect them like passwords. `scripts/render-secrets.sh` sets `chmod 600` automatically, but do not copy rendered files to untrusted locations.
- **Server-only secrets must not reach the browser.** SvelteKit's module resolution boundary matters: variables loaded in `+page.server.ts` or `+server.ts` stay server-side. Variables imported into `+page.svelte` or `src/lib/` client modules can end up in the public bundle. Never import `DATABASE_URL`, `SESSION_SECRET`, or API tokens into client-side code.
- **Build-time env can leak into the public bundle.** If you pass secrets to `vite.config.ts` as `define` values, they are inlined into JavaScript. Only pass public values this way.
- **Do not encrypt every config value.** Encrypting a public site URL or brand name creates busywork without security benefit.

---

## Escalation path

Move from SOPS + age to OpenBao, HashiCorp Vault, or a managed secrets API when the project reaches:

- **Dynamic credentials** — database passwords that rotate automatically
- **Tenant provisioning** — runtime creation of per-tenant secrets
- **Workflow-created secrets** — automation pipelines that generate and store credentials
- **Runtime secret pulls** — services that fetch secrets at startup from an API rather than a file
- **Leased access** — short-lived tokens with automatic expiry
- **Fine-grained access policy** — service A can read secret X but not Y; service B vice versa
- **Strong audit requirements** — every secret access logged and attributable
- **Multiple services with distinct access boundaries** — microservices, each with their own allowed secrets

For a typical website — even one with a contact form, a blog, Postgres, and transactional email — SOPS + age is sufficient for the full lifetime of the project.
