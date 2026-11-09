# Railway deployment

## Services

Create a Railway project with PostgreSQL and two services from this repository:

1. **Dashboard:** configuration file `/railway.json`. Docker build, pre-deploy `npm run db:migrate`, start `npm start`, health check `/api/health`.
2. **Call synchronization:** configuration file `/railway.cron.json`. Same Docker image/source, start `npm run sync`, cron `*/15 * * * *`. No public domain, health check, or pre-deploy command on this service. Create/enable it after the web migration succeeds and Vapi is configured. It exits after each run.

Use a European Railway region for both app and database. Keep PostgreSQL private; app services use the database's internal `DATABASE_URL` reference. Configure daily backups on the PostgreSQL volume and test restoration to a separate database before launch.

## Variables

| Variable              | Web | Cron | Value                                         |
| --------------------- | --- | ---- | --------------------------------------------- |
| `DATABASE_URL`        | Yes | Yes  | Railway PostgreSQL internal connection string |
| `PUBLIC_URL`          | Yes | No   | `https://liniavet.tatravet.pl`                |
| `DEMO_MODE`           | Yes | No   | `false` for real data                         |
| `VAPI_API_KEY`        | Yes | Yes  | Private server-side Vapi key                  |
| `VAPI_ASSISTANT_IDS`  | Yes | Yes  | Comma-separated IDs for Tatravet only         |
| `VAPI_WEBHOOK_SECRET` | Yes | No   | Random bearer token, at least 32 characters   |

Railway supplies `PORT`; Next starts on `0.0.0.0`. The image sets production mode, which enables secure cookies. Do not put Vapi credentials in any `NEXT_PUBLIC_*` variable.

If deploying before Vapi is ready, omit its variables and leave the cron service disabled. Login and the empty dashboard still work. No records are fabricated.

## Shared clinic account

After migration, run `npm run account` inside the web service using Railway's service shell, with `CLINIC_USERNAME` and `CLINIC_PASSWORD` supplied securely for that command. Do not commit, print, or put the actual password in shell history. Remove bootstrap variables after execution.

The same command recovers a forgotten password, changes the shared username, revokes all previous sessions, and clears the login throttle. The in-app password change requires the current password and logs out all devices. There is no public signup or email recovery service.

## Custom domain — configured by the owner

1. In Railway's dashboard service, add `liniavet.tatravet.pl` under Settings → Networking → Custom Domain.
2. At Hostido, add a CNAME for `liniavet` using the exact target Railway supplies. Follow any additional verification record shown by Railway.
3. Remove only conflicting records for that hostname, if any. Leave the clinic's root website records untouched.
4. Wait for DNS verification and Railway's TLS certificate.
5. Confirm `PUBLIC_URL=https://liniavet.tatravet.pl` and open the application using this address.

This is direct DNS routing, not a redirect through Vercel. Same-origin APIs require no permissive CORS configuration. Cookies are host-only, Secure, HttpOnly and SameSite=Lax. Copying the link never embeds a password or access token. If using the temporary Railway domain before DNS is ready, set PUBLIC_URL to that domain until switching; otherwise origin checks deliberately reject logins there.

## Launch checklist

- Login and logout work on the final HTTPS domain; unauthenticated API requests return 401.
- Account recovery command has been exercised; no bootstrap password remains configured.
- DEMO_MODE is false; synthetic calls are excluded.
- Vapi credential and assistant allowlist are configured; test call transcript arrives.
- Cron has a successful run and the dashboard shows its timestamp.
- Notes survive the next sync, and restarts preserve sessions and calls.
- Daily backups are configured and restoration has been tested.
- Agree how long call transcripts/notes should be retained before collecting real client data. V1 does not automatically delete records; deletion/retention automation is not implemented.

## Failure and rollback

The health endpoint returns 503 if PostgreSQL is unavailable. UI fetch errors remain visible; it never silently substitutes fixtures. Logs contain generic failure names, not call payloads, phone numbers, passwords, or transcripts. In Railway, check failed deployments, cron exit status and database availability; the app shows delayed/error synchronization states.

Roll back the web service to the prior successful image for an application regression. Do not automatically reverse database migrations. This initial migration only creates tables; future schema changes should remain compatible with the prior app during rollout. Restore a backup into a separate database first, validate it, then change DATABASE_URL if recovery is needed.

A shared clinic login offers no individual staff audit trail. Session expiry is seven days; successful password changes and operator resets invalidate existing sessions. Login is limited to 15 attempts per 15 minutes across the clinic to resist distributed guesses.
