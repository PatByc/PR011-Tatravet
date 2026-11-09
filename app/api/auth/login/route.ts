import argon2 from "argon2";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, limitLogin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError, json, jsonBody } from "@/lib/http";
const input = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
});
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await limitLogin();
    const parsed = input.safeParse(await jsonBody(request));
    if (!parsed.success) throw new HttpError(400, "Podaj login i hasło.");
    const user = await db.user.findUnique({
      where: { username: parsed.data.username },
    });
    // Use a real Argon2 operation even when the username does not exist.
    const valid = user
      ? await argon2.verify(user.passwordHash, parsed.data.password)
      : (await argon2.hash(parsed.data.password), false);
    if (!user || !valid)
      throw new HttpError(401, "Nieprawidłowy login lub hasło.");
    await createSession(user.id);
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
