/**
 * Beynəlxalq yükdaşıma brendlərinin kontent oyun kitabı.
 *
 * Niyə: mövzular "dəxlisiz" olmasın deyə ideyalar artıq işləyən qlobal köç/logistika brendlərindən götürülür —
 * U-Haul, PODS, Allied Van Lines, Mayflower, Two Men and a Truck, North American Van Lines, Bekins,
 * International Van Lines, Atlas, Gentle Giant, Sirelo, AGS Movers, Santa Fe Relocation, Movinga…
 *
 * Mənbə: Gemini + Google Search (pulsuz, açarsız deyil — GEMINI_API_KEY). Nəticə content/movers-playbook.json-a
 * keşlənir və Motion/Showcase/Poster promptlarına "BEYNƏLXALQ NÜMUNƏ" bloku kimi gedir.
 *
 *   npx tsx pipeline/movers.ts            → araşdırma (7 gündən köhnədirsə yenilənir)
 *   npx tsx pipeline/movers.ts --force    → məcburi yenilə
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { geminiWebSearchJSON } from "./llm.ts";

const CACHE = "content/movers-playbook.json";

export type Playbook = {
  fetchedAt: string;
  brands: { name: string; country: string; whatTheyPost: string; strongestFormat: string }[];
  pillars: { pillar: string; why: string; examples: string[] }[];
  formats: { format: string; howItLooks: string; goodFor: string }[];
  hooks: string[];
  avoid: string[];
};

const schema = {
  type: "object", additionalProperties: false, required: ["brands", "pillars", "formats", "hooks", "avoid"],
  properties: {
    brands: {
      type: "array", minItems: 5, maxItems: 10,
      items: { type: "object", additionalProperties: false, required: ["name", "country", "whatTheyPost", "strongestFormat"],
        properties: {
          name: { type: "string" }, country: { type: "string" },
          whatTheyPost: { type: "string", description: "1 cümlə: sosial şəbəkədə əsasən nə paylaşırlar" },
          strongestFormat: { type: "string", description: "ən yaxşı işləyən format (məs. 'packing hack reels', 'before/after truck load')" },
        } },
    },
    pillars: {
      type: "array", minItems: 4, maxItems: 7,
      items: { type: "object", additionalProperties: false, required: ["pillar", "why", "examples"],
        properties: {
          pillar: { type: "string", description: "kontent sütunu, azərbaycanca" },
          why: { type: "string", description: "niyə işləyir, 1 cümlə" },
          examples: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" }, description: "konkret post ideyaları, azərbaycanca" },
        } },
    },
    formats: {
      type: "array", minItems: 4, maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["format", "howItLooks", "goodFor"],
        properties: { format: { type: "string" }, howItLooks: { type: "string" }, goodFor: { type: "string" } } },
    },
    hooks: { type: "array", minItems: 6, maxItems: 12, items: { type: "string" }, description: "bu brendlərin işlətdiyi hook nümunələri, azərbaycanca uyğunlaşdırılmış" },
    avoid: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" }, description: "bu sahədə İŞLƏMƏYƏN/qaçılası mövzular" },
  },
} as const;

const PROMPT = `Research what the biggest international moving & relocation companies actually post on Instagram/TikTok/YouTube Shorts.
Look at: U-Haul, PODS, Allied Van Lines, Mayflower, Two Men and a Truck, North American Van Lines, Bekins, Atlas Van Lines,
International Van Lines, Gentle Giant Moving, College Hunks Hauling Junk, Sirelo, AGS Movers, Santa Fe Relocation, Movinga, Anyvan.
Find their recurring content pillars and the formats that get the most engagement (packing hacks, truck-loading tetris, day-in-the-life of a crew,
customer reaction on delivery day, "what not to do" mistakes, cost/estimate explainers, fragile-item protection, pet & plant moving, storage,
long-distance timelines, moving-day checklists, before/after, team appreciation, seasonal peak-season advice).
Return the answer adapted for a Baku-based home & office moving company (Yük.az) writing in AZERBAIJANI:
pillars, formats, hook examples, and what does NOT work in this niche. Be concrete and grounded in what these brands really publish.`;

export const getPlaybook = async (force = false): Promise<Playbook | null> => {
  if (!force) {
    try {
      const c = JSON.parse(await fs.readFile(CACHE, "utf-8")) as Playbook;
      if (Date.now() - new Date(c.fetchedAt).getTime() < 7 * 86400e3) return c;
    } catch { /* keş yoxdur */ }
  }
  const data = await geminiWebSearchJSON<Omit<Playbook, "fetchedAt">>(PROMPT, schema);
  if (!data) return JSON.parse(await fs.readFile(CACHE, "utf-8").catch(() => "null"));
  const pb: Playbook = { fetchedAt: new Date().toISOString(), ...data };
  await fs.mkdir("content", { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(pb, null, 2), "utf-8");
  return pb;
};

/** Prompt bloku — şablonlara "beynəlxalq nümunə" kimi əlavə olunur */
export const playbookBlock = (pb: Playbook | null, maxChars = 2600): string => {
  if (!pb) return "";
  const t =
    `\n\n=== BEYNƏLXALQ NÜMUNƏ (top köç brendləri: ${pb.brands.map((b) => b.name).join(", ")}) ===\n` +
    `SÜTUNLAR: ${pb.pillars.map((p) => `${p.pillar} (${p.examples[0]})`).join(" · ")}\n` +
    `FORMATLAR: ${pb.formats.map((f) => `${f.format} — ${f.howItLooks}`).join(" · ")}\n` +
    `HOOK NÜMUNƏLƏRİ: ${pb.hooks.slice(0, 8).join(" · ")}\n` +
    `QAÇ: ${pb.avoid.join(" · ")}\n` +
    `Mövzu MÜTLƏQ bu sütunlardan birinə düşməlidir — köçlə birbaşa bağlı olmayan ideya YAZMA.\n=== NÜMUNƏ SONU ===`;
  return t.length > maxChars ? t.slice(0, maxChars) + "…" : t;
};

if (/[\\/]movers\.ts$/.test(process.argv[1] ?? "")) {
  const pb = await getPlaybook(process.argv.includes("--force"));
  if (!pb) { console.error("Playbook alınmadı (GEMINI_API_KEY?)"); process.exit(1); }
  console.log(`\nBrendlər: ${pb.brands.map((b) => `${b.name} (${b.country})`).join(", ")}\n`);
  for (const p of pb.pillars) console.log(`■ ${p.pillar}\n   ${p.why}\n   → ${p.examples.join(" · ")}`);
  console.log(`\nFormatlar: ${pb.formats.map((f) => f.format).join(" · ")}`);
  console.log(`Hook-lar: ${pb.hooks.slice(0, 6).join(" · ")}`);
  console.log(`Qaç: ${pb.avoid.join(" · ")}\n`);
}
