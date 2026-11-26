# PR011 LiveKit worker — Railway handoff

This directory is the deployable copy of the PR011 GPT-Live agent from
`PatByc/voice-ai-agentic-builder` commit
`1903d46f30f41a9377183e8c0e1ce5a67dd45d95`. This copy runs as its own
Railway service. Its GPT-Live voice is Cedar, and its prompt instructs the
agent to stay silent while client delegation is pending. Opening-hours questions
now use a specific FAQ query and accept only the matching approved result; an
unrelated result yields an unconfirmed-hours answer. The Upstash index and pinned
dependencies remain the same.

## Railway service

Create a **new** service in the existing PR011 Railway project. Connect this
repository (`PatByc/PR011-Tatravet`), branch `main`.

| Setting | Value |
| --- | --- |
| Root Directory | `/livekit-agent` |
| Railway Config File | `/livekit-agent/railway.json` |
| Builder | Railpack, Python 3.12 |
| Build Command | `pip install --no-cache-dir -r requirements.txt` |
| Start Command | `python agent.py start --drain-timeout 600` |
| Replicas | One, always running, European region |
| Public domain / health check / cron | None |

The service-specific config file is essential: the repository's root
`/railway.json` belongs to the Next.js dashboard and would otherwise select its
Dockerfile, migration command, `npm start`, and web health check. Check the
**effective** deployment settings before releasing the new worker. The
`/livekit-agent` root contains `agent.py`, `temporal_context.py`, and
`livekit_upstash_faq.py`.

Set these variables on the **LiveKit worker service only**. Use actual values
from the intended LiveKit Cloud project and PR011 Upstash index; never commit or
print them:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
PR011_UPSTASH_VECTOR_REST_URL
PR011_UPSTASH_VECTOR_REST_TOKEN
PR011_LIVEKIT_VARIANT=gpt-live-client
PYTHONUNBUFFERED=1
```

The config file grants 600 seconds of Railway deployment draining. Keep the
service on restart-on-failure. Do not add `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`,
or `GOOGLE_API_KEY` for this LiveKit Inference route. The dashboard's
`USE_LIVEKIT_AGENT` stays false until a separate request connects LiveKit calls
to dashboard ingestion and changes phone routing.

## Pre-deployment checks

From this directory, with the five real credentials in the environment or an
ignored `.env`:

```bash
python -m py_compile agent.py
python -m unittest test_temporal_context.py test_agent_runtime.py
python test_upstash_faq.py
```

The Upstash check must report results sourced from
`KB_PR011_Tatravet_v2.md`. `settings.json` must select `gpt-live-client`,
`openai/gpt-live-1`, Cedar (`cedar`), `delegation="client"`, and agent name
`pr011-tatravet`. The query uses namespace `pr011-faq` with `topK: 3`.

## Acceptance and routing boundary

For urgent veterinary situations, the agent gives a short referral to a 24-hour veterinary clinic and closes without promising a callback, transfer or urgent appointment. It reads today's opening status from the approved Upstash hours entry at session start; missing or holiday-specific hours remain unknown. Routine after-hours questions do not receive the urgent callback status. The post-call report now includes a boolean `urgent`; deploy the dashboard webhook that accepts it before deploying this worker. Check a synthetic urgent call and an ordinary after-hours question in an isolated environment before a live SIP acceptance call.

Railway logs must show a persistent registered worker named
`pr011-tatravet`, with no missing-variable, import, prompt, or authentication
error. A successful build alone is insufficient.

Before any SIP change, dispatch a browser/Agent Console room to that name and
check the greeting plays once, Cedar speech, one successful Upstash delegation
for the Saturday-hours question, `knowledge_status: ok`, logged Upstash
duration, factual answers without a retrieval preamble, and farewell/room
closure. Use these exact caller prompts:

```text
W jakich godzinach klinika jest otwarta w sobotę?
Czy wykonujecie USG?
Jak przygotować psa do badania krwi?
Ile kosztuje konsultacja?
Czy możecie sprawdzić wolny termin na jutro?
Dziękuję, to wszystko. Do widzenia.
```

Expected facts: Saturday 10:00–15:00; USG is available; blood-test preparation
is 12 hours fasting with a small amount of water two hours before, subject to
individual instructions. Do not invent a consultation price or calendar access.
For the Saturday-hours question, the first spoken words after delegation must
give the hours directly. Also ask `Jakich lekarzy weterynarii macie?`; the
answer should begin `W Tatravet pracują…`. In LiveKit Cloud → Sessions → Agent
insights → Transcript, confirm neither answer contains `sprawdzam`, `już
sprawdzam`, `zaraz sprawdzę`, `już podpowiem`, `chwileczkę`, or another progress
update before the factual answer.
Also test `Jak pracujecie jutro?` and then `A pojutrze?` on a known weekday.
Each answer must use the weekday resolved from Europe/Warsaw at the start of
that call. The FAQ search receives that resolved weekday; the agent must not
assume ordinary opening hours apply on public holidays.
On a Thursday, `Jak pracujecie jutro?` must resolve to Friday and, if the
approved opening-hours FAQ is returned, state 08:00–20:00. A blood-test FAQ
result must never be used as the answer to an opening-hours question; if the
opening-hours FAQ is absent, the agent must say the hours are unconfirmed.
Then ask `A jaki jest dzień jutro?`. The answer must identify Friday and its
Poland-local calendar date without an Upstash lookup or any clinic FAQ facts.
For SIP calls, the agent's Context contains a validated caller number from
`sip.phoneNumber` or the `sip_` identity. Browser sessions and calls without a
valid number say it is unavailable. The agent must not read the number aloud.
After the browser test, use only a staging SIP route for telephone testing.
Production Telnyx/SIP routing and Vapi V2 remain unchanged until an explicit
cutover request.

If the worker is unhealthy, stop staging dispatches to `pr011-tatravet`, let
active calls drain, restore the previous staging destination, and retain room
IDs and Railway logs. Do not delete the Vapi assistant, LiveKit project, SIP
trunk, or Upstash index. Session reports in `.tmp/livekit-session-reports/`
are ephemeral on Railway.

## Dashboard EOCR integration

After the dashboard LiveKit webhook is deployed, add `LIVEKIT_EOCR_URL` and `LIVEKIT_EOCR_SECRET` to this worker and attach the existing private `Recordings` bucket credentials. The URL points to the dashboard's Railway private domain and `/api/webhooks/livekit`. The dashboard and recording archive cron need the same secret; the cron retries queued reports from the bucket. See the root `docs/DEPLOYMENT.md` for the variable matrix. This worker needs no dashboard database credentials. Browser rooms retain local diagnostics but do not enter production call history. The owner handles Telnyx/SIP routing manually.
Set `LIVEKIT_EOCR_INCLUDE_BROWSER=true` only on an isolated test worker linked to an isolated dashboard database when checking browser-room ingestion. Keep it false or unset on the production worker.
