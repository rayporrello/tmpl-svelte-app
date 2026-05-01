# Bootstrap Fixtures

These fixture directories describe bootstrap states for `scripts/check-bootstrap.ts`.
The harness copies the current template files into a temp directory, then applies
each fixture's metadata. Plain `.env` files are intentionally not committed.
