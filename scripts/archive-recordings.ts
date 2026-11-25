import { archivePendingRecordings } from "../lib/recordings";
import { replayLivekitReports } from "../lib/livekit-outbox";
import { db } from "../lib/db";
import { logFailure } from "../lib/diagnostics";

try {
  const results = await Promise.allSettled([archivePendingRecordings(), replayLivekitReports()]);
  for (const [index, result] of results.entries()) {
    const label = index === 0 ? "recording_archive" : "livekit_report_replay";
    if (result.status === "fulfilled") {
      process.stdout.write(`${label}: ${JSON.stringify(result.value)}\n`);
      if (result.value.failed) process.exitCode = 1;
    } else {
      logFailure(`${label}_failed`, result.reason);
      process.exitCode = 1;
    }
  }
} finally {
  await db.$disconnect();
}
