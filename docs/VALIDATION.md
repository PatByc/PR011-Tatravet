# Validation — 2026-11-09

Completed against an isolated local PostgreSQL 18 database:

- Initial migration applied successfully; shared-account setup and demo fixture loading succeeded.
- TypeScript check and optimized production build passed.
- 11 unit/database tests passed: normalization, duplicate and out-of-order delivery, assistant isolation, note preservation, reconciliation window splitting, cursor recovery, transcript search, aggregates, Warsaw midnight and DST boundaries.
- 6 Playwright browser/API tests passed against the production server: unauthorized access and origin rejection, clinic workflow and clipboard link, mobile containment, bad credentials, concurrent note conflicts, session expiry, and password-change revocation of all sessions.
- Desktop/mobile screenshots reviewed. Fixed a visually hidden table header escaping its scrolling region. Mobile logout is available under Settings.
- npm audit reports zero known vulnerabilities.

Browser screenshots: test-results/overview-desktop.png, overview-mobile.png, analytics-desktop.png, detail-mobile.png. These are local, gitignored test artifacts.

Not verified externally: Railway deployment, DNS/TLS, Railway backup/restore, live Vapi assistant payloads and call delivery. These require the owner's infrastructure and the finished assistant. The integration is exercised with representative synthetic payloads; no real client data or secrets were used.

## Build packaging follow-up

Production build, typecheck, 8 unit tests and dependency audit passed after optimizing the Dockerfile. An isolated copy with development dependencies pruned successfully ran Prisma migration, account creation, health check, browser login, dashboard data loading and logout. The Docker daemon is not accessible in this environment, so the actual image build and Railway cache reuse must be confirmed on Railway.

## Railway cache validation correction

Railway rejected the service-specific cache mount before build execution. Removed all Dockerfile cache mounts and retained standard dependency-layer caching, production pruning and OpenSSL. This correction is verified by inspecting the resulting Dockerfile and whitespace checks; Railway must confirm the deployment outcome.

## Railway startup correction

Replaced the compound Railway start override with `npm start` after verifying Railway's Docker overrides use exec form. Checked the JSON configuration and referenced npm script. Application code and dependencies are unchanged; actual service recovery must be verified after redeployment.
