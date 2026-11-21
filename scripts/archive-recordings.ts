import { archivePendingRecordings } from "../lib/recordings";
import { db } from "../lib/db";
import { logFailure } from "../lib/diagnostics";

try {
  const result = await archivePendingRecordings();
  process.stdout.write(`recording_archive: ${JSON.stringify(result)}\n`);
  if (result.failed) process.exitCode = 1;
} catch (error) {
  logFailure("recording_archive_failed", error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
