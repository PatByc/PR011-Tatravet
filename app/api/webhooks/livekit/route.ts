import { db } from "@/lib/db";
import { livekitRecordingKey, livekitReportSchema, normalizeLivekitReport, verifyLivekitBearer } from "@/lib/livekit-report";
import { storeProviderCall } from "@/lib/call-ingestion";
import { callbackRequiredForReason } from "@/lib/calls";
import { apiError, HttpError, json, jsonBody } from "@/lib/http";
import { signalDashboardChange } from "@/lib/realtime";

export async function POST(request: Request) {
  try {
    const secret = process.env.LIVEKIT_EOCR_SECRET;
    if (!secret || secret.length < 32) throw new HttpError(503, "Integracja nie jest skonfigurowana.");
    if (!verifyLivekitBearer(request.headers.get("authorization"), secret))
      throw new HttpError(401, "Brak dostępu.");
    const parsed = livekitReportSchema.safeParse(await jsonBody(request, 2_000_000));
    if (!parsed.success) throw new HttpError(400, "Nieprawidłowy raport połączenia.");
    const report = parsed.data;
    const allowed = (process.env.LIVEKIT_AGENT_NAMES || "").split(",").map((name) => name.trim()).filter(Boolean);
    if (!allowed.includes(report.agentName)) return json({ accepted: false });
    if (report.recording.state === "ARCHIVED" &&
        (report.recording.key !== livekitRecordingKey(report.roomId) || report.recording.bytes === null))
      throw new HttpError(400, "Nieprawidłowe nagranie.");
    if (report.recording.state !== "ARCHIVED" && (report.recording.key !== null || report.recording.bytes !== null))
      throw new HttpError(400, "Nieprawidłowe nagranie.");
    await storeProviderCall("livekit", normalizeLivekitReport(report), {
      finalReport: true,
      needsCallback: !report.analysisOk || callbackRequiredForReason(report.contactReason),
      recording: report.recording,
    });
    await db.syncState.upsert({
      where: { id: "livekit" },
      create: { id: "livekit", lastWebhook: new Date() },
      update: { lastWebhook: new Date() },
    });
    try { await signalDashboardChange(); } catch { /* The saved call is visible on refresh. */ }
    return json({ accepted: true });
  } catch (error) {
    return apiError(error);
  }
}
