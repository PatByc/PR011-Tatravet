export type AgentProvider = "vapi" | "livekit";

/** Vapi remains the default until the separate LiveKit service is connected. */
export function activeAgentProvider(env: Record<string, string | undefined> = process.env): AgentProvider {
  const value = env.USE_LIVEKIT_AGENT;
  if (value === undefined || value === "" || value === "false") return "vapi";
  if (value === "true") return "livekit";
  throw new Error("USE_LIVEKIT_AGENT_INVALID");
}

/** Keep existing Vapi IDs stable; reserve a separate namespace for LiveKit IDs. */
export function storedCallId(provider: AgentProvider, sourceId: string): string {
  if (!sourceId || sourceId.length > 200) throw new Error("PROVIDER_CALL_ID_INVALID");
  if (provider === "vapi") return sourceId;
  const id = `livekit:${sourceId}`;
  if (id.length > 200) throw new Error("PROVIDER_CALL_ID_INVALID");
  return id;
}
