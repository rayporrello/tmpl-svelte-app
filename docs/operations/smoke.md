# E2E Deploy Smoke

`bun run deploy:smoke` always runs the static surface checks. When
`SMOKE_TEST_SECRET` is configured, it also performs an authenticated E2E smoke
through `POST /contact`, Postgres, the automation outbox, the worker, and
Postmark's test API token.

The smoke header is a privileged backdoor credential. Generate it with:

```bash
openssl rand -hex 32
```

Store the value as `SMOKE_TEST_SECRET` in encrypted `secrets.yaml`. Add
Postmark's test API token as `POSTMARK_API_TEST`; the token is available in the
Postmark UI and accepts email API calls without delivering real mail.

## Failure Modes

| Response / check | Meaning                                       | Operator action                                          |
| ---------------- | --------------------------------------------- | -------------------------------------------------------- |
| `401`            | Smoke header missing/invalid                  | Verify rendered env and rotate the secret if leaked      |
| `429`            | Smoke rate limit exceeded                     | Wait for refill or raise the per-hour cap knowingly      |
| `503`            | More than threshold old smoke rows are queued | Fix pruning, then run `bun run privacy:prune -- --apply` |
| timeout          | Web, DB, worker, or Postmark chain stalled    | Inspect deploy smoke output and worker/web logs          |

Fail-closed backlog responses use this JSON shape:

```json
{ "error": "smoke-backlog-exceeded", "count": 101 }
```

## Outbox Status (Platform Fleet Worker)

The smoke polls the `automation_events` row created by the smoke `POST /contact`
and treats statuses uniformly across the template's local one-shot worker and
the `web-data-platform` fleet worker:

| Status                   | Outcome                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `completed`              | Pass. Either the local worker skipped on `is_smoke_test=true`, or the platform worker dispatched and recorded the row as completed.                                  |
| `pending`                | Skipped (info) when `--allow-pending` is set. Use during the **first** deploy of a client before the platform fleet worker has been marked active. Fails by default. |
| `processing`             | Smoke keeps polling within the 30s window — the worker has claimed the row and is mid-dispatch.                                                                      |
| `dead_letter` / `failed` | Hard fail. Inspect platform fleet-worker logs and the row in `automation_dead_letters`.                                                                              |

Override the default 30s outbox wait with `--allow-pending` when you know the
platform worker isn't draining this client yet:

```bash
bun run deploy:smoke -- --url https://your-site.example --allow-pending
```

## Pruning

Smoke contact rows are tagged with `is_smoke_test = true` and pruned after 24
hours by `bun run privacy:prune`. If the pruner breaks, smoke refuses new rows
once the old-row backlog exceeds `SMOKE_TEST_BACKLOG_THRESHOLD` (default 100).

Manual cleanup:

```bash
bun run privacy:prune -- --apply
```

## Rotation

1. Generate a new value with `openssl rand -hex 32`.
2. Edit encrypted secrets with `sops secrets.yaml`.
3. Update `SMOKE_TEST_SECRET`, render the production env, and restart the web service.
4. Re-run `bun run deploy:smoke -- --url https://your-site.example`.
5. Treat any old rendered env file containing the previous secret as revoked material.
