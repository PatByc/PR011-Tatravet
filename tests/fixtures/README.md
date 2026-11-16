# Reconstructed EOCR fixture

`reconstructed-last-eocr.json` is a privacy-safe reconstruction of the structured output shared in the conversation on 16 November 2026. It is **not** a copy of the raw Vapi webhook. Its call ID, assistant ID, timestamps, ending reason, and description are synthetic; it contains no phone number, transcript, credentials, or patient name.

The unit test confirms that the webhook-shaped call is classified as `appointment` and `CALLBACK` by the new deterministic rule. Run `npm test` to check it without a database or another voice call. The isolated browser test also checks that a new callback appears as `Nowe połączenie` with `Wymaga oddzwonienia.` Full webhook, database, SSE, and browser checks still require `TEST_DATABASE_URL` pointing to an isolated migrated database. Never replay this fixture into the clinic's production database.

To reproduce an exact provider payload, export the latest `end-of-call-report` from Vapi Webhook Logs, remove personal data and credentials, and replace this fixture only after reviewing the remaining fields.
