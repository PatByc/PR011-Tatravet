# PR011 LiveKit worker — Railway handoff

This directory is the deployable copy of the PR011 GPT-Live agent from
`PatByc/voice-ai-agentic-builder` commit
`1903d46f30f41a9377183e8c0e1ce5a67dd45d95`. This copy runs as its own
Railway service. Its GPT-Live voice is now Marin, and its prompt instructs the
agent to stay silent while client delegation is pending. The Upstash query
behavior and pinned dependencies remain the same.

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
`/livekit-agent` root contains both `agent.py` and `livekit_upstash_faq.py`.

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
python test_upstash_faq.py
```

The Upstash check must report results sourced from
`KB_PR011_Tatravet_v2.md`. `settings.json` must select `gpt-live-client`,
`openai/gpt-live-1`, Marin (`marin`), `delegation="client"`, and agent name
`pr011-tatravet`. The query uses namespace `pr011-faq` with `topK: 3`.

## Acceptance and routing boundary

Railway logs must show a persistent registered worker named
`pr011-tatravet`, with no missing-variable, import, prompt, or authentication
error. A successful build alone is insufficient.

Before any SIP change, dispatch a browser/Agent Console room to that name and
check the greeting plays once, Marin speech, one successful Upstash delegation
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
After the browser test, use only a staging SIP route for telephone testing.
Production Telnyx/SIP routing and Vapi V2 remain unchanged until an explicit
cutover request.

If the worker is unhealthy, stop staging dispatches to `pr011-tatravet`, let
active calls drain, restore the previous staging destination, and retain room
IDs and Railway logs. Do not delete the Vapi assistant, LiveKit project, SIP
trunk, or Upstash index. Session reports in `.tmp/livekit-session-reports/`
are ephemeral on Railway.
