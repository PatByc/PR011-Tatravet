import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, HttpError, json } from "@/lib/http";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  try {
    await requireUser();
    const demo = process.env.DEMO_MODE === "true";
    const after = new URL(request.url).searchParams.get("after");
    let cursor: { at: Date; id: string } | null = null;
    if (after) {
      try {
        const parsed = JSON.parse(after);
        const at = new Date(parsed.at);
        if (typeof parsed.id !== "string" || parsed.id.length > 200 || !parsed.id || Number.isNaN(at.getTime())) throw new Error();
        cursor = { at, id: parsed.id };
      } catch {
        throw new HttpError(400, "Nieprawidłowy punkt powiadomień.");
      }
    }
    const reportWhere: Prisma.CallWhereInput = { isDemo: false, assistantId: { not: "showcase" }, reportedAt: { not: null } };
    const newWhere: Prisma.CallWhereInput = cursor ? {
      ...reportWhere, followUp: "CALLBACK",
      OR: [{ reportedAt: { gt: cursor.at } }, { reportedAt: cursor.at, id: { gt: cursor.id } }],
    } : {};
    const [latest, newCount, openCount] = await Promise.all([
      demo ? Promise.resolve(null) : db.call.findFirst({ where: reportWhere, orderBy: [{ reportedAt: "desc" }, { id: "desc" }], select: { reportedAt: true, id: true } }),
      !demo && cursor ? db.call.count({ where: newWhere }) : Promise.resolve(0),
      db.call.count({ where: { isDemo: demo, followUp: "CALLBACK" } }),
    ]);
    return json({ cursor: latest?.reportedAt ? { at: latest.reportedAt.toISOString(), id: latest.id } : null, newCount, openCount });
  } catch (error) {
    return apiError(error);
  }
}
