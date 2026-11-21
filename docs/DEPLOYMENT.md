# Railway deployment

## Services

Create a Railway project with PostgreSQL and the dashboard service from this repository. Add a private bucket and a second scheduled service when enabling recording archival:

1. **Dashboard:** configuration file `/railway.json`. Docker build, pre-deploy `npm run db:migrate`, start `npm start`, health check `/api/health`.
   The selected Vapi call integration uses webhooks only. Do not create the legacy call-sync cron service. The recording archive job below is a separate task.

Use a European Railway region for both app and database. Keep PostgreSQL private; app services use the database's internal `DATABASE_URL` reference. Configure daily backups on the PostgreSQL volume and test restoration to a separate database before launch.

## Variables

| Variable              | Dashboard value                               |
| --------------------- | --------------------------------------------- |
| `DATABASE_URL`        | Railway PostgreSQL internal connection string |
| `PUBLIC_URL`          | Current public dashboard URL                  |
| `DEMO_MODE`           | `false` for real calls                        |
| `VAPI_ASSISTANT_IDS`  | Saved Tatravet assistant ID(s)                |
| `VAPI_WEBHOOK_SECRET` | Random bearer secret, at least 32 characters  |

No VAPI_API_KEY is required for webhooks.

## Timed transcripts and recording archive

The dashboard saves the speech turns and elapsed seconds provided in Vapi's end-of-call report. New calls show `mm:ss` beside each assistant/caller turn. Calls with only a plain transcript keep the previous text view; this migration cannot invent timestamps for historical transcripts. Vapi must send timed `artifact.messages` or timed transcript entries in the report. See [Vapi call recording and transcription](https://docs.vapi.ai/assistants/call-recording).

Audio files go into a **private Railway Storage Bucket**, not PostgreSQL. PostgreSQL keeps the archive state, object key, MIME type, and byte count. Existing calls with end-of-call reports from the previous 14 days are queued by the migration for a one-time archive attempt; older calls are not backfilled automatically. This uses the configured Vapi private API key to retrieve a recording, so the 14-day call-history window should be treated as an operational deadline, not a permanent file link. Vapi's exact retention varies by account plan. See [Vapi artifact retrieval](https://docs.vapi.ai/assistants/retrieve-call-artifacts) and [Vapi retention](https://docs.vapi.ai/observability/logs/overview).

1. In the same Railway project, create a private Storage Bucket named `Recordings` in a European region. The new bucket's Credentials tab shows its S3 endpoint and URL style. This implementation uses the current virtual-hosted style. Keep the bucket private. [Railway Storage Buckets](https://docs.railway.com/storage-buckets)
2. In the bucket's Credentials tab, use **Add to Service** for both the dashboard and archive service. The app reads Railway's provisioned AWS variable names below. If you already configured the corresponding `RECORDINGS_*` variables, those still work as a fallback. Verify that the values resolve in the same Railway environment and deploy staged variable changes.

   | Variable | Value |
   | --- | --- |
   | `AWS_ENDPOINT_URL` | `${{Recordings.ENDPOINT}}` |
   | `AWS_S3_BUCKET_NAME` | `${{Recordings.BUCKET}}` |
   | `AWS_DEFAULT_REGION` | `${{Recordings.REGION}}` |
   | `AWS_ACCESS_KEY_ID` | `${{Recordings.ACCESS_KEY_ID}}` |
   | `AWS_SECRET_ACCESS_KEY` | `${{Recordings.SECRET_ACCESS_KEY}}` |

