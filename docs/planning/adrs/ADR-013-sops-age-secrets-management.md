# ADR-013 — SOPS + age as the Default Secrets Workflow

**Status:** Accepted
**Date:** 2026-04-27

---

## Decision

**SOPS + age is the default secrets workflow for all websites built from this template.**

- Encrypted `secrets.yaml` is the Git-tracked source of truth for secret values.
- `.env` is a rendered runtime artifact, generated from `secrets.yaml`. It is never the source of truth and never committed.
- `.env.example` documents the public contract: required variable names without values.
- `.sops.yaml` declares encryption rules and public recipients; it is committed once it contains only public age keys.
- OpenBao (and HashiCorp Vault-compatible tools) are explicitly **not** the default for websites. They are the escalation path for projects with dynamic secrets, multi-service policies, or runtime provisioning needs.
- SaaS secret managers (Doppler, Infisical, 1Password Secrets, AWS Secrets Manager, etc.) are **optional** per real project and are not part of the base template.

---

## Context

A reusable website template ships to many future projects. Without a managed secrets workflow, each project accumulates unmanaged `.env` files on developer laptops and servers. Over time these files drift — different values on different machines, no Git history, no audit trail, no reproducible setup, easy to leak.

The common failure modes:

- **Server drift:** production `.env` was hand-edited six months ago; no one remembers what changed.
- **Memory copying:** developers share secrets over Slack or email because there is no better channel.
- **Unreproducible deploys:** a new developer cannot set up locally without someone sharing a `.env` file.
- **Accidental plaintext commits:** `.gitignore` missing or misconfigured; a secret lands in Git history.
- **Hard rotation:** changing a compromised secret requires touching every machine manually.
- **New machine pain:** onboarding requires synchronizing secrets that exist nowhere except in someone's `.env` file.

SOPS + age solves all of these without requiring a running server, a SaaS account, or a cloud dependency.

### Why not OpenBao (or Vault)?

OpenBao is a runtime secrets control plane. It provides dynamic credentials, leased tokens, per-service access policies, audit logging, and workflow integration. These capabilities are appropriate for:

- Multi-service architectures where each service needs its own access boundaries
- Tenant provisioning that creates secrets at runtime
- Short-lived credentials that rotate automatically
- Strong audit requirements

For a typical website — even one with a database, transactional email, and OAuth — none of these requirements exist. Secrets are static deployment config: they are set once, changed deliberately, and shared with one operator. Deploying OpenBao for a marketing site adds infrastructure complexity that exceeds the security benefit.

### Why not a SaaS secret manager?

Doppler, Infisical, 1Password Secrets Automation, and similar tools are excellent choices when a team needs a managed UI, SSO integration, or centralized multi-project access control. They are not part of the base template because:

- They require a SaaS account (and often billing) to be useful.
- They introduce a network dependency into the secrets workflow.
- The template is intended to work offline and without third-party accounts.

Projects can adopt any of these tools by exporting values into `secrets.yaml` or by replacing the render step. The choice is per-project and does not affect the template architecture.

### Why age over PGP?

SOPS supports multiple encryption backends. age is chosen because:

- No keyserver dependency; keys are local files.
- Simpler key format than PGP; no keyring management.
- No expiry, subkey, or trust-web complexity.
- `age-keygen` is a single command with no configuration.
- Switching backends later is a `.sops.yaml` change, not an application change.

---

## Rules

1. `.env` is a rendered artifact. Never commit it. Never treat it as the source of truth.
2. `secrets.yaml` is committed only after `sops --encrypt --in-place secrets.yaml` has been run. Verify by checking for a `sops:` block at the bottom.
3. `.env.example` must list every required variable. When a new required variable is added, update `.env.example` and `secrets.example.yaml` together.
4. Private age keys (`AGE-SECRET-KEY-1...`) are never committed, never shared over plaintext channels. Back them up securely.
5. Never manually edit encrypted SOPS blobs. Use `sops secrets.yaml` for atomic decrypt-edit-re-encrypt.
6. Server-only secrets (database URLs, API tokens, session keys) must not be imported into client-side SvelteKit modules.
7. Do not add SaaS secret manager integrations to the template. Per-project adoptions are fine but out of scope here.

---

## Consequences

### Positive

- **Provider-independent.** No SaaS account, no cloud dependency, no billing.
- **Git-reviewable.** Secret changes are commits. The diff shows that a value changed (but not to what).
- **Reproducible setup.** A new developer clones the repo, installs age and SOPS, and can decrypt and run locally immediately.
- **Simple enough for solo founders.** The full workflow is: install two tools, generate a keypair, copy the example file, fill in values, encrypt. No servers to run.
- **Rotation is explicit.** Changing a secret is a deliberate commit, not a silent in-place overwrite.

### Negative / tradeoffs

- **Age private keys must be backed up.** If the key is lost and no other recipient is configured, the encrypted file cannot be recovered. Operators must back up `~/.config/sops/age/keys.txt` securely.
- **SOPS must be installed where rendering happens.** CI pipelines, production servers, and developer machines all need SOPS and the private key (or a compatible KMS-backed key). The render script fails clearly if SOPS is missing.
- **No runtime dynamic secrets.** SOPS + age manages static config. It does not issue short-lived credentials, rotate provider tokens, or integrate with workflow engines.
- **No per-service access boundaries.** All recipients can decrypt the entire file. Projects that need service-level isolation need a different tool.
- **YAML structure must be flat or carefully managed.** SOPS encrypts values by key path. Nested structures work but require care when diffing.

---

## Escalation path

Projects should move to OpenBao or a managed secrets API when they require:

- Dynamic credentials (database passwords that rotate automatically)
- Tenant provisioning (runtime creation of per-tenant secrets)
- Workflow-created secrets (automation pipelines that generate and store credentials)
- Runtime secret pulls (services fetch secrets from an API at startup, not from a file)
- Leased access (short-lived tokens with automatic expiry)
- Fine-grained access policy (service A reads secret X; service B does not)
- Strong audit requirements (every access logged and attributable)
- Multiple services with distinct access boundaries

---

## Alternatives considered

- **Plain `.env` files:** Rejected as the source of truth. They create drift, leak risk, and onboarding friction. Acceptable as rendered output only.
- **OpenBao / HashiCorp Vault:** Rejected as the default. Appropriate for large apps with dynamic secrets needs; overkill for static website config.
- **Doppler / Infisical / 1Password Secrets Automation:** Rejected as template defaults. Viable per-project choices; require accounts and network access not suitable for a provider-independent template.
- **GPG/PGP SOPS backend:** Rejected in favor of age. Simpler key management, no keyserver dependency.
- **AWS KMS / GCP KMS:** Rejected as defaults. Cloud dependencies conflict with the provider-independent goal. Teams on AWS/GCP can switch `.sops.yaml` to a KMS backend without changing anything else.
