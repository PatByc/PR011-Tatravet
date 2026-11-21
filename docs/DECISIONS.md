# Decisions

## Accepted — single-clinic dashboard

Build specifically for Tatravet with one shared clinic account. This keeps v1 small; individual staff attribution and multiple clinics are deferred.

## Accepted — Railway application and PostgreSQL

Host the web service, scheduled Vapi reconciliation, and PostgreSQL on Railway. Use the clinic subdomain liniavet.tatravet.pl; the owner manages DNS. Deployment and live integration validation remain outstanding.

## Accepted — authenticated link sharing

The copy-link action shares the normal panel URL. Users still log in; no access tokens or passwords appear in the URL. Store Argon2id password hashes and opaque hashed sessions in PostgreSQL. Login persists across browser restarts for three days from sign-in, with matching cookie and database expiry; logout and password changes revoke access earlier.

## Accepted — limited call data and durable follow-up

Store transcripts, available summaries and call metadata, excluding Vapi costs. Preserve staff notes/statuses during provider synchronization. Show descriptive call analytics without claiming bookings or business outcomes. Retention must be agreed before real call collection.

## Accepted later — timed speech turns and private recording archive

Keep timed assistant/caller turns from the end-of-call report as compact JSON alongside the plain transcript. Archive recordings into a private Railway bucket; PostgreSQL stores only archive metadata and an object key. A short-lived signed URL is issued after clinic session authorization for playback. The archive has its own hourly Railway cron service and private Vapi API key; the dashboard's Vapi call integration remains webhook-only. A clinic retention decision is still needed before long-term recording collection.

## Accepted — one contact reason per call

Read Vapi's live `PR011 Tatravet — Powód kontaktu` output and the earlier `Tatravet Contact Reason` format using eight fixed categories. Store one main reason on each call and count missing or invalid values as unknown. Keep the ending-reason chart separate; classification does not imply a booked appointment or medical triage.

## Accepted — automatic callback triage with staff override

Map the EOCR structured contact reason to a callback decision in code. Appointments, appointment changes, animal health, and test results require a callback; prices, clinic information, other, and unknown do not. Ignore Vapi's `wymagaOddzwonienia` flag and do not infer from the transcript. Mark staff changes as reviewed so later provider events cannot undo them. Only staff can mark `Załatwione`.

## Accepted — browser notifications for new calls

Use an authenticated server event stream backed by PostgreSQL `LISTEN/NOTIFY` while the dashboard is open. Vapi and staff changes trigger refreshes without a 30-second timer; reconnect and tab focus also refresh the view. A persistent in-panel alert appears for every newly reported real call, regardless of browser permission, and states whether callbacks are required. An optional system notification uses the same event after permission is granted. The tab title counts new completed calls since the panel opened, clearing when the call list is opened. The first report timestamp prevents duplicate webhook alerts. Existing calls do not trigger launch-day popups. No push service, installed app or taskbar badge in this version.

## Accepted — cache dependency layers and trim production packaging

Keep dependency layers independent of source edits and omit development tools/build caches from the runtime image. The service-specific npm cache mount was removed after Railway rejected the Dockerfile; use standard layer caching until the service's accepted cache configuration can be verified. Preserve Prisma migrations and account setup commands. Use a JavaScript Next config so runtime startup does not depend on a TypeScript config compiler. Cold builds still need downloads; no fixed deployment time is promised.

## Accepted — explicit runtime configuration

Production startup must have PUBLIC_URL and a resolved PostgreSQL DATABASE_URL. Fail early instead of serving an app with the localhost fallback. Operational logs expose only sanitized error codes and non-secret configuration status. Database connection strings, driver messages and query text remain excluded.

## Accepted — webhook-only Vapi connection

The owner declined scheduled call synchronization. Connect the saved Vapi assistant directly with authenticated status-update/end-of-call-report webhooks. The dashboard webhook needs no Vapi API key. A separate recording archive job uses one; it does not synchronize call metadata. Connection indicators use webhook configuration and last receipt, without treating an idle phone line as a failed sync. Historical call backfill is outside this selected setup.

## Accepted — simple Railway start override

Use `npm start` in Railway, preserving migrations as a separate pre-deploy step. Railway's Docker start override uses exec form; a bare `&&` does not chain commands. Runtime diagnostics remain available as a manual command and in the Docker default CMD.
