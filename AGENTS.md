# Tatravet dashboard

Polish single-clinic Vapi call dashboard. Follow docs/PLAN.md, docs/DESIGN.md and docs/DEPLOYMENT.md. Use /home/orion/.codex/skills/frontend-design/SKILL.md for UI changes.

Stack: Next.js App Router, TypeScript, Prisma 7 + PostgreSQL, Railway. Generate the client with npm run db:generate. Validate with npm run typecheck, npm test, npm run build. Integration/browser checks need an isolated test database; never use production.

Do not log or expose secrets, transcripts, or phone numbers. Do not overwrite staff notes in provider ingestion. Keep the assistant ID allowlist and session authorization on every private endpoint. No audio playback, Vapi costs, public signup, or multi-clinic expansion without a new request.

Use real production empty states; synthetic fixtures require DEMO_MODE=true. Public domain is https://liniavet.tatravet.pl, configured by the owner. Live Vapi verification requires the finished assistant.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
