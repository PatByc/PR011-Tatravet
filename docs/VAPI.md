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

Create a Vapi structured output named exactly `Tatravet Contact Reason` and attach its ID to the saved assistant's `artifactPlan.structuredOutputIds` (preserve any existing IDs). Use this JSON schema:

```json
{
  "type": "object",
  "properties": {
    "contactReason": {
      "type": "string",
      "enum": ["appointment", "appointment_change", "animal_health", "services_prices", "test_results", "clinic_info", "other", "unknown"],
      "description": "One main reason for the call. appointment: book a visit; appointment_change: change or cancel; animal_health: pet health question; services_prices: services or prices; test_results: test results or ongoing treatment; clinic_info: opening hours, location or preparation; other: another clear topic; unknown: silence, interrupted or insufficient information."
    }
  },
  "required": ["contactReason"]
}
```

The dashboard accepts that output from `call.artifact.structuredOutputs`, or `call.analysis.structuredData.contactReason` for older analysis setups. It only accepts these exact codes. Missing/invalid output is counted as `Nieustalony powód`. Vapi may deliver analysis after the first end-of-call event; verify a classified call in webhook logs before relying on the chart. Existing calls need a new report to be classified. Demo calls can be updated with `npm run seed:demo` after migration.

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