3. Add a second Railway service from this repository named `Recording archive`. Point that service's Railway Config File to `/railway.archive.json` if it uses config-as-code. The root `/railway.json` belongs to the dashboard and otherwise overrides the archive start command and healthcheck. The archive config runs `npm run archive:recordings` every 15 minutes (UTC), with no domain, web healthcheck, or pre-deploy command. If your Railway service does not support a custom config file, set these values in its Settings and verify the **effective** deployment settings show the archive command, not `npm start`. Give it `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `VAPI_ASSISTANT_IDS` matching the dashboard, the bucket variables above, and a private `VAPI_API_KEY` from Vapi. The web service does not need the Vapi API key. The job processes up to 50 pending recordings per run, retries failed copies after six hours, and exits after closing its database connection. Calls still unarchived after 14 days are marked unavailable. [Railway Cron Jobs](https://docs.railway.com/cron-jobs), [config precedence](https://docs.railway.com/config-as-code)
4. Ensure recording is enabled in the assistant's Recording & Artifacts settings and `end-of-call-report` reaches the webhook. After a test call, verify the archive job reports an archived count and the call detail page offers playback. If the job reports failures, check the assistant's recording setting, Vapi API key, bucket references, and the bucket URL style; no secret or recording URL is written to logs.

Each accepted end-of-call report queues its recording automatically; no staff button is involved. Calls already showing `Nagranie oczekuje na skopiowanie do archiwum` are included when the archive service first runs, provided Vapi still makes their audio available. The detail panel loads the recording state when opened, so close and reopen it after an archive run. A successful job prints `recording_archive` with `archived` greater than zero. The dashboard's `/api/events`, `/api/dashboard`, and `/api/notifications` requests are live page refreshes, not audio chunks or archive progress.

The archive fetches audio through Vapi's authenticated recording endpoint and stores a private copy. Staff playback uses a five-minute signed bucket URL generated behind the existing session-protected call endpoint. No public bucket or raw Vapi recording URL is exposed in the dashboard. The archive does not automatically delete recordings; agree a retention period with the clinic before collecting them. Storage cost depends on duration and format: at 64 kbit/s, a ten-minute recording is about 4.8 MB, so 1,000 such recordings occupy about 4.8 GB. Railway currently lists bucket storage at $0.015 per GB-month; verify the live rate and account limits before rollout. [Railway Storage Buckets](https://docs.railway.com/storage-buckets)

Every newly reported real call shows a persistent alert inside the open dashboard, even without browser notification permission; the alert says whether callback work is needed. System notifications use HTTPS and require the user to switch them on in Settings. The browser controls the permission prompt; Settings shows its current state and the button stops waiting after ten seconds if no decision arrives. The dashboard uses an authenticated Server-Sent Events connection and PostgreSQL `LISTEN/NOTIFY` to refresh when Vapi or staff updates data. It also refreshes when the tab reconnects or regains focus; there is no 30-second polling. Preset date ranges advance after midnight on the next refresh. Railway must allow the long-lived stream, and one PostgreSQL listener connection is held while dashboard tabs are open. The tab title counts new calls since the panel opened and clears on entering the calls list, without notification permission. No new Railway environment variables or service are needed.

Railway supplies `PORT`; Next starts on `0.0.0.0`. The image sets production mode, which enables secure cookies. Do not put Vapi credentials in any `NEXT_PUBLIC_*` variable.

If deploying before Vapi is ready, omit its variables. Login and the empty dashboard still work. No records are fabricated.

## Shared clinic account

After migration, run `npm run account` inside the web service using Railway's service shell, with `CLINIC_USERNAME` and `CLINIC_PASSWORD` supplied securely for that command. Do not commit, print, or put the actual password in shell history. Remove bootstrap variables after execution.

The same command recovers a forgotten password, changes the shared username, revokes all previous sessions, and clears the login throttle. The in-app password change requires the current password and logs out all devices. There is no public signup or email recovery service.

## Three presentation calls in the real-data view

After deploying the version with `seed:showcase` and setting the dashboard service's `DEMO_MODE=false`, run `npm run seed:showcase` once in that service's Railway shell. It copies only `demo-0`, `demo-1`, and `demo-2` into three clearly labelled sample records dated 9 November 2026 in Warsaw time. It uses fake demo caller numbers, preserves the original demo rows, and is safe to rerun without duplicates. These three records have `isDemo=false`, so they appear alongside real Vapi calls and count in analytics. Use the dashboard date range for 9 November 2026 or a range containing that day to see them. Remove the three `showcase-20261109-*` records when the presentation is over if they should no longer affect live analytics.

