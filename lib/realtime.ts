import { Client } from "pg";
import { db } from "./db";

const channel = "tatravet_updates";
const listeners = new Set<() => void>();
let client: Client | null = null;
let connecting = false;
let retry: ReturnType<typeof setTimeout> | null = null;

function announce() {
  for (const listener of listeners) listener();
}

function reconnect() {
  if (!listeners.size || retry) return;
  retry = setTimeout(() => {
    retry = null;
    void connect();
  }, 2000);
}

async function connect() {
  if (!listeners.size || client || connecting) return;
  connecting = true;
  const next = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const disconnected = () => {
    if (client !== next) return;
    client = null;
    void next.end().catch(() => {});
    reconnect();
  };
  next.on("notification", announce);
  next.on("error", disconnected);
  next.on("end", disconnected);
  try {
    await next.connect();
    await next.query(`LISTEN ${channel}`);
    if (!listeners.size) {
      await next.end();
      return;
    }
    client = next;
    announce(); // A reconnect also reconciles events missed while the listener was down.
  } catch {
    void next.end().catch(() => {});
    reconnect();
  } finally {
    connecting = false;
  }
}

export function subscribeToDashboard(listener: () => void) {
  listeners.add(listener);
  void connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    if (retry) clearTimeout(retry);
    retry = null;
    if (client) {
      const old = client;
      client = null;
      void old.end().catch(() => {});
    }
  };
}

export async function signalDashboardChange() {
  await db.$executeRaw`NOTIFY tatravet_updates`;
}
