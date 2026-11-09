# Connecting the Vapi assistant

The assistant is still being built. The app can be reviewed with isolated demo fixtures before connection.

## Configure

1. Set VAPI_API_KEY and VAPI_ASSISTANT_IDS in Railway. Use only this clinic's assistant IDs. Set the same values on the cron service.
2. Generate a random VAPI_WEBHOOK_SECRET of at least 32 characters. Configure a Vapi Custom Credential that sends `Authorization: Bearer <secret>`.
3. Set the assistant's server URL to `https://liniavet.tatravet.pl/api/webhooks/vapi`, referencing that credential.
4. Include `status-update` and `end-of-call-report` in server messages. Preserve existing server handlers/tool settings when configuring the assistant; if it already uses a server URL for tools, explicitly route these event types through that existing integration rather than overwriting it blindly.
5. Ensure the assistant produces transcripts. Summaries are optional and read from `analysis.summary`; no separate model is called by this dashboard.
6. Enable Railway cron, then make a test call and verify transcript, duration, and caller number where available.

Sources: [Vapi events](https://docs.vapi.ai/server-url/events), [server credentials](https://docs.vapi.ai/server-url/server-authentication), [list calls](https://docs.vapi.ai/api-reference/calls/list).

## Data boundary

Only configured assistant IDs are ingested. Webhooks require the bearer credential and have a 2 MB payload limit. Unknown event types are acknowledged without processing. Invalid call shapes return 400; database failures return 500 so they are not mistaken for accepted delivery.

The adapter stores call ID, assistant ID, available caller number, timestamps, duration, status, termination reason, transcript, and summary. It strips costs, recordings, prompts, tool messages and other unused fields. Notes, follow-up status, and note revision belong to staff and are never overwritten by Vapi updates. PostgreSQL transaction locks serialize duplicate/overlapping imports.

The first sync fetches records updated within the previous 30 days. Subsequent runs start one hour before the last successful cursor and end at the start of the current run, catching delayed post-call artifacts. API windows reaching 1,000 records are recursively divided instead of assuming sort order or dropping records with the same timestamp. Dense windows that cannot be divided fail visibly without advancing the cursor. API 429/5xx failures are retried; failures preserve the cursor for the next scheduled run.

Records older than the initial window are not automatically backfilled. Call lists refresh every 30 seconds while visible. The daily analytics count calls by their local start date in Warsaw. Missing durations are excluded from averages. Technical termination categories are not booking conversion metrics.

For live acceptance, confirm one inbound call, one failed/interrupted call, a missing/withheld caller number if available, and a delayed transcript. Replay a completed report and confirm only one row exists and its staff note is unchanged. Validate these with the finished assistant before production use.
