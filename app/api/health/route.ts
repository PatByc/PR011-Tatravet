import { logFailure } from "@/lib/diagnostics";
import { db } from "@/lib/db";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (error) {
    logFailure("database_health_failed", error);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
