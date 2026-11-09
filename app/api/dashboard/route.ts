import { requireUser } from "@/lib/auth";
import { dashboard } from "@/lib/dashboard";
import { apiError, json } from "@/lib/http";
export async function GET(request: Request) {
  try {
    await requireUser();
    return json(await dashboard(new URL(request.url).searchParams));
  } catch (error) {
    return apiError(error);
  }
}
