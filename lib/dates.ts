import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
export const ZONE = "Europe/Warsaw";
export function dayKey(date: Date) {
  return formatInTimeZone(date, ZONE, "yyyy-MM-dd");
}
export function dateRange(from: string, to: string) {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (
    !valid(from) ||
    !valid(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 366 * 86400_000
  )
    throw new Error("InvalidRange");
  const next = new Date(to);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    gte: fromZonedTime(`${from}T00:00:00`, ZONE),
    lt: fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, ZONE),
  };
}
