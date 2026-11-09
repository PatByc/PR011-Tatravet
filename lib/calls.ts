import { z } from "zod";
export const contactReasons = {
  appointment: "Umówienie wizyty",
  appointment_change: "Zmiana lub odwołanie wizyty",
  animal_health: "Zdrowie zwierzęcia",
  services_prices: "Usługi i ceny",
  test_results: "Wyniki badań i leczenie",
  clinic_info: "Informacje o przychodni",
  other: "Inne",
  unknown: "Nieustalony powód",
} as const;
export type ContactReason = keyof typeof contactReasons;
function validReason(value: unknown): ContactReason | null {
  if (typeof value !== "string") return null;
  if (Object.hasOwn(contactReasons, value)) return value as ContactReason;
  const label = value.trim().toLocaleLowerCase("pl-PL");
  const entry = Object.entries(contactReasons).find(([, name]) =>
    name.toLocaleLowerCase("pl-PL") === label,
  );
  return (entry?.[0] as ContactReason | undefined) || null;
}
function resultReason(result: { contactReason?: unknown; powodKontaktu?: unknown } | null | undefined) {
  return validReason(result?.powodKontaktu) || validReason(result?.contactReason);
}
function extractedReason(call: VapiCall): ContactReason | null {
  const direct = resultReason(call.analysis?.structuredData);
  if (direct) return direct;
  const outputs = call.artifact?.structuredOutputs;
  if (!outputs) return null;
  for (const output of Object.values(outputs)) {
    if (output.name === "Tatravet Contact Reason" || output.name === "PR011 Tatravet — Powód kontaktu") {
      const reason = resultReason(output.result);
      if (reason) return reason;
    }
  }
  return null;
}
export function assistantPromisedCallback(transcript: string | null | undefined): boolean {
  if (!transcript) return false;
  const lines = transcript.split(/\r?\n/);
  return lines.some((line) => {
    const match = line.match(/^\s*(?:AI|Asystent|Assistant)\s*:\s*(.*)$/i);
    return !!match && /(?:\boddzwonimy\b|\b(?:recepcja|przychodnia|personel|lekarz|zespół)\b.{0,100}\boddzwoni\b|\b(?:zapiszę|przekażę)\b.{0,70}\bprośbę o kontakt\b)/i.test(match[1]);
  });
}
export function callbackRequired(call: VapiCall): boolean {
  const direct = call.analysis?.structuredData?.wymagaOddzwonienia;
  if (typeof direct === "boolean") return direct;
  const outputs = call.artifact?.structuredOutputs;
  if (outputs) for (const output of Object.values(outputs)) {
    if (output.name === "PR011 Tatravet — Powód kontaktu" || output.name === "Tatravet Contact Reason") {
      const value = output.result?.wymagaOddzwonienia;
      if (typeof value === "boolean") return value;
    }
  }
  return assistantPromisedCallback(call.artifact?.transcript || call.transcript);
}
export const vapiCallSchema = z.object({
  id: z.string().min(1).max(200),
  assistantId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  startedAt: z.string().datetime({ offset: true }).nullish(),
  endedAt: z.string().datetime({ offset: true }).nullish(),
  status: z.string().min(1).max(100).optional(),
  endedReason: z.string().nullish(),
  customer: z.object({ number: z.string().max(100).optional() }).nullish(),
  transcript: z.string().nullish(),
  artifact: z.object({
    transcript: z.string().nullish(),
    structuredOutputs: z.record(z.string(), z.object({
      name: z.string().optional(),
      result: z.object({ contactReason: z.unknown().optional(), powodKontaktu: z.unknown().optional(), wymagaOddzwonienia: z.boolean().optional() }).passthrough().nullish(),
    }).passthrough()).nullish(),
  }).nullish(),
  analysis: z.object({
    summary: z.string().nullish(),
    structuredData: z.object({ contactReason: z.unknown().optional(), powodKontaktu: z.unknown().optional(), wymagaOddzwonienia: z.boolean().optional() }).passthrough().nullish(),
  }).nullish(),
});
export type VapiCall = z.infer<typeof vapiCallSchema>;
export function normalizeCall(call: VapiCall) {
  const startedAt = new Date(call.startedAt || call.createdAt);
  const endedAt = call.endedAt ? new Date(call.endedAt) : null;
  return {
    id: call.id,
    assistantId: call.assistantId,
    caller: call.customer?.number || null,
    startedAt,
    endedAt,
    duration:
      call.startedAt && endedAt
        ? Math.max(0, Math.round((+endedAt - +startedAt) / 1000))
        : null,
    status: endedAt ? "ended" : call.status || "queued",
    endedReason: call.endedReason || null,
    transcript: call.artifact?.transcript || call.transcript || null,
    summary: call.analysis?.summary || null,
    contactReason: extractedReason(call),
    sourceUpdatedAt: new Date(call.updatedAt || call.endedAt || call.createdAt),
  };
}
export type NormalizedCall = Omit<
  ReturnType<typeof normalizeCall>,
  "status" | "contactReason"
