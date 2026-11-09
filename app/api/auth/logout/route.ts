import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE, digest, cookieOptions } from "@/lib/auth";
import { apiError, checkOrigin, json } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (token)
      await db.session.deleteMany({ where: { tokenHash: digest(token) } });
    jar.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
