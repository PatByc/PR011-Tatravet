import { describe, expect, it } from "vitest";
import {
  callbackRequired,
  normalizeCall,
  mergeCall,
  terminationCategory,
  vapiCallSchema,
} from "../lib/calls";
import { dateRange, dayKey } from "../lib/dates";
const source = {
  id: "call-1",
  assistantId: "clinic",
  createdAt: "2026-11-09T08:00:00Z",
  startedAt: "2026-11-09T08:00:10Z",
};
describe("Vapi ingestion rules", () => {
  it("does not invent durations without a known start", () => {
    expect(
      normalizeCall({
        ...source,
        startedAt: undefined,
        endedAt: "2026-11-09T08:02:00Z",
      }).duration,
    ).toBeNull();
  });
  it("calculates duration and strips unrelated data", () => {
    const parsed = vapiCallSchema.parse({
      ...source,
      endedAt: "2026-11-09T08:02:00Z",
      cost: 55,
      recordingUrl: "https://private",
      analysis: { summary: "Opis" },
    });
    const call = normalizeCall(parsed);
    expect(call.duration).toBe(110);
    expect(call).not.toHaveProperty("cost");
    expect(call).not.toHaveProperty("recordingUrl");
  });
  it("keeps final status and artifacts after a late ringing event", () => {
    const ended = normalizeCall({
      ...source,
      status: "ended",
      endedAt: "2026-11-09T08:02:00Z",
      artifact: { transcript: "Rozmowa" },
    });
    const ringing = normalizeCall({ ...source, status: "ringing" });
    const result = mergeCall(ended, ringing);
    expect(result.status).toBe("ended");
    expect(result.transcript).toBe("Rozmowa");
    expect(result.duration).toBe(110);
  });
  it("reads only the named Vapi classification and preserves it through late events", () => {
    const report = vapiCallSchema.parse({
      ...source,
      artifact: { structuredOutputs: {
        "id-1": { name: "Tatravet Contact Reason", result: { contactReason: "appointment" } },
      } },
    });
    const classified = normalizeCall(report);
    expect(classified.contactReason).toBe("appointment");
    expect(mergeCall(classified, normalizeCall(source)).contactReason).toBe("appointment");
    expect(normalizeCall(vapiCallSchema.parse({ ...source, analysis: { structuredData: { contactReason: "invalid" } } })).contactReason).toBeNull();
  });
  it("reads the actual Polish structured output without storing its free-text description", () => {
    const parsed = vapiCallSchema.parse({
      ...source,
      artifact: { structuredOutputs: {
        "2a36db92-72dd-418c-a73d-c7effcdfeab6": {
          name: "PR011 Tatravet — Powód kontaktu",
          result: { opisPowodu: "przykładowy opis", powodKontaktu: "Umówienie wizyty" },
        },
      } },
    });
    const call = normalizeCall(parsed);
    expect(call.contactReason).toBe("appointment");
    expect(call).not.toHaveProperty("opisPowodu");
  });
  it("does not infer callback status from the transcript", () => {
    const call = vapiCallSchema.parse({
      ...source,
      transcript: "User: Proszę o termin.\nAI: Recepcja oddzwoni, jak tylko będzie mogła.",
    });
    expect(callbackRequired(call)).toBe(false);
    expect(callbackRequired(vapiCallSchema.parse({ ...source, transcript: "User: Czy recepcja oddzwoni?\nAI: Dziękuję za rozmowę." }))).toBe(false);
  });
  it("uses an explicit Vapi callback decision when provided", () => {
    const call = vapiCallSchema.parse({
      ...source,
      artifact: { structuredOutputs: {
        output: { name: "PR011 Tatravet — Powód kontaktu", result: { wymagaOddzwonienia: true } },
      } },
    });
    expect(callbackRequired(call)).toBe(true);
    expect(callbackRequired(vapiCallSchema.parse({ ...source, analysis: { structuredData: { wymagaOddzwonienia: false } }, transcript: "AI: Recepcja oddzwoni." }))).toBe(false);
    expect(callbackRequired(vapiCallSchema.parse(source))).toBe(false);
  });
  it("fills missing transcript from delayed report and excludes staff-owned fields", () => {
    const old = {
      ...normalizeCall({
        ...source,
        status: "ended",
        updatedAt: "2026-11-09T08:05:00Z",
      }),
      note: "Keep me",
      followUp: "CALLBACK",
      revision: 2,
    };
    const incoming = normalizeCall({
      ...source,
      status: "ended",
      transcript: "Treść",
    });
    const result = mergeCall(old, incoming);
    expect(result.transcript).toBe("Treść");
    expect(result).not.toHaveProperty("note");
    expect(result).not.toHaveProperty("followUp");
    expect(result).not.toHaveProperty("revision");
  });
  it("does not count completion as a booking", () => {
    expect(terminationCategory("customer-ended-call", "ended")).toBe(
      "Zakończone",
    );
    expect(terminationCategory("pipeline-error", "ended")).toBe(
      "Błąd techniczny",
    );
  });
});
describe("Warsaw date boundaries", () => {
  it("uses local midnight", () => {
    expect(dayKey(new Date("2026-11-08T23:30:00Z"))).toBe("2026-11-09");
  });
  it("handles 23-hour spring days and 25-hour autumn days", () => {
    const spring = dateRange("2026-03-29", "2026-03-29"),
      autumn = dateRange("2026-10-25", "2026-10-25");
    expect(+spring.lt - +spring.gte).toBe(23 * 3600000);
    expect(+autumn.lt - +autumn.gte).toBe(25 * 3600000);
  });
  it("rejects reversed and impossible dates", () => {
    expect(() => dateRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => dateRange("2026-11-09", "2026-11-01")).toThrow();
  });
});
