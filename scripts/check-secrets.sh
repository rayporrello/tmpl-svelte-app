#!/usr/bin/env bash
set -euo pipefail

PASS=true

# If secrets.yaml exists, it must be SOPS-encrypted.
if [[ -f "secrets.yaml" ]]; then
  if ! grep -q '^sops:' secrets.yaml; then
    echo "FAIL: secrets.yaml exists but does not appear to be SOPS-encrypted." >&2
    echo "      Encrypt it: sops --encrypt --in-place secrets.yaml" >&2
    PASS=false
  else
    echo "OK:   secrets.yaml is encrypted."
  fi
fi

# .env must not be tracked by Git.
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "FAIL: .env is tracked by Git. Remove it: git rm --cached .env" >&2
  PASS=false
else
  echo "OK:   .env is not tracked."
fi

# .env.* files must not be tracked, except .env.example.
TRACKED_DOTENV=$(git ls-files '.env.*' | grep -v '^\.env\.example$' || true)
if [[ -n "$TRACKED_DOTENV" ]]; then
  echo "FAIL: the following .env.* files are tracked by Git:" >&2
  echo "$TRACKED_DOTENV" | sed 's/^/        /' >&2
  echo "      Remove them: git rm --cached <file>" >&2
  PASS=false
else
  echo "OK:   no unexpected .env.* files tracked."
fi

# Decrypted secrets files must not be tracked.
TRACKED_DECRYPTED=$(git ls-files 'secrets.decrypted.yaml' '*.decrypted.yaml' 2>/dev/null || true)
if [[ -n "$TRACKED_DECRYPTED" ]]; then
  echo "FAIL: decrypted secrets files are tracked by Git:" >&2
  echo "$TRACKED_DECRYPTED" | sed 's/^/        /' >&2
  echo "      Remove them: git rm --cached <file>" >&2
  PASS=false
else
  echo "OK:   no decrypted secrets files tracked."
fi

if [[ "$PASS" == "true" ]]; then
  echo ""
  echo "Secrets check passed."
  exit 0
else
  echo ""
  echo "Secrets check FAILED. See errors above." >&2
  exit 1
fi
