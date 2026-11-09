import { logFailure } from "./diagnostics";
import { NextResponse } from "next/server";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function publicUrl() {
  return process.env.PUBLIC_URL || "http://localhost:3000";
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(publicUrl()).origin)
    throw new HttpError(403, "Niedozwolone żądanie. Odśwież stronę.");
}
export async function jsonBody(request: Request, max = 16_384) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Brak danych.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Zbyt duże żądanie.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new HttpError(400, "Nieprawidłowe dane.");
  }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  logFailure("request_failed", error);
  return NextResponse.json(
    { error: "Nie udało się wykonać operacji. Spróbuj ponownie." },
    { status: 500 },
  );
}
export function json(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
