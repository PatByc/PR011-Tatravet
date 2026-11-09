# Tatravet v1 implementation plan

Build a Polish, single-clinic call dashboard on Railway with PostgreSQL, a shared clinic login, transcripts, analytics, and editable follow-up notes. Use the specified Codex frontend-design skill and Tatravet branding.

1. Foundation: Next.js/TypeScript, PostgreSQL schema, secure sessions, login, password reset command.
2. Interface: overview, call history/detail, analytics, settings; development-only synthetic fixtures.
3. Integration: authenticated Vapi webhooks, allowlisted assistant IDs, repeat-safe imports, 30-day initial synchronization and 15-minute reconciliation.
4. Delivery: database migrations, Railway web/cron configuration, Docker packaging, deployment/account recovery guide, functional and browser tests.

Public URL: https://liniavet.tatravet.pl. User configures Railway custom domain and Hostido DNS. No recording playback, Vapi cost reporting, public signup, multiple clinics, booking calendar, or invented business-outcome analytics.

Acceptance: unauthenticated data access blocked; callback notes survive sync; Warsaw dates and DST correct; duplicate events safe; mobile usable; production build and functional checks pass. Live Vapi acceptance needs the finished assistant and credentials. Decide retention before collecting real calls.
