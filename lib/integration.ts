export function webhookConfigured(env: {
  VAPI_WEBHOOK_SECRET?: string;
  VAPI_ASSISTANT_IDS?: string;
}) {
  return Boolean(
    env.VAPI_WEBHOOK_SECRET &&
    env.VAPI_WEBHOOK_SECRET.length >= 32 &&
    env.VAPI_ASSISTANT_IDS?.split(",").some((id) => id.trim()),
  );
}
export function webhookStatus(
  demo: boolean,
  configured: boolean,
  received: boolean,
) {
  if (demo) return "Dane przykładowe";
  if (!configured) return "Oczekiwanie na integrację";
  return received
    ? "Odebrano dane rozmów"
    : "Oczekiwanie na pierwsze połączenie";
}