## Custom domain — configured by the owner

1. In Railway's dashboard service, add `tatravet.liniavet.pl` under Settings → Networking → Custom Domain.
2. In the DNS provider for `liniavet.pl`, add a CNAME for `tatravet` using the exact target Railway supplies. Follow any additional verification record shown by Railway.
3. Remove only conflicting records for that hostname, if any. Leave the clinic's root website records untouched.
4. Wait for DNS verification and Railway's TLS certificate.
5. Confirm `PUBLIC_URL=https://tatravet.liniavet.pl` (including `https://`, without literal quotes) and open the application using this address.

This is direct DNS routing, not a redirect through Vercel. Same-origin APIs require no permissive CORS configuration. Cookies are host-only, Secure, HttpOnly and SameSite=Lax. Copying the link never embeds a password or access token. If using the temporary Railway domain before DNS is ready, set PUBLIC_URL to that domain until switching; otherwise origin checks deliberately reject logins there.

## Launch checklist

- Login and logout work on the final HTTPS domain; unauthenticated API requests return 401.
- Account recovery command has been exercised; no bootstrap password remains configured.
- DEMO_MODE is false; synthetic calls are excluded.
- Vapi credential and assistant allowlist are configured; test call transcript arrives.
- A test webhook has arrived and the dashboard shows its receipt timestamp.
- Notes survive repeated webhook delivery, and restarts preserve sessions and calls.
- If archival is enabled, a test recording reaches the private bucket and plays only for a signed-in clinic user.
- Daily backups are configured and restoration has been tested.
- Agree how long call transcripts/notes should be retained before collecting real client data. V1 does not automatically delete records; deletion/retention automation is not implemented.

## Failure and rollback

The health endpoint returns 503 if PostgreSQL is unavailable. UI fetch errors remain visible; it never silently substitutes fixtures. Logs contain generic failure names, not call payloads, phone numbers, passwords, or transcripts. In Railway, check failed deployments and database availability. The app shows webhook readiness and the last received event; verify delivery failures in Vapi logs.

Roll back the web service to the prior successful image for an application regression. Do not automatically reverse database migrations. This initial migration only creates tables; future schema changes should remain compatible with the prior app during rollout. Restore a backup into a separate database first, validate it, then change DATABASE_URL if recovery is needed.

A shared clinic login offers no individual staff audit trail. Session expiry is three days from login (including the persistent browser cookie); successful password changes and operator resets invalidate existing sessions. Login is limited to 15 attempts per 15 minutes across the clinic to resist distributed guesses.

## Build caching

Package installation is a separate Docker layer keyed on package.json/package-lock.json. Source-only changes can reuse that layer when Railway retains it. There is no service-specific cache mount: the previous mount was removed after Railway rejected the Dockerfile during validation. A cold or invalidated dependency layer downloads packages again.

No fixed deployment time is guaranteed: registry/network time, runner allocation, image export and health checks remain outside application compilation.

The production image contains the built app, production dependencies and operational scripts, excluding test tools, project documentation, and Next build cache. Prisma and tsx remain available for migrations/account setup. OpenSSL is installed for Prisma's engine. Auditing runs separately (`npm audit`), rather than as a network request during each image build.

## Runtime diagnostics

The Docker image default command checks PUBLIC_URL and DATABASE_URL before starting. Railway uses the simple `npm start` override; run `node scripts/check-runtime.mjs` manually inside the service when diagnosing variables. Missing variables or an unresolved database reference stop startup with the affected variable names. Successful validation logs only the public origin and a database-configured boolean, never the database URL/password. This validates configuration shape, not database connectivity. Health/request failures include sanitized Prisma/database error codes without SQL, driver messages or credentials. Use the codes to distinguish connectivity errors from missing migrations.

## Railway start command

Use `npm start` for Custom Start Command. Docker-based Railway overrides run in exec form, so do not put bare shell operators such as `&&` in that field. The former compound diagnostic/start override could exit after the diagnostic script without starting Next.js. Keep `npm run db:migrate` in Pre-deploy Command, and `/api/health` as Healthcheck Path.
