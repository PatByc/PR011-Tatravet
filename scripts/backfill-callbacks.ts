import "dotenv/config";
import { db } from "../lib/db";
import { assistantPromisedCallback } from "../lib/calls";

async function main() {
  let cursor: string | undefined;
  let updated = 0;
  for (;;) {
    const calls = await db.call.findMany({
      where: { isDemo: false, followUp: "NONE", followUpReviewed: false, revision: 0, transcript: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, transcript: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    if (!calls.length) break;
    for (const call of calls) {
      if (!assistantPromisedCallback(call.transcript)) continue;
      const result = await db.call.updateMany({
        where: { id: call.id, isDemo: false, followUp: "NONE", followUpReviewed: false, revision: 0 },
        data: { followUp: "CALLBACK" },
      });
      updated += result.count;
    }
    cursor = calls.at(-1)?.id;
  }
  console.log(`Updated ${updated} real calls with an explicit assistant callback promise.`);
}

main()
  .catch((error) => {
    console.error(error.name);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
