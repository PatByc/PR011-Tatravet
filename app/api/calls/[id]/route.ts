import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, checkOrigin, HttpError, json, jsonBody } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
async function find(id: string) {
  const call = await db.call.findFirst({
    where: { id, isDemo: process.env.DEMO_MODE === "true" },
  });
  if (!call) throw new HttpError(404, "Nie znaleziono połączenia.");
  return call;
}
export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    return json(await find((await context.params).id));
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    await requireUser();
    const call = await find((await context.params).id);
    const parsed = z
      .object({
        followUp: z.enum(["NONE", "CALLBACK", "DONE"]),
        note: z.string().max(5000),
        revision: z.number().int().min(0),
      })
      .safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "Sprawdź status i długość notatki (maks. 5000 znaków).",
      );
    const { revision, ...data } = parsed.data;
    const result = await db.call.updateMany({
      where: { id: call.id, revision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (!result.count)
      throw new HttpError(
        409,
        "Ktoś zmienił tę notatkę. Otwórz połączenie ponownie przed zapisem.",
      );
    return json(await find(call.id));
  } catch (error) {
    return apiError(error);
  }
}
