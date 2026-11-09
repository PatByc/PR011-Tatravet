import "dotenv/config";
import argon2 from "argon2";
import { db } from "../lib/db";
async function main() {
  const username = process.env.CLINIC_USERNAME,
    password = process.env.CLINIC_PASSWORD;
  if (
    !username ||
    username.length > 100 ||
    !password ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error(
      "Set CLINIC_USERNAME and CLINIC_PASSWORD (12–256 characters).",
    );
  const passwordHash = await argon2.hash(password);
  await db.$transaction(async (tx) => {
    const existing = await tx.user.findFirst();
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { username, passwordHash },
        })
      : await tx.user.create({ data: { username, passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.loginLimit.deleteMany();
  });
  console.log("Clinic account created/reset; previous sessions revoked.");
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
