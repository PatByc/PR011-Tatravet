import { db } from "./db";
import { callbackRequired, normalizeCall, mergeCall, vapiCallSchema } from "./calls";
export const assistantIds = () =>
  (process.env.VAPI_ASSISTANT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export async function ingestCall(raw: unknown) {
  const call = vapiCallSchema.parse(raw);
  if (!assistantIds().includes(call.assistantId)) return false;
  const normalized = normalizeCall(call);
  const needsCallback = callbackRequired(call);
  await db.$transaction(async (tx) => {
    // Serialize webhook and cron writes for the same call, including its first insert.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${call.id}))::text`;
    const existing = await tx.call.findUnique({ where: { id: call.id } });
    const data = existing ? mergeCall(existing, normalized) : normalized;
    const followUp = existing && (existing.followUpReviewed || existing.revision > 0)
      ? existing.followUp
      : needsCallback || existing?.followUp === "CALLBACK"
        ? "CALLBACK"
        : "NONE";
    await tx.call.upsert({
      where: { id: call.id },
      create: { ...data, followUp },
      update: { ...data, followUp },
    });
  });
  return true;
}
async function fetchCalls(params: URLSearchParams): Promise<unknown[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://api.vapi.ai/call?${params}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
    } catch {
      if (attempt === 3) throw new Error("VapiUnavailable");
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (response.ok) {
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error("InvalidVapiResponse");
      return value;
    }
    if (response.status !== 429 && response.status < 500)
      throw new Error("VapiRequestRejected");
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error("VapiUnavailable");
}
// Divide timestamp windows if the provider reaches its result limit; this avoids
// relying on undocumented sort order or skipping calls with equal timestamps.
async function importWindow(
  assistantId: string,
  from: Date,
  to: Date,
): Promise<void> {
  const params = new URLSearchParams({
    assistantId,
    limit: "1000",
    updatedAtGe: from.toISOString(),
    updatedAtLe: to.toISOString(),
  });
  const calls = await fetchCalls(params);
  if (calls.length >= 1000) {
    if (+to - +from < 2) throw new Error("VapiWindowTooDense");
    const mid = new Date(Math.floor((+from + +to) / 2));
    await importWindow(assistantId, from, mid);
    await importWindow(assistantId, mid, to);
  } else for (const call of calls) await ingestCall(call);
}
export async function synchronize() {
  if (!process.env.VAPI_API_KEY || !assistantIds().length)
    throw new Error("MissingVapiConfiguration");
  const state = await db.syncState.findUnique({ where: { id: "vapi" } });
  const end = new Date();
  const start = state?.cursor
    ? new Date(+state.cursor - 3600_000)
    : new Date(+end - 30 * 86400_000);
  try {
    for (const id of assistantIds()) await importWindow(id, start, end);
    await db.syncState.upsert({
      where: { id: "vapi" },
      create: { id: "vapi", cursor: end, lastSuccess: new Date() },
      update: { cursor: end, lastSuccess: new Date(), error: false },
    });
  } catch (error) {
    await db.syncState.upsert({
      where: { id: "vapi" },
      create: { id: "vapi", error: true },
      update: { error: true },
    });
    throw error;
  }
}
