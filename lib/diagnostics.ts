// Never log messages, query text, driver metadata or connection strings.
export function safeErrorDetails(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const meta =
    record.meta && typeof record.meta === "object"
      ? (record.meta as Record<string, unknown>)
      : {};
  const cause =
    record.cause && typeof record.cause === "object"
      ? (record.cause as Record<string, unknown>)
      : {};
  const safeCode = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_]{2,60}$/.test(value)
      ? value
      : undefined;
  return {
    name: safeCode(record.name) || "UnknownError",
    code: safeCode(record.code),
    databaseCode: safeCode(meta.code),
    causeCode: safeCode(cause.code),
  };
}
export function logFailure(event: string, error: unknown) {
  console.error(event, JSON.stringify(safeErrorDetails(error)));
}
