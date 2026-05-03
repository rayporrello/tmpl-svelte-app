# Operator Runbook

Practical troubleshooting guide for solo operators and small teams. Start at the top of each section and work down.

This runbook assumes the current database-backed template baseline. Tier 2/3 additions are noted where relevant.

---

## Site appears down

**Symptoms:** Site returns no response, 502, or timeout.

**First checks:**

1. Check the container status: `systemctl --user status <service>` or `podman ps`
2. Check the Caddy status: `systemctl status caddy` or `systemctl --user status caddy`
3. Ping `/healthz` from outside: `curl -s https://yoursite.com/healthz`

**Logs to inspect:**

- App container stdout: `journalctl --user -u <service> -n 100`
- Caddy access log: `journalctl -u caddy -n 100` or check `/var/log/caddy/`

**Safe recovery steps:**

1. Restart the app container: `systemctl --user restart <service>`
2. Restart Caddy if it is the proxy: `systemctl restart caddy`
3. Check for disk space: `df -h`
4. Check for OOM kill: `dmesg | grep -i oom`

**Escalation:** If the site remains down after restart and logs show a repeated crash, the issue is likely in the application code. Pull the last known-good image and roll back.

---

## Form submissions are failing

**Symptoms:** Contact form returns an error, submissions are missing from Postgres or n8n.

**First checks:**

1. Check app logs for `[FAIL]` or `error` level entries with the relevant route.
2. Test the form manually and note the error message shown to the user.
3. Check the environment: `DATABASE_URL` is required; provider URLs may be intentionally unset, but the worker should then mark events as skipped.

**Logs to inspect:**

- App logs filtered to the form route (e.g., `/contact`)
- Postgres rows in `contact_submissions`, `automation_events`, and `automation_dead_letters`
- n8n execution log (if n8n is enabled): check the last execution of `site:<project>:contact:*`

**Safe recovery steps:**

1. Check Postgres connectivity and `/readyz`.
2. Confirm the source row exists in `contact_submissions`.
3. Confirm the outbox row exists in `automation_events`.
4. Run `bun run automation:worker` manually and inspect the outcome.
5. If provider delivery is skipped, verify the selected provider URL and secret.
6. For events in `automation_dead_letters`, fix the receiver/configuration, then re-enqueue or manually replay from the source row.

---

## n8n workflow failed

**Symptoms:** Automation alert fires, n8n Error Workflow triggered, or expected side effects (email, CRM update) did not happen.

**First checks:**

1. Open the n8n editor and check the failed execution log.
2. Identify which node failed and why (error message, HTTP status, timeout).
3. Check whether this is a transient or permanent failure.

**Logs to inspect:**

- n8n execution log for the failed workflow
- App server logs for the `request_id` from the webhook payload (correlates the SvelteKit side)

**Safe recovery steps:**

1. If the SvelteKit worker could not deliver to n8n, check `automation_events` retry state and `automation_dead_letters`.
2. If n8n accepted the webhook but an internal workflow node failed, inspect n8n's own retry/error workflow behavior.
3. For permanent failures (invalid data, credential expired): fix the underlying issue, then re-run the execution manually from n8n.
4. For credential expiry: rotate the credential in n8n and re-run.
5. If the lead/event needs to be re-processed: check Postgres for the stored record and trigger or re-enqueue manually.

---

## Email delivery failed

**Symptoms:** Confirmation email or notification email was not received.

**First checks:**

1. Check the email provider dashboard (Postmark, Resend, etc.) for bounce or rejection logs.
2. Check the app log for the `request_id` associated with the failing submission.
3. Check n8n execution log if email is sent via an n8n workflow.

**Logs to inspect:**

- Email provider delivery log
- n8n execution log (if applicable)
- App server logs around the time of failure

**Safe recovery steps:**

