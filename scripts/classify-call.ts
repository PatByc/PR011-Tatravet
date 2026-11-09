import "dotenv/config";
import { db } from "../lib/db";
import { contactReasons } from "../lib/calls";

async function main() {
  const [callId, reason] = process.argv.slice(2);
  if (!callId || !reason || !Object.hasOwn(contactReasons, reason)) {
    throw new Error(`Usage: npm run classify:call -- <Vapi call ID> <${Object.keys(contactReasons).join("|")}>`);
  }
  const result = await db.call.updateMany({
    where: { id: callId, isDemo: false },
    data: { contactReason: reason },
  });
  if (result.count !== 1) throw new Error("Real call with that ID was not found.");
  console.log("Contact reason updated for one real call.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
