import { describe, expect, it } from "vitest";
import { livekitRecordingKey, livekitReportSchema, normalizeLivekitReport, verifyLivekitBearer } from "../lib/livekit-report";
import { callbackRequiredForReason } from "../lib/calls";

const report = {
  version: 1, provider: "livekit", agentName: "pr011-tatravet",
  roomId: "RM_Test123", jobId: "AJ_Test123", caller: "+48123456789",
  startedAt: "2026-11-25T12:00:00Z", endedAt: "2026-11-25T12:01:10Z",
  endReason: null,
  turns: [
    { role: "user", text: "Proszę o wizytę.", secondsFromStart: 4 },
    { role: "assistant", text: "Recepcja oddzwoni.", secondsFromStart: 8 },
  ],
  summary: "Prośba o wizytę.", contactReason: "appointment", analysisOk: true,
  recording: { state: "ARCHIVED", key: "calls/livekit/RM_Test123/audio.oga", bytes: 1200 },
} as const;

describe("LiveKit EOCR normalization", () => {
  it("keeps timed turns, duration, provider identity and callback mapping", () => {
    const parsed = livekitReportSchema.parse(report);
    const call = normalizeLivekitReport(parsed);
    expect(call.id).toBe("RM_Test123");
    expect(call.duration).toBe(70);
    expect(call.transcriptSegments).toEqual(report.turns);
    expect(call.transcript).toContain("Rozmówca: Proszę o wizytę.");
    expect(callbackRequiredForReason(call.contactReason)).toBe(true);
    expect(livekitRecordingKey(parsed.roomId)).toBe(parsed.recording.key);
    expect(parsed.urgent).toBe(false);
    expect(livekitReportSchema.parse({ ...report, urgent: true }).urgent).toBe(true);
  });

  it("rejects invalid dates, reasons and identifiers", () => {
    expect(livekitReportSchema.safeParse({ ...report, roomId: "bad" }).success).toBe(false);
    expect(livekitReportSchema.safeParse({ ...report, contactReason: "invented" }).success).toBe(false);
    expect(livekitReportSchema.safeParse({ ...report, urgent: "yes" }).success).toBe(false);
    const reversed = livekitReportSchema.parse({ ...report, endedAt: "2026-11-25T11:59:00Z" });
    expect(() => normalizeLivekitReport(reversed)).toThrow("LIVEKIT_REPORT_TIME_INVALID");
  });

  it("requires the dedicated report bearer", () => {
    const secret = "synthetic-secret-value-with-at-least-32-characters";
    expect(verifyLivekitBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyLivekitBearer("Bearer wrong", secret)).toBe(false);
    expect(verifyLivekitBearer(null, secret)).toBe(false);
    expect(verifyLivekitBearer(`Bearer ${secret}`, undefined)).toBe(false);
  });
});
