#!/usr/bin/env bash
set -euo pipefail

SECRETS_FILE="${1:-secrets.yaml}"
OUTPUT_FILE="${2:-.env}"

if ! command -v sops >/dev/null 2>&1; then
  echo "Error: sops is not installed or not on PATH." >&2
  echo "Install: brew install sops  (macOS) or see https://github.com/getsops/sops/releases" >&2
  exit 1
fi

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Error: missing secrets file: $SECRETS_FILE" >&2
  echo "Copy secrets.example.yaml to secrets.yaml, fill in values, then encrypt with:" >&2
  echo "  sops --encrypt --in-place secrets.yaml" >&2
  exit 1
fi

if ! grep -q '^sops:' "$SECRETS_FILE"; then
  echo "Error: $SECRETS_FILE does not appear to be SOPS-encrypted." >&2
  echo "Refusing to render a plaintext secrets file." >&2
  echo "Encrypt it first: sops --encrypt --in-place $SECRETS_FILE" >&2
  exit 1
fi

sops --decrypt --output-type dotenv "$SECRETS_FILE" > "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"
echo "Rendered $SECRETS_FILE → $OUTPUT_FILE"
