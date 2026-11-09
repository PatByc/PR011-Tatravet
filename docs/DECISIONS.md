# Decisions

## Accepted — single-clinic dashboard

Build specifically for Tatravet with one shared clinic account. This keeps v1 small; individual staff attribution and multiple clinics are deferred.

## Accepted — Railway application and PostgreSQL

Host the web service, scheduled Vapi reconciliation, and PostgreSQL on Railway. Use the clinic subdomain liniavet.tatravet.pl; the owner manages DNS. Deployment and live integration validation remain outstanding.

## Accepted — authenticated link sharing

The copy-link action shares the normal panel URL. Users still log in; no access tokens or passwords appear in the URL. Store Argon2id password hashes and opaque hashed sessions in PostgreSQL.

## Accepted — limited call data and durable follow-up

Store transcripts, available summaries and call metadata, excluding recordings and Vapi costs. Preserve staff notes/statuses during provider synchronization. Show descriptive call analytics without claiming bookings or business outcomes. Retention must be agreed before real call collection.
