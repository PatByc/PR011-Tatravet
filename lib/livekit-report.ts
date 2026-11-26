import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { contactReasons, type NormalizedCall, type TranscriptSegment } from "./calls";

const turn = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(10_000),
  secondsFromStart: z.number().finite().min(0).max(86_400),
});
const reason = z.enum(Object.keys(contactReasons) as [keyof typeof contactReasons, ...Array<keyof typeof contactReasons>]);
export const livekitReportSchema = z.object({
  version: z.literal(1),
  provider: z.literal("livekit"),
  agentName: z.string().min(1).max(100),
  roomId: z.string().regex(/^RM_[A-Za-z0-9]+$/),
  jobId: z.string().min(1).max(200),
  caller: z.string().max(100).nullable(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  endReason: z.string().max(100).nullable(),
  turns: z.array(turn).max(500),
  summary: z.string().max(2000).nullable(),
  contactReason: reason.nullable(),
  analysisOk: z.boolean(),
  urgent: z.boolean().optional().default(false),
  recording: z.object({
    state: z.enum(["ARCHIVED", "FAILED", "NONE"]),
    key: z.string().max(300).nullable(),
    bytes: z.number().int().min(0).max(100 * 1024 * 1024).nullable(),
  }),
});
export type LivekitReport = z.infer<typeof livekitReportSchema>;

export function normalizeLivekitReport(report: LivekitReport): NormalizedCall {
  const startedAt = new Date(report.startedAt);
  const endedAt = new Date(report.endedAt);
  if (+endedAt < +startedAt) throw new Error("LIVEKIT_REPORT_TIME_INVALID");
  const turns: TranscriptSegment[] = report.turns.map((item) => ({ ...item }));
  return {
    id: report.roomId,
    assistantId: report.agentName,
    caller: report.caller,
    startedAt,
    endedAt,
    duration: Math.max(0, Math.round((+endedAt - +startedAt) / 1000)),
    status: "ended",
    endedReason: report.endReason,
    transcript: turns.length ? turns.map((item) => `${item.role === "assistant" ? "Asystent" : "Rozmówca"}: ${item.text}`).join("\n\n") : null,
    transcriptSegments: turns.length ? turns : null,
    summary: report.summary,
    contactReason: report.contactReason,
    sourceUpdatedAt: endedAt,
  };
}

export function livekitRecordingKey(roomId: string) {
  return `calls/livekit/${roomId}/audio.oga`;
}

export function verifyLivekitBearer(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const actual = Buffer.from(header || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
