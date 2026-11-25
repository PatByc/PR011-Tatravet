import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { db } from "../lib/db";
import { ingestCall, synchronize } from "../lib/vapi";
import { storeProviderCall } from "../lib/call-ingestion";
import { normalizeCall } from "../lib/calls";
import { dashboard } from "../lib/dashboard";
process.env.VAPI_ASSISTANT_IDS = "test-assistant";
const source = {
  id: "integration-call",
  assistantId: "test-assistant",
  createdAt: "2026-11-09T10:00:00Z",
  startedAt: "2026-11-09T10:00:10Z",
  endedAt: "2026-11-09T10:02:10Z",
  status: "ended",
  artifact: { transcript: "Treść testowa" },
  analysis: { summary: "Podsumowanie" },
};
describe.skipIf(!enabled)("PostgreSQL integration", () => {
  beforeAll(async () => {
    await db.call.deleteMany({ where: { id: { startsWith: "integration-" } } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db.call.deleteMany({ where: { id: { startsWith: "integration-" } } });
    await db.syncState.deleteMany();
    await db.$disconnect();
  });
  it("upserts concurrent duplicates, excludes foreign assistants and preserves staff notes", async () => {
    await Promise.all([ingestCall(source), ingestCall(source)]);
    expect(await db.call.count({ where: { id: source.id } })).toBe(1);
    await db.call.update({
      where: { id: source.id },
      data: { note: "Oddzwonić", followUp: "CALLBACK" },
    });
    await ingestCall({
      ...source,
      status: "ringing",
      endedAt: undefined,
      artifact: undefined,
      analysis: undefined,
    });
    const result = await db.call.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(result.status).toBe("ended");
    expect(result.transcript).toBe("Treść testowa");
    expect(result.note).toBe("Oddzwonić");
    expect(result.followUp).toBe("CALLBACK");
    expect(result.isVapiAgent).toBe(true);
    expect(
      await ingestCall({
        ...source,
        id: "integration-foreign",
        assistantId: "foreign",
      }),
    ).toBe(false);
  });
  it("keeps provider calls with the same source ID separate and protects staff notes", async () => {
    const normalized = normalizeCall(source);
    await storeProviderCall("livekit", normalized, { finalReport: true, needsCallback: true });
    const livekit = await db.call.findUniqueOrThrow({ where: { id: "livekit:integration-call" } });
    expect(livekit.isVapiAgent).toBe(false);
    expect(livekit.followUp).toBe("CALLBACK");
    expect((await db.call.findUniqueOrThrow({ where: { id: source.id } })).isVapiAgent).toBe(true);
    await db.call.update({ where: { id: livekit.id }, data: { note: "Staff note", followUp: "DONE", followUpReviewed: true } });
    await storeProviderCall("livekit", normalized, { finalReport: true, needsCallback: true });
    const updated = await db.call.findUniqueOrThrow({ where: { id: livekit.id } });
    expect(updated.note).toBe("Staff note");
    expect(updated.followUp).toBe("DONE");
    expect(updated.recordingState).toBe("NONE");
    await storeProviderCall("livekit", normalized, {
      finalReport: true, needsCallback: true,
      recording: { state: "ARCHIVED", key: "calls/livekit/integration-call/audio.oga", bytes: 1200 },
    });
    const archived = await db.call.findUniqueOrThrow({ where: { id: livekit.id } });
    expect(archived.recordingState).toBe("ARCHIVED");
    expect(archived.note).toBe("Staff note");
    await storeProviderCall("livekit", normalized, {
      finalReport: true, needsCallback: false,
      recording: { state: "FAILED", key: null, bytes: null },
    });
    const replayed = await db.call.findUniqueOrThrow({ where: { id: livekit.id } });
    expect(replayed.recordingState).toBe("ARCHIVED");
    expect(replayed.reportedAt).toEqual(archived.reportedAt);
    process.env.USE_LIVEKIT_AGENT = "true";
    try {
      const history = await dashboard(new URLSearchParams({
        from: "2026-11-09", to: "2026-11-09", q: "Treść testowa",
      }));
      expect(history.calls.map((call) => call.id)).toEqual(expect.arrayContaining([source.id, livekit.id]));
    } finally {
      delete process.env.USE_LIVEKIT_AGENT;
    }
  });
  it("records the first final report once and preserves staff resolution", async () => {
    const id = "integration-notification";
    const call = { ...source, id, createdAt: "2026-11-08T10:00:00Z", startedAt: "2026-11-08T10:00:10Z", endedAt: "2026-11-08T10:02:10Z", artifact: {
      transcript: "Test",
      messages: [{ role: "assistant", message: "Test", time: 0.5 }],
      structuredOutputs: { output: { name: "PR011 Tatravet — Powód kontaktu", result: { powodKontaktu: "Umówienie wizyty" } } },
    } };
    await ingestCall({ ...call, endedAt: undefined, status: "in-progress" });
    expect((await db.call.findUniqueOrThrow({ where: { id } })).reportedAt).toBeNull();
    await ingestCall(call, true);
    const first = await db.call.findUniqueOrThrow({ where: { id } });
    expect(first.followUp).toBe("CALLBACK");
    expect(first.reportedAt).not.toBeNull();
    expect(first.recordingState).toBe("PENDING");
    expect(first.transcriptSegments).toEqual([{ role: "assistant", text: "Test", secondsFromStart: 0.5 }]);
    await ingestCall(call, true);
    expect((await db.call.findUniqueOrThrow({ where: { id } })).reportedAt).toEqual(first.reportedAt);
    await db.call.update({ where: { id }, data: { followUp: "DONE", followUpReviewed: true } });
    await db.call.update({ where: { id }, data: { recordingState: "ARCHIVED", recordingObjectKey: "calls/test/mono" } });
    await ingestCall(call, true);
    const final = await db.call.findUniqueOrThrow({ where: { id } });
    expect(final.followUp).toBe("DONE");
    expect(final.recordingState).toBe("ARCHIVED");
    expect(final.recordingObjectKey).toBe("calls/test/mono");
  });
  it("handles sync window pagination, updates cursor only after success and keeps notes", async () => {
    process.env.VAPI_API_KEY = "test-key";
    let requests = 0;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        requests++;
        return Response.json(
          requests === 1
            ? Array.from({ length: 1000 }, () => source)
            : [source],
        );
      });
    await synchronize();
    expect(requests).toBe(3);
    expect(
      (await db.call.findUniqueOrThrow({ where: { id: source.id } })).note,
    ).toBe("Oddzwonić");
    const state = await db.syncState.findUniqueOrThrow({
      where: { id: "vapi" },
    });
    expect(state.lastSuccess).not.toBeNull();
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));
    await expect(synchronize()).rejects.toThrow();
    const failed = await db.syncState.findUniqueOrThrow({
      where: { id: "vapi" },
    });
    expect(failed.cursor).toEqual(state.cursor);
    expect(failed.error).toBe(true);
    fetchMock.mockRestore();
  });
  it("aggregates measured durations and searches transcripts", async () => {
    process.env.DEMO_MODE = "false";
    const result = await dashboard(
      new URLSearchParams({
        from: "2026-11-09",
        to: "2026-11-09",
        q: "Treść testowa",
      }),
    );
    expect(result.total).toBe(1);
    expect(result.metrics.average).toBe(120);
    expect(result.hours.find((h) => h.hour === "11:00")?.calls).toBe(1);
  });
});
