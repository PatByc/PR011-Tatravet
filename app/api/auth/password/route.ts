import argon2 from "argon2";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, limitLogin, COOKIE, cookieOptions } from "@/lib/auth";
import { apiError, checkOrigin, HttpError, json, jsonBody } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await limitLogin();
    const parsed = z
      .object({
        current: z.string().max(256),
        password: z.string().min(12).max(256),
      })
      .safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new HttpError(400, "Nowe hasło musi mieć od 12 do 256 znaków.");
    if (!(await argon2.verify(user.passwordHash, parsed.data.current)))
      throw new HttpError(400, "Obecne hasło jest nieprawidłowe.");
    const hash = await argon2.hash(parsed.data.password);
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: hash } }),
      db.session.deleteMany({ where: { userId: user.id } }),
    ]);
    (await cookies()).set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
