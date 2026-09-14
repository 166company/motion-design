/**
 * 2 həftəlik kontent planı — Ootto "content-calendar" + "content-pillar-builder" + "series-planner" + "best-time-scheduler".
 * Girişlər: yuk.az məqalələri, bu həftənin real trend nümunələri (trends.ts), yaddaş (brain.md), mövcud cədvəl (B.e/Ç/C reels, hər gün 3 poster).
 * Çıxış: content/calendar.json — hər slot üçün şablon, sütun (pillar), ideya, məqsəd, bucaq, hook fikri.
 * Pipeline-lar öz günlərinin slotunu "PLAN" kimi prompt-a alır (skills.ts → calendarHint).
 *
 *   npx tsx pipeline/calendar.ts
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { listArticles } from "./wp.ts";
import { getTrends } from "./trends.ts";
import { playbook, memory } from "./skills.ts";

const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";

export type Slot = { date: string; template: "TipList" | "Explainer" | "Story" | "Carousel" | "Poster"; pillar: string; idea: string; goal: string; angle: string; hook: string; articleId: number | null; series: string };

const schema = {
  type: "object", additionalProperties: false, required: ["pillars", "series", "slots"],
  properties: {
    pillars: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" }, description: "3-5 kontent sütunu (content-pillar-builder), hər biri 3-6 söz" },
    series: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" }, description: "təkrarlanan seriya formatları (series-planner), məs. 'Köç günü dramı #N'" },
    slots: {
      type: "array", minItems: 10, maxItems: 45,
      items: {
        type: "object", additionalProperties: false,
        required: ["date", "template", "pillar", "idea", "goal", "angle", "hook", "articleId", "series"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          template: { type: "string", enum: ["TipList", "Explainer", "Story", "Carousel", "Poster"] },
          pillar: { type: "string" },
          idea: { type: "string", description: "1-2 cümlə, konkret" },
          goal: { type: "string", enum: ["SAVE", "SHARE", "FOLLOW", "LEAD"] },
          angle: { type: "string", description: "hook bucağı: nəticə/necə/əks-fikir/POV/nömrəli/səhv/sual — rotasiya et" },
          hook: { type: "string", description: "hook fikri, maks 10 söz, azərbaycanca" },
          articleId: { type: ["integer", "null"], description: "TipList üçün məqalə ID (siyahıdan), digərlərində null" },
          series: { type: "string", description: "seriya adı və ya boş" },
        },
      },
    },
  },
} as const;

const main = async () => {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let i = 0; i < 14; i++) { const d = new Date(today); d.setUTCDate(today.getUTCDate() + i); days.push(fmt(d)); }
  const dow = (s: string) => new Date(s + "T00:00:00Z").getUTCDay();
  // cədvəl: B.e/Ç/C → video növbəsi (Story | Explainer | TipList | Carousel), Ç.a/C.a/Ş → illüstrasiya/animasiya (Story | Explainer);
  // hər gün → Poster (3 ədəd, plan 1 slot verir, poster.ts özü 2 fun + 1 satış edir). Əsas yer illüstrasiya və videoya.
  const schedule = days.flatMap((d) => [
    ...([1, 3, 5].includes(dow(d)) ? [`${d}: video (Story | Explainer | TipList | Carousel — Story/Explainer üstünlük)`] : []),
    ...([2, 4, 6].includes(dow(d)) ? [`${d}: illüstrasiya/animasiya (Story | Explainer)`] : []),
    `${d}: Poster (gündəlik 3 statik post: 2 fun + 1 satış — plan yalnız satış postunun ideyasını verir)`,
  ]);
  const az = (await listArticles()).filter((a) => a.lang === "az");
  const used: number[] = JSON.parse(await fs.readFile("content/data/used.json", "utf-8").catch(() => "[]"));
  const articles = az.map((a) => `- [${a.id}]${used.includes(a.id) ? " (istifadə olunub)" : ""} ${a.title}`).join("\n");
  const trends = await getTrends();
  const trendText = trends.examples.slice(0, 8).map((e) => `- "${e.quote.slice(0, 120)}"`).join("\n");
  const analytics = await fs.readFile("content/analytics.json", "utf-8").catch(() => "{}");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: `Sən Yük.az (Bakı; ev/ofis köçü, yükdaşıma, hədəf: yük sahibləri) Instagram/Facebook səhifəsinin kontent planlayıcısısan. Azərbaycanca. Qiymət rəqəmi yox. Səhifə FUN olmalıdır: əsas yer illüstrasiya (Story) və videoya (Explainer) — hər həftə ən azı 3 Story + 2 Explainer; TipList maks 1/həftə. Fun konseptlər verilən beynəlxalq real trend nümunələrindən (formatı saxla, mövzunu köçə çevir). Məqsəd (SAVE/SHARE/FOLLOW/LEAD) və bucaq slotdan slota rotasiya olunsun; eyni məqalə 2 həftədə 1 dəfə.` + playbook(["content-calendar", "content-pillar-builder", "series-planner", "best-time-scheduler", "going-viral"], 12000) + memory() },
        { role: "user", content: `BU GÜN: ${fmt(today)}\n\nSLOTLAR (hər sətir üçün 1 plan yaz, tarix və şablon dəqiq uyğun olsun):\n${schedule.join("\n")}\n\nMƏQALƏLƏR (TipList üçün ID ver):\n${articles}\n\nBU HƏFTƏNİN REAL TREND NÜMUNƏLƏRİ:\n${trendText || "(yoxdur)"}\n\nSON RƏQƏMLƏR:\n${analytics.slice(0, 3000)}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "calendar", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const plan = JSON.parse(((await res.json()) as any).choices[0].message.content) as { pillars: string[]; series: string[]; slots: Slot[] };
  await fs.writeFile("content/calendar.json", JSON.stringify({ generatedAt: new Date().toISOString(), from: days[0], to: days[13], ...plan }, null, 2), "utf-8");
  console.log(`  ✓ plan: ${plan.slots.length} slot, sütunlar: ${plan.pillars.join(" · ")}`);
  for (const s of plan.slots.slice(0, 8)) console.log(`   ${s.date} ${s.template.padEnd(9)} ${s.goal.padEnd(6)} ${s.hook}`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
