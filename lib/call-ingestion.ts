import { db } from "./db";
import { mergeCall, storedTranscriptSegments, type NormalizedCall } from "./calls";
import { storedCallId, type AgentProvider } from "./agent-provider";

/** Called only after a provider adapter has authenticated and allowlisted its source. */
export async function storeProviderCall(
  provider: AgentProvider,
  call: NormalizedCall,
  options: { finalReport: boolean; needsCallback: boolean },
) {
  const id = storedCallId(provider, call.id);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
    const existing = await tx.call.findUnique({ where: { id } });
    if (existing && existing.isVapiAgent !== (provider === "vapi"))
      throw new Error("PROVIDER_CALL_ID_COLLISION");
    const incoming = { ...call, id };
    const data = existing
      ? mergeCall({ ...existing, transcriptSegments: storedTranscriptSegments(existing.transcriptSegments) }, incoming)
      : incoming;
    const { transcriptSegments, ...fields } = data;
    const segmentField = transcriptSegments ? { transcriptSegments } : {};
    const followUp = existing && (existing.followUpReviewed || existing.revision > 0)
      ? existing.followUp
      : options.finalReport
        ? options.needsCallback ? "CALLBACK" : "NONE"
        : existing?.followUp || "NONE";
    await tx.call.upsert({
      where: { id },
      create: {
        ...fields, ...segmentField, isVapiAgent: provider === "vapi", followUp,
        reportedAt: options.finalReport ? new Date() : null,
        recordingState: options.finalReport && provider === "vapi" ? "PENDING" : "NONE",
      },
      update: {
        ...fields, ...segmentField, followUp,
        reportedAt: existing?.reportedAt || (options.finalReport ? new Date() : null),
        ...(options.finalReport && provider === "vapi" && existing?.recordingState === "NONE"
          ? { recordingState: "PENDING" } : {}),
      },
    });
  });
}
