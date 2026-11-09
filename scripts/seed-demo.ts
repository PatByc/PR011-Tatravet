import "dotenv/config";
import { db } from "../lib/db";
async function main() {
  if (process.env.DEMO_MODE !== "true")
    throw new Error("Demo fixtures require DEMO_MODE=true.");
  const summaries = [
    "Pytanie o dostępny termin wizyty kontrolnej.",
    "Prośba o kontakt w sprawie szczepienia psa.",
    "Informacja o godzinach otwarcia przychodni.",
    "Pytanie o przygotowanie kota do badania.",
    "Prośba o potwierdzenie terminu wizyty.",
  ];
  for (let i = 0; i < 85; i++) {
    const startedAt = new Date();
    startedAt.setUTCDate(startedAt.getUTCDate() - Math.floor(i / 5));
    startedAt.setUTCHours(7 + (i % 5) * 2, 11 + ((i * 7) % 45), 0, 0);
    if (startedAt > new Date())
      startedAt.setUTCDate(startedAt.getUTCDate() - 1);
    const duration = 45 + ((i * 47) % 340);
    const data = {
      id: `demo-${i}`,
      assistantId: "demo",
      caller: `+48 000 000 ${String(i + 1).padStart(3, "0")}`,
      startedAt,
      endedAt: new Date(+startedAt + duration * 1000),
      duration,
      status: "ended",
      endedReason: i % 13 === 0 ? "pipeline-error" : "customer-ended-call",
      summary: summaries[i % 5],
      transcript: `Asystent: Dzień dobry, przychodnia Tatravet. W czym mogę pomóc?\n\nRozmówca: Dzień dobry. Chciałabym zapytać o termin wizyty kontrolnej dla mojego psa.\n\nAsystent: Przekażę prośbę zespołowi przychodni. Czy możemy oddzwonić pod numer, z którego Pani dzwoni?\n\nRozmówca: Tak, dziękuję.\n\nAsystent: Dziękuję za telefon. Do usłyszenia.`,
      sourceUpdatedAt: startedAt,
      isDemo: true,
      followUp: i < 3 ? "CALLBACK" : i % 3 === 0 ? "DONE" : "NONE",
      note: i === 0 ? "Oddzwonić w sprawie dostępnych terminów." : "",
    };
    await db.call.upsert({ where: { id: data.id }, create: data, update: {} });
  }
  console.log("85 synthetic calls prepared.");
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
