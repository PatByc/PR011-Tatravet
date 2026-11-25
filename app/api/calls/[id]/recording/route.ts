import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, HttpError } from "@/lib/http";
import { recordingPlaybackUrl } from "@/lib/recordings";
import { assistantIds } from "@/lib/vapi";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const call = await db.call.findFirst({
      where: { id: (await context.params).id, isDemo: process.env.DEMO_MODE === "true" },
      select: { recordingObjectKey: true, assistantId: true, isVapiAgent: true },
    });
    const allowed = call && (call.isVapiAgent
      ? assistantIds().includes(call.assistantId)
      : (process.env.LIVEKIT_AGENT_NAMES || "").split(",").map((name) => name.trim()).includes(call.assistantId));
    if (!allowed || !call?.recordingObjectKey) throw new HttpError(404, "Nagranie nie jest dostępne.");
    const url = await recordingPlaybackUrl(call.recordingObjectKey);
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
