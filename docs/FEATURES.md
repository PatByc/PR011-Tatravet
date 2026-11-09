# Features

## Implemented and locally verified

- Polish responsive dashboard using Tatravet colors and self-hosted Poppins.
- Shared clinic login, password change, persistent three-day login sessions and revocation and operator account recovery.
- Deployment startup checks for required variables and sanitized database error codes in server logs.
- Searchable, paginated call history and transcript/detail view.
- Callback queue, editable internal notes and conflict detection.
- Daily/hourly analytics with Warsaw timezone handling.
- Copy dashboard link and integration status.
- Authenticated Vapi webhook ingestion, assistant allowlist, duplicate-safe updates and webhook receipt status. Scheduled reconciliation is not part of the selected setup.
- PostgreSQL migration, isolated demo fixtures, Docker and Railway configuration.
- Source-independent dependency layer and a production image excluding development tools and build cache.

## Awaiting external setup

- Railway deployment, production account and database backups.
- Custom domain DNS/TLS configuration by the owner.
- Finished Vapi assistant, credentials and live-call acceptance testing.
- Production data retention decision.

## Outside v1

Recordings, Vapi costs, individual staff accounts, public registration, multiple clinics, appointment scheduling and inferred booking conversion.