> & { status: string; contactReason: string | null };
const rank: Record<string, number> = {
  scheduled: 0,
  queued: 1,
  ringing: 2,
  "in-progress": 3,
  forwarding: 4,
  ended: 5,
};
export function mergeCall(
  old: NormalizedCall,
  incoming: NormalizedCall,
): NormalizedCall {
  const newer = +incoming.sourceUpdatedAt >= +old.sourceUpdatedAt;
  const base = newer ? incoming : old;
  return {
    id: base.id,
    assistantId: base.assistantId,
    sourceUpdatedAt: base.sourceUpdatedAt,
    startedAt: new Date(Math.max(+old.startedAt, +incoming.startedAt)),
    status:
      (rank[incoming.status] ?? 1) >= (rank[old.status] ?? 1)
        ? incoming.status
        : old.status,
    caller: base.caller || old.caller || incoming.caller,
    endedAt: base.endedAt || old.endedAt || incoming.endedAt,
    duration: base.duration ?? old.duration ?? incoming.duration,
    endedReason: base.endedReason || old.endedReason || incoming.endedReason,
    transcript: base.transcript || old.transcript || incoming.transcript,
    summary: base.summary || old.summary || incoming.summary,
    contactReason: base.contactReason || old.contactReason || incoming.contactReason,
  };
}
export function terminationCategory(reason: string | null, status: string) {
  if (status !== "ended") return "W toku";
  if (!reason) return "Nieznana przyczyna";
  if (/error|failed|fault/.test(reason)) return "Błąd techniczny";
  if (/forward|transfer/.test(reason)) return "Przekazanie";
  if (/no-answer|busy|did-not-answer/.test(reason)) return "Brak odpowiedzi";
  return "Zakończone";
}
export const statusLabels: Record<string, string> = {
  scheduled: "Zaplanowane",
  queued: "Oczekujące",
  ringing: "Dzwoni",
  "in-progress": "W trakcie",
  forwarding: "Przekazywanie",
  ended: "Zakończone",
};
export const followLabels: Record<string, string> = {
  NONE: "Bez działania",
  CALLBACK: "Do oddzwonienia",
  DONE: "Załatwione",
};

export function terminationLabel(reason: string | null) {
  if (!reason) return "Brak informacji";
  if (reason === "customer-ended-call") return "Rozmówca zakończył połączenie";
  if (reason === "assistant-ended-call") return "Asystent zakończył połączenie";
  if (/error|failed|fault/.test(reason))
    return "Połączenie przerwane przez błąd techniczny";
  if (/forward|transfer/.test(reason)) return "Połączenie przekazane dalej";
  if (/no-answer|did-not-answer/.test(reason)) return "Brak odpowiedzi";
  if (/busy/.test(reason)) return "Linia zajęta";
  if (/silence/.test(reason)) return "Rozłączenie po okresie ciszy";
  if (/max-duration/.test(reason)) return "Osiągnięto limit czasu rozmowy";
  if (reason === "hangup") return "Połączenie rozłączone";
  return "Inna przyczyna zakończenia";
}
