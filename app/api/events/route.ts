import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { subscribeToDashboard } from "@/lib/realtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
  } catch (error) {
    return apiError(error);
  }

  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (message: string) => {
        if (!closed) controller.enqueue(encoder.encode(message));
      };
      const unsubscribe = subscribeToDashboard(() => send("event: refresh\ndata: {}\n\n"));
      const heartbeat = setInterval(() => send(": keepalive\n\n"), 25000);
      const lifetime = setTimeout(() => stop(), 4 * 60_000);
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe();
        request.signal.removeEventListener("abort", stop);
        try { controller.close(); } catch { /* The browser already disconnected. */ }
      };
      request.signal.addEventListener("abort", stop, { once: true });
      send(": connected\n\n");
    },
    cancel() { stop(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