1. For bounced emails: check that the recipient email address is valid.
2. For rejected emails: check DNS records (SPF, DKIM, DMARC). Check provider sending limits.
3. For credential failures: rotate the API key in secrets and redeploy.
4. For missed notification emails: re-trigger the n8n notification workflow manually if the data is in Postgres.

---

## CMS/content publish failed

**Symptoms:** Editor saved content in Sveltia CMS but the live site was not updated.

**First checks:**

1. Check GitHub for a recent commit from the CMS in the `content/` directory.
2. Check CI/CD pipeline status for the main branch.
3. If the commit exists but CI failed, check the workflow run logs.

**Logs to inspect:**

- GitHub Actions run logs
- Caddy logs for any 5xx on asset requests that suggest a broken build

**Safe recovery steps:**

1. If no commit was created: check Sveltia CMS auth. The GitHub OAuth token may be expired.
2. If the commit exists but CI failed: fix the build error and push a new commit.
3. If the site deployed but content is missing: check content loader — the CMS field names may not match `config.yml`.
4. Run `bun run check:content` locally to validate any recently changed files.

---

## Postgres is unavailable

**Symptoms:** `/readyz` returns unhealthy, form submissions fail with database errors.

**First checks:**

1. Check Postgres container: `systemctl --user status <postgres-service>`
2. Check disk space: `df -h` — Postgres fails silently if the data directory is full.
3. Check connection limits: `psql -U <user> -c "SELECT count(*) FROM pg_stat_activity;"`

**Safe recovery steps:**

1. Restart Postgres if it crashed: `systemctl --user restart <postgres-service>`
2. If disk is full: remove old backups or expand the volume. Do not delete active data files.
3. If connection pool is exhausted: restart the app container to reset connections.
4. Check Postgres logs: `journalctl --user -u <postgres-service> -n 200`

**Escalation:** Data loss risk if Postgres is corrupted. Stop writes immediately, take a backup of the data directory, and restore from the most recent verified backup.

---

## SSL/certificate issue

**Symptoms:** Browser shows certificate warning, HSTS error, or `curl` reports certificate expired.

**First checks:**

1. Check certificate expiry: `openssl s_client -connect yoursite.com:443 -servername yoursite.com < /dev/null 2>&1 | grep "Not After"`
2. Caddy renews certificates automatically via Let's Encrypt. Check Caddy logs for renewal errors.

**Logs to inspect:**

- Caddy logs: `journalctl -u caddy -n 200` or `journalctl --user -u caddy -n 200`

**Safe recovery steps:**

1. Restart Caddy to trigger immediate renewal: `systemctl restart caddy`
2. If renewal fails, check that port 80/443 is open and the domain's DNS points to this server.
3. If using Cloudflare proxy: ensure Caddy is set to HTTPS-only mode (Full Strict TLS in Cloudflare).

---

## High error volume

**Symptoms:** Error rate spike in logs, many 5xx responses, uptime monitor alerts.

**First checks:**

1. Check app logs for the most common error patterns: `journalctl --user -u <service> | grep '"level":"error"' | tail -50`
2. Note the affected routes and error types.
3. Check for a recent deployment that may have introduced a regression.

**Safe recovery steps:**

1. If a bad deploy is suspected: roll back to the previous image.
2. If the error is isolated to one route: investigate that route's server code.
3. If errors are correlation-ID-tagged (Tier 3): trace them through the distributed trace.
4. For Tier 2 sites with Sentry: check the issue queue for the new error cluster.

---

## Backup verification failed

**Symptoms:** Scheduled backup check did not complete, or a test restore failed.

**First checks:**

1. Check the backup script output in cron logs or the verification workflow execution log.
2. Verify the backup destination (R2, S3, local disk) is accessible and has space.
3. Check whether the most recent backup file exists and has a non-zero size.

**Safe recovery steps:**

1. Re-run the backup script manually and check for errors.
2. Test a restore to a temporary database to verify integrity.
3. If backups have been failing silently for multiple days: treat as a P1 until the backup chain is restored.
4. Document the gap and adjust the backup verification alert frequency.
