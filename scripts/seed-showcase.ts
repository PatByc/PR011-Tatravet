import "dotenv/config";
import { db } from "../lib/db";

const samples = [
  { id: "demo-0", start: "2026-11-09T09:15:00.000Z", reason: "appointment" },
  { id: "demo-1", start: "2026-11-09T11:40:00.000Z", reason: "animal_health" },
  { id: "demo-2", start: "2026-11-09T15:05:00.000Z", reason: "clinic_info" },
] as const;

async function main() {
  if (process.env.DEMO_MODE !== "false")
    throw new Error("Set DEMO_MODE=false on the dashboard service before adding showcase calls.");

  const sources = await db.call.findMany({
    where: { id: { in: samples.map((sample) => sample.id) }, isDemo: true },
  });
  if (sources.length !== samples.length)
    throw new Error("Expected demo-0, demo-1 and demo-2. Run the demo seed first.");
  const byId = new Map(sources.map((source) => [source.id, source]));

  const created = await db.$transaction(async (tx) => {
    let count = 0;
    for (const [index, sample] of samples.entries()) {
      const id = `showcase-20261109-${index + 1}`;
      const existing = await tx.call.findUnique({ where: { id } });
      if (existing) {
        if (existing.assistantId !== "showcase")
          throw new Error("Showcase ID conflicts with an existing call.");
        continue;
      }
      const source = byId.get(sample.id)!;
      const startedAt = new Date(sample.start);
      const endedAt = source.duration === null
        ? null
        : new Date(startedAt.getTime() + source.duration * 1000);
      await tx.call.create({
        data: {
          id,
          assistantId: "showcase",
          caller: source.caller,
          startedAt,
          endedAt,
          duration: source.duration,
          status: source.status,
          endedReason: source.endedReason,
          transcript: source.transcript,
          summary: `Przykładowa rozmowa — ${source.summary || "bez podsumowania"}`,
          contactReason: sample.reason,
          sourceUpdatedAt: endedAt || startedAt,
          followUp: source.followUp,
          followUpReviewed: true,
          note: "Dane przykładowe do prezentacji panelu.",
          isDemo: false,
        },
      });
      count++;
    }
    return count;
  });
  console.log(`Added ${created} showcase calls dated 2026-11-09. Total showcase calls: 3.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
