# Architecture decisions

- One clinic and one shared database-backed account; no tenancy layer or external identity provider.
- Next.js App Router and TypeScript, PostgreSQL on Railway, Prisma 7 with the pg adapter. Web and scheduled sync share the same source/image.
- Argon2id password hashes, opaque hashed database sessions, same-origin mutations and global DB login throttling. No credentials in copied URLs.
- Whitelist Vapi call fields and assistant IDs. No audio, cost fields, or wholesale raw payload retention.
- Reconcile updatedAt windows with one-hour overlap; webhook delivery is not the sole source of truth.
- Staff notes use optimistic revision checks and are separate from provider-owned fields.
- Self-host fonts. No external browser analytics or third-party scripts.
- Production no-data state is explicit; demo data requires DEMO_MODE and is filtered separately.
