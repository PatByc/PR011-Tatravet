import { formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { dayKey, dateRange, ZONE } from "./dates";
import { terminationCategory } from "./calls";
import { HttpError } from "./http";
import type { Prisma } from "../generated/prisma/client";
export async function dashboard(params: URLSearchParams) {
  const today = dayKey(new Date());
  const from = params.get("from") || today,
    to = params.get("to") || today;
  let range: ReturnType<typeof dateRange>;
  try {
    range = dateRange(from, to);
  } catch {
    throw new HttpError(
      400,
      "Wybierz poprawny zakres dat, maksymalnie 366 dni.",
    );
  }
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  if (!Number.isInteger(page))
    throw new HttpError(400, "Nieprawidłowa strona.");
  const search = (params.get("q") || "").trim().slice(0, 200);
  const followUp = params.get("follow") || "",
    status = params.get("status") || "";
  const demo = process.env.DEMO_MODE === "true";
  const base = { isDemo: demo, startedAt: range };
  const where: Prisma.CallWhereInput = {
    ...base,
    ...(followUp === "CALLBACK" ? { startedAt: undefined } : {}),
    ...(search
      ? {
          OR: [
            { caller: { contains: search, mode: "insensitive" } },
            { transcript: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(followUp ? { followUp } : {}),
    ...(status ? { status } : {}),
  };
  const listSelect = {
    id: true,
    caller: true,
    startedAt: true,
    duration: true,
    status: true,
    followUp: true,
    summary: true,
    endedReason: true,
  } as const;
  const [calls, total, metrics, queue, outstanding, state] = await Promise.all([
    db.call.findMany({
      where,
      select: listSelect,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.call.count({ where }),
    db.call.findMany({
      where: base,
      select: {
        startedAt: true,
        duration: true,
        status: true,
        endedReason: true,
      },
    }),
    db.call.findMany({
      where: { isDemo: demo, followUp: "CALLBACK" },
      select: listSelect,
      orderBy: { startedAt: "asc" },
      take: 8,
    }),
    db.call.count({ where: { isDemo: demo, followUp: "CALLBACK" } }),
    db.syncState.findUnique({ where: { id: "vapi" } }),
  ]);
  const daily: Record<string, number> = {};
  for (
    let d = new Date(from);
    d <= new Date(to);
    d.setUTCDate(d.getUTCDate() + 1)
  )
    daily[d.toISOString().slice(0, 10)] = 0;
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    calls: 0,
  }));
  const endings: Record<string, number> = {};
  let seconds = 0,
    measured = 0;
  for (const call of metrics) {
    daily[dayKey(call.startedAt)]++;
    hours[Number(formatInTimeZone(call.startedAt, ZONE, "H"))].calls++;
    const category = terminationCategory(call.endedReason, call.status);
    endings[category] = (endings[category] || 0) + 1;
    if (call.duration !== null) {
      seconds += call.duration;
      measured++;
    }
  }
  return {
    calls,
    total,
    page,
    queue,
    outstanding,
    metrics: {
      count: metrics.length,
      seconds,
      average: measured ? Math.round(seconds / measured) : null,
    },
    daily: Object.entries(daily).map(([date, calls]) => ({ date, calls })),
    hours,
    endings: Object.entries(endings).map(([name, value]) => ({ name, value })),
    integration: {
      configured: Boolean(
        process.env.VAPI_API_KEY && process.env.VAPI_ASSISTANT_IDS,
      ),
      lastSuccess: state?.lastSuccess || null,
      lastWebhook: state?.lastWebhook || null,
      error: state?.error || false,
    },
    demo,
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;
