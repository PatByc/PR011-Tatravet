import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { HttpError } from "./http";
export const COOKIE = "tatravet_session";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new HttpError(401, "Zaloguj się ponownie.");
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 3 * 86400_000);
  await db.session.create({
    data: { tokenHash: digest(token), userId, expiresAt: expires },
  });
  (await cookies()).set(COOKIE, token, { ...cookieOptions, expires });
}
// Database counter survives restarts and applies across instances. A global bucket
// also prevents bypass through spoofed forwarding headers or arbitrary usernames.
export async function limitLogin() {
  const now = new Date();
  const reset = new Date(Date.now() + 15 * 60_000);
  const rows = await db.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginLimit" ("key", "attempts", "resetAt") VALUES ('clinic', 1, ${reset})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginLimit"."resetAt" < ${now} THEN 1 ELSE "LoginLimit"."attempts" + 1 END,
      "resetAt" = CASE WHEN "LoginLimit"."resetAt" < ${now} THEN ${reset} ELSE "LoginLimit"."resetAt" END
    RETURNING "attempts"`;
  if (rows[0].attempts > 15)
    throw new HttpError(429, "Zbyt wiele prób. Spróbuj za 15 minut.");
}
