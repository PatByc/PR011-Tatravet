import "dotenv/config";
import { synchronize } from "../lib/vapi";
import { db } from "../lib/db";
synchronize()
  .then(() => console.log("Synchronization complete"))
  .catch((error) => {
    console.error(
      "Synchronization failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
