# Features

## Contact reasons

The analytics tab groups each call by one structured contact reason supplied by Vapi. Missing classifications appear as “Nieustalony powód”; the call details show the same reason. The existing ending-reason chart remains separate.

## Implemented and locally verified

- Polish responsive dashboard using Tatravet colors and self-hosted Poppins.
- Shared clinic login, password change, persistent three-day login sessions and revocation and operator account recovery.
- Deployment startup checks for required variables and sanitized database error codes in server logs.
- Searchable, paginated call history and transcript/detail view.
- Timed assistant and caller turns when Vapi sends message timing; private recording archive and playback after the Railway bucket job is configured.
- Callback queue, editable internal notes and conflict detection.
- Automatic callback queue entry from a fixed mapping of EOCR contact reasons; staff decisions take precedence.
- Daily/hourly analytics with Warsaw timezone handling.
- Copy dashboard link and integration status.
- Live in-panel alerts and optional browser notifications for every new real call, with event-driven dashboard updates and a tab-title count of new calls since opening the panel. Paw favicon matching the sidebar mark.
- Notification Settings show permission state, progress and errors immediately, with a test notification button for checking browser and Windows delivery.
- Authenticated Vapi webhook ingestion, assistant allowlist, duplicate-safe updates and webhook receipt status. Scheduled reconciliation is not part of the selected setup.
- PostgreSQL migration, isolated demo fixtures, Docker and Railway configuration.
- Optional idempotent three-call showcase seed for the real-data view, dated 9 November 2026 and visibly labelled as samples.
- Source-independent dependency layer and a production image excluding development tools and build cache.

## Awaiting external setup

- Railway deployment, production account and database backups.
- Custom domain DNS/TLS configuration by the owner.
- Finished Vapi assistant, credentials and live-call acceptance testing.
- Production data retention decision.

## Outside v1

Vapi costs, individual staff accounts, public registration, multiple clinics, appointment scheduling and inferred booking conversion.
