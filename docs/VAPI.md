# Connecting the Vapi assistant (webhooks only)

The selected integration sends Vapi events directly to the dashboard. No cron service or VAPI_API_KEY is required.

## Railway dashboard service variables

Attach these to the application service, not just the shared-variable list:

- VAPI_ASSISTANT_IDS: the saved Tatravet assistant ID (comma-separated if needed).
- VAPI_WEBHOOK_SECRET: a random secret of at least 32 characters; generate with `openssl rand -hex 32`.
- DEMO_MODE: false to show real incoming calls.

Apply/deploy the variable changes. Keep PUBLIC_URL matching the address used to open the dashboard.

## Vapi configuration

1. Open Integrations → Server Configuration → Add Custom Credential.
2. Choose Bearer Token, name it Tatravet Dashboard, paste the generated secret into Token, use Authorization as Header Name, and enable Include Bearer Prefix. Leave optional payload encryption disabled; this endpoint expects ordinary JSON over HTTPS.
3. Open the saved Tatravet assistant → Advanced → Webhook Server. If a Server URL already handles tools or other business logic, preserve that integration and arrange event forwarding before replacing it.
4. Set Server URL to `https://pr011-tatravet-production.up.railway.app/api/webhooks/vapi` and select the new credential under Authorization. When the custom domain is ready, this URL can use `https://liniavet.tatravet.pl/api/webhooks/vapi` instead.
5. Enable status-update and end-of-call-report server messages. Publish the assistant settings. Configure transcript retention in Vapi as needed; summaries are optional and read from analysis.summary.
6. Make a test call, end it, and check Vapi's webhook delivery logs for a successful response with accepted: true. Refresh the dashboard or allow its 30-second refresh. Inspect the transcript, duration, and caller number when provided.

## Contact reasons in analytics

The existing Vapi output `PR011 Tatravet — Powód kontaktu` is supported. Its `result.powodKontaktu` may contain one of the Polish labels below; `result.opisPowodu` is not needed by the chart and is not stored. The older output `Tatravet Contact Reason` with `result.contactReason` codes remains supported. Do not rename or recreate the live output just for the dashboard.

| Vapi `powodKontaktu` | Dashboard category |
| --- | --- |
| Umówienie wizyty | Umówienie wizyty |
| Zmiana lub odwołanie wizyty | Zmiana lub odwołanie wizyty |
| Zdrowie zwierzęcia | Zdrowie zwierzęcia |
| Usługi i ceny | Usługi i ceny |
| Wyniki badań i leczenie | Wyniki badań i leczenie |
| Informacje o przychodni | Informacje o przychodni |
| Inne | Inne |
| Nieustalony powód | Nieustalony powód |

Vapi can finish structured extraction after the first end-of-call event. Check the `end-of-call-report` request in Vapi Webhook Logs to confirm it contains `message.artifact.structuredOutputs` (or `message.call.artifact.structuredOutputs`). Missing or unrecognized output is counted as `Nieustalony powód`. Old stored calls do not retain the original structured output, so changing the parser does not classify them retroactively. For the already observed real call, find its Vapi call ID in Vapi Logs and run `npm run classify:call -- <call-id> appointment` in the Railway app shell. This updates exactly that real call and does not require an API key or scheduled sync. Future calls classify from the webhook automatically when it contains the output.

## Callback queue from the end-of-call report

The call's `Obsługa` status starts as `Bez działania`. When the EOCR transcript contains an explicit assistant promise that the clinic will call back (for example `AI: Recepcja oddzwoni...`), ingestion marks the call `Do oddzwonienia`. The same result can be provided more reliably as a boolean `wymagaOddzwonienia` in the existing Vapi structured output. A contact reason such as `Umówienie wizyty` alone does not imply a callback. Staff edits are marked reviewed and never replaced by subsequent Vapi deliveries. The importer never automatically marks a case `Załatwione`.

After deploying the migration, run `npm run backfill:callbacks` once in the Railway app shell to evaluate already stored real-call transcripts. It only changes unreviewed `Bez działania` calls with an explicit assistant callback promise; it does not read Vapi or send any data outside Railway.

Source: [Vapi structured outputs](https://docs.vapi.ai/assistants/structured-outputs).

Sources: [Vapi events](https://docs.vapi.ai/server-url/events), [server credentials](https://docs.vapi.ai/server-url/server-authentication), [server URL setup](https://docs.vapi.ai/server-url/setting-server-urls).

## Behavior and troubleshooting

Only allowlisted assistant IDs are ingested. Credentials use `Authorization: Bearer <secret>`; this is not the Vapi API key. Unknown events are acknowledged without processing. Duplicate delivery updates one call record and preserves staff notes/statuses.

- 401: bearer credential missing or mismatched.
- 503: webhook secret missing/too short, or another service availability problem; inspect deployment logs.
- 400: malformed or unsupported call payload; share only a redacted example for diagnosis.
- 200 with accepted: false: assistant ID does not match the allowlist.
- Successful delivery but no visible calls: verify DEMO_MODE=false and the selected date range.

The dashboard reports waiting until its first accepted event and then shows the last received time. A quiet phone line does not count as a synchronization failure.

Webhooks store only selected metadata, transcripts, and available summaries. They do not import historic calls. Calls/events never delivered to this endpoint cannot appear automatically. The legacy sync script remains in the repository but is not part of the selected deployment; do not create the cron service.
