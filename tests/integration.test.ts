import { describe, expect, it } from "vitest";
import { webhookConfigured, webhookStatus } from "../lib/integration";
describe("webhook-only integration status", () => {
  it("requires a secret and assistant allowlist, but no API key", () => {
    expect(
      webhookConfigured({
        VAPI_WEBHOOK_SECRET: "x".repeat(32),
        VAPI_ASSISTANT_IDS: " assistant-id ",
      }),
    ).toBe(true);
  });
  it("rejects empty configuration and short secrets", () => {
    expect(
      webhookConfigured({
        VAPI_WEBHOOK_SECRET: "short",
        VAPI_ASSISTANT_IDS: "id",
      }),
    ).toBe(false);
    expect(
      webhookConfigured({
        VAPI_WEBHOOK_SECRET: "x".repeat(32),
        VAPI_ASSISTANT_IDS: " , ",
      }),
    ).toBe(false);
  });
  it("distinguishes demo, missing configuration, waiting and received data without an idle timeout", () => {
    expect(webhookStatus(true, false, false)).toBe("Dane przykładowe");
    expect(webhookStatus(false, false, false)).toBe(
      "Oczekiwanie na integrację",
    );
    expect(webhookStatus(false, true, false)).toBe(
      "Oczekiwanie na pierwsze połączenie",
    );
    expect(webhookStatus(false, true, true)).toBe("Odebrano dane rozmów");
  });
});
