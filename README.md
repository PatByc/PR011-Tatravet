# Tatravet — panel połączeń

Polish dashboard for one veterinary clinic. Next.js + TypeScript, PostgreSQL/Prisma, Railway. Includes shared-account login, call history and transcripts, callback status and notes, and descriptive analytics. No audio playback or cost reporting.

## Run locally

Requires Node 22.12+ and PostgreSQL 16+.

```bash
npm ci
cp .env.example .env
# Set DATABASE_URL and PUBLIC_URL in .env.
npm run db:generate
npm run db:migrate
# Supply CLINIC_USERNAME and CLINIC_PASSWORD securely in your environment.
npm run account
npm run dev
```

Open http://localhost:3000. Use a password of at least 12 characters. `npm run account` creates the shared account or resets its username/password and invalidates its sessions. Remove the bootstrap password from the environment after use. There are no default credentials.

For a demonstration, use a separate database, set `DEMO_MODE=true`, and run `npm run seed:demo`. Demo calls are explicitly labelled, use fictional numbers, and are excluded when `DEMO_MODE=false`. The demo is still protected by login. Production never falls back to sample data.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

Database integration tests are opt-in: provide `TEST_DATABASE_URL` pointing to an isolated, migrated test database. They insert/remove records prefixed `integration-` and reset synchronization state. Never point tests at production.

```bash
TEST_DATABASE_URL=postgresql://... npm test
```

Browser tests require a migrated test database containing demo fixtures and the test-only account `test-clinic` / `Test-only-password-123!`. Create them with `npm run account` and `npm run seed:demo` against that isolated database. The browser runner starts a production build on port 3111 with demo mode enabled.

```bash
npx playwright install chromium
npm run build
TEST_DATABASE_URL=postgresql://... npm run test:e2e
```

Screenshots and failure traces are written to `test-results/` (gitignored).

## Operations

See [Railway deployment](docs/DEPLOYMENT.md), [Vapi integration](docs/VAPI.md), [design direction](docs/DESIGN.md), and [implementation plan](docs/PLAN.md).

Dates and analytics use Europe/Warsaw. Durations exclude calls without a known start/end. A completed call is not treated as a booked appointment. The callback queue includes all days; regular call filters and analytics use the selected range. Concurrent note edits are rejected instead of silently overwriting someone else's work.
