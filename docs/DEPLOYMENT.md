# Railway deployment

## Services

Create a Railway project with PostgreSQL and one application service from this repository:

1. **Dashboard:** configuration file `/railway.json`. Docker build, pre-deploy `npm run db:migrate`, start `npm start`, health check `/api/health`.
   The selected Vapi integration uses webhooks only. Do not create the cron service. The legacy sync configuration is not needed.

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
