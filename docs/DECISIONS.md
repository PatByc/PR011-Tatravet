# Decisions

## Accepted — single-clinic dashboard

Build specifically for Tatravet with one shared clinic account. This keeps v1 small; individual staff attribution and multiple clinics are deferred.

## Accepted — Railway application and PostgreSQL

Host the web service, scheduled Vapi reconciliation, and PostgreSQL on Railway. Use the clinic subdomain liniavet.tatravet.pl; the owner manages DNS. Deployment and live integration validation remain outstanding.

## Accepted — authenticated link sharing

The copy-link action shares the normal panel URL. Users still log in; no access tokens or passwords appear in the URL. Store Argon2id password hashes and opaque hashed sessions in PostgreSQL. Login persists across browser restarts for three days from sign-in, with matching cookie and database expiry; logout and password changes revoke access earlier.

## Accepted — limited call data and durable follow-up

Store transcripts, available summaries and call metadata, excluding recordings and Vapi costs. Preserve staff notes/statuses during provider synchronization. Show descriptive call analytics without claiming bookings or business outcomes. Retention must be agreed before real call collection.

## Accepted — cache dependency layers and trim production packaging

Keep dependency layers independent of source edits and omit development tools/build caches from the runtime image. The service-specific npm cache mount was removed after Railway rejected the Dockerfile; use standard layer caching until the service's accepted cache configuration can be verified. Preserve Prisma migrations and account setup commands. Use a JavaScript Next config so runtime startup does not depend on a TypeScript config compiler. Cold builds still need downloads; no fixed deployment time is promised.

## Accepted — explicit runtime configuration

Production startup must have PUBLIC_URL and a resolved PostgreSQL DATABASE_URL. Fail early instead of serving an app with the localhost fallback. Operational logs expose only sanitized error codes and non-secret configuration status. Database connection strings, driver messages and query text remain excluded.

## Accepted — webhook-only Vapi connection

The owner declined scheduled synchronization. Connect the saved Vapi assistant directly with authenticated status-update/end-of-call-report webhooks. No Vapi API key or cron service is required. Connection indicators use webhook configuration and last receipt, without treating an idle phone line as a failed sync. Historical backfill is outside this selected setup.

## Accepted — simple Railway start override

Use `npm start` in Railway, preserving migrations as a separate pre-deploy step. Railway's Docker start override uses exec form; a bare `&&` does not chain commands. Runtime diagnostics remain available as a manual command and in the Docker default CMD.
