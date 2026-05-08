# Rollback

Rollback in this repo means web image rollback. Database rewind belongs to
`web-data-platform`.

| Situation                           | Action                                                         |
| ----------------------------------- | -------------------------------------------------------------- |
| Bad web image, no schema/data issue | `bun run rollback --to previous`                               |
| Restart failed after `deploy:apply` | rollback web image, inspect `journalctl --user -u web.service` |
| Bad migration or data corruption    | use web-data-platform restore workflow                         |
| No rollback-safe prior release      | roll forward or use web-data-platform restore                  |

## Commands

```bash
bun run rollback --status
bun run rollback --to previous
systemctl --user daemon-reload
systemctl --user restart web.service
```

The rollback engine updates only the locked rollback Quadlet set:

```ts
['web.container'];
```

## Notes

Rollbacks do not run migrations and do not restart a worker. The production
worker is fleet-owned by the web-data-platform repo.
