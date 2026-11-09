import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { db } from "../lib/db";
import { ingestCall, synchronize } from "../lib/vapi";
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
    expect(
      await ingestCall({
        ...source,
        id: "integration-foreign",
        assistantId: "foreign",
      }),
    ).toBe(false);
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
