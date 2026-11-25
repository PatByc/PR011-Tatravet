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
- Vapi-default provider configuration, call-provider provenance, and a separate LiveKit worker bundle with authenticated EOCR delivery, private-bucket replay, post-call analysis and audio archival. Production telephony routing remains manual.
- LiveKit voice sessions receive the current Poland-local date and validated SIP caller number; delegated FAQ lookups suppress queued filler audio while approved facts are fetched.

## Awaiting external setup

- Private Railway recording bucket and scheduled archive service, with a live recording copy and playback check.
- Database backups and any remaining production account or domain configuration.
- Production data retention decision.
- LiveKit EOCR credentials, isolated-database integration and browser checks, a staging SIP call with recording playback, and the owner's manual telephony cutover.

## Outside v1

Vapi costs, individual staff accounts, public registration, multiple clinics, appointment scheduling and inferred booking conversion.
