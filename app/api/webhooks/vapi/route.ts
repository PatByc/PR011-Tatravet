import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ingestCall } from "@/lib/vapi";
import { apiError, HttpError, json, jsonBody } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const secret = process.env.VAPI_WEBHOOK_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(503, "Integracja nie jest skonfigurowana.");
    const actual = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new HttpError(401, "Brak dostępu.");
    const body = await jsonBody(request, 2_000_000);
    const message = body?.message;
    if (!message || typeof message.type !== "string")
      throw new HttpError(400, "Nieprawidłowe zdarzenie.");
    if (!["status-update", "end-of-call-report"].includes(message.type))
      return json({ ignored: true });
    const raw = {
      ...message.call,
      ...(message.status ? { status: message.status } : {}),
      ...(message.type === "end-of-call-report" ? { status: "ended" } : {}),
      ...(message.artifact ? { artifact: message.artifact } : {}),
      ...(message.analysis ? { analysis: message.analysis } : {}),
      ...(message.endedReason ? { endedReason: message.endedReason } : {}),
    };
    const accepted = await ingestCall(raw);
    if (accepted)
      await db.syncState.upsert({
        where: { id: "vapi" },
        create: { id: "vapi", lastWebhook: new Date() },
        update: { lastWebhook: new Date() },
      });
    return json({ accepted });
  } catch (error) {
    if (error instanceof z.ZodError)
      return apiError(new HttpError(400, "Nieprawidłowe dane połączenia."));
    return apiError(error);
  }
}
