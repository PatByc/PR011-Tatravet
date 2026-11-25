import { describe, expect, it } from "vitest";
import { activeAgentProvider, storedCallId } from "../lib/agent-provider";

describe("agent provider selection", () => {
  it("defaults to Vapi and selects LiveKit only when explicitly enabled", () => {
    expect(activeAgentProvider({})).toBe("vapi");
    expect(activeAgentProvider({ USE_LIVEKIT_AGENT: "false" })).toBe("vapi");
    expect(activeAgentProvider({ USE_LIVEKIT_AGENT: "true" })).toBe("livekit");
    expect(() => activeAgentProvider({ USE_LIVEKIT_AGENT: "1" })).toThrow("USE_LIVEKIT_AGENT_INVALID");
  });

  it("preserves Vapi IDs and namespaces future LiveKit IDs", () => {
    expect(storedCallId("vapi", "same-call")).toBe("same-call");
    expect(storedCallId("livekit", "same-call")).toBe("livekit:same-call");
    expect(() => storedCallId("livekit", "x".repeat(193))).toThrow("PROVIDER_CALL_ID_INVALID");
  });
});
