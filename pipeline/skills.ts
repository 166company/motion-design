/**
 * Ootto "Claude Content Skills" inteqrasiyası (MIT, .claude/skills/<ad>/SKILL.md).
 *   • Claude Code-da birbaşa işlədilə bilir: /viral-hook-writer, /content-calendar, /going-viral …
 *   • Pipeline-da: hər şablon üçün uyğun skill-lərin metodologiyası OpenAI sistem promptuna qoşulur
 *     (playbook), "going-viral" strategiyası hər post üçün məqsəd/emosiya/bucaq rotasiyası verir (strategy),
 *     ai-brain analoqu content/brain.md — keçmiş qaliblər (memory).
 */
import fs from "node:fs";
import path from "node:path";

const DIR = ".claude/skills";

/** SKILL.md → yalnız işə yarayan hissə: frontmatter, marketinq footer-i, Obsidian qeydləri, "Next" linkləri silinir */
export const loadSkill = (name: string): string => {
  const p = path.join(DIR, name, "SKILL.md");
  if (!fs.existsSync(p)) return "";
  let s = fs.readFileSync(p, "utf-8");
  s = s.replace(/^---[\s\S]*?---\s*/m, "");                    // frontmatter
  s = s.replace(/\n---\s*\nBuilt by[\s\S]*$/m, "");             // footer
  s = s.replace(/\n---\s*\nThe manual version[\s\S]*$/m, "");
  s = s.replace(/\*\*Obsidian memory tip:\*\*[^\n]*\n?/g, "");
  s = s.replace(/\*\*Next:\*\*[^\n]*\n?/g, "");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");                // markdown linkləri → mətn
  s = s.replace(/^## (When to use|What you'll need)[\s\S]*?(?=\n## )/gm, "");
  s = s.replace(/^## Works with[\s\S]*$/m, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
};

/** Bir neçə skill-in birləşmiş metodologiyası — sistem promptuna əlavə üçün */
export const playbook = (names: string[], maxChars = 14000): string => {
  const parts = names.map((n) => loadSkill(n)).filter(Boolean);
  if (!parts.length) return "";
  let text = parts.join("\n\n---\n\n");
  if (text.length > maxChars) text = text.slice(0, maxChars) + "\n…";
  return `\n\n=== METODOLOGİYA (Ootto Content Skills — bu playbook-ları tətbiq et; nümunə promptlardakı "[…]" boşluqlarını Yük.az konteksti ilə doldur, İNGİLİS nümunələri azərbaycanca yaz) ===\n${text}\n=== METODOLOGİYA SONU ===`;
};

/** going-viral: hər post üçün BİR məqsəd → emosiya → mexanika; bucaq hər postda dəyişir */
export type Strategy = { goal: "SAVE" | "SHARE" | "FOLLOW" | "LEAD"; emotion: string; mechanic: string; angle: string; rehook: string };
const GOALS: Array<Omit<Strategy, "angle" | "rehook">> = [
  { goal: "SAVE",   emotion: "rahatlıq + unutmaq qorxusu", mechanic: "sonlu nömrəli sistem / addımlar — 'gələcək sən buna ehtiyac duyacaq', dərinlik caption-da" },
  { goal: "SHARE",  emotion: "heyrət / haqsızlıq hissi / status", mechanic: "'səni aldadırlar' / 'demək olar heç kim bilmir' — göndərəni ağıllı göstərən fakt" },
  { goal: "FOLLOW", emotion: "FOMO + arzu", mechanic: "geridə qalma çərçivəsi + nəticə-əvvəl sübut + tanınan görünüş" },
  { goal: "LEAD",   emotion: "maraq + qazanc", mechanic: "dəyəri göstər, həlli saxla → 'Zəng et' / 'nömrəni yaz' — dərhal real cavab" },
];
const ANGLES = ["nəticə/sübut-əvvəl", "necə-etməli (addımlar)", "əks-fikir ('sən bunu səhv edirsən')", "POV / relatable səhnə", "nömrəli siyahı ('3 şey…')", "səhv / 'bunu etmə'", "sual (ağrını adlandır)"];
const REHOOKS = ["'amma heç kimin demədiyi hissə…'", "'və daha yaxşısı var…'", "'sonuncunu gözlə'", "'ən vacibi axırda'"];

/** Mövcud postların sayına görə deterministik rotasiya (eyni gün eyni məqsəd təkrarlanmır) */
export const strategyFor = (seed: number): Strategy => {
  const g = GOALS[seed % GOALS.length];
  return { ...g, angle: ANGLES[seed % ANGLES.length], rehook: REHOOKS[seed % REHOOKS.length] };
};
export const strategyText = (s: Strategy) =>
  `\n\nSTRATEGİYA (going-viral, bu post üçün seçilib — dəyişmə):\n` +
  `- MƏQSƏD: ${s.goal} → tetiklənəcək emosiya: ${s.emotion}\n- MEXANİKA: ${s.mechanic}\n- HOOK BUCAĞI: ${s.angle}\n` +
  `- Frame 0 hook-dur: ilk 1.5 saniyədə iddia/açıq sual, səssiz oxunur. Faktı yox, BOŞLUĞU aç.\n` +
  `- ~4s/9s/15s-də yenidən tut: ${s.rehook}. Payoff-u əvvəldən vəd et, sonda ver (heç vaxt yalan).\n` +
  `- CTA = BİR hərəkət (Zəng et / Saxla / Göndər), səbəb cümləsi ask-dan əvvəl.`;

/** ai-brain analoqu: content/brain.md — keçmiş qaliblər, işləyən hook nümunələri (analytics.ts yazır) */
export const memory = (maxChars = 3000): string => {
  const p = "content/brain.md";
  if (!fs.existsSync(p)) return "";
  const s = fs.readFileSync(p, "utf-8").trim();
  return s ? `\n\nYADDAŞ (ai-brain — bizim keçmiş nəticələr; işləyən nümunələrin STRUKTURUNU təkrar et, sözlərini yox):\n${s.slice(0, maxChars)}` : "";
};

/** Mövcud post sayı — rotasiya toxumu */
export const postCount = (): number => {
  try { return fs.readdirSync("content/data").filter((f) => f.endsWith(".meta.json")).length; } catch { return 0; }
};

if (process.argv[1]?.endsWith("skills.ts")) {
  const names = process.argv.slice(2);
  console.log(names.length ? playbook(names) : fs.readdirSync(DIR).filter((d) => fs.existsSync(path.join(DIR, d, "SKILL.md"))).join("\n"));
}

/** Kontent təqvimi (calendar.ts): bu günün slotu — şablona görə */
export const todaySlot = (template: string): any | null => {
  try {
    const cal = JSON.parse(fs.readFileSync("content/calendar.json", "utf-8"));
    const d = new Date().toISOString().slice(0, 10);
    return cal.slots.find((s: any) => s.date === d && s.template === template) ?? null;
  } catch { return null; }
};

/** Bu günün planı prompt üçün; slotun məqsədi/bucağı varsa strategiyanı ona uyğunlaşdırır */
export const planFor = (template: string, seed: number): { strategy: Strategy; text: string } => {
  const slot = todaySlot(template);
  const base = strategyFor(seed);
  if (!slot) return { strategy: base, text: strategyText(base) };
  const g = GOALS.find((x) => x.goal === slot.goal) ?? GOALS[seed % GOALS.length];
  const strategy: Strategy = { ...g, angle: slot.angle || base.angle, rehook: base.rehook };
  const text = strategyText(strategy) +
    `\n\nPLAN (kontent təqvimi, bu günün slotu — mövzu bundan gəlsin):\n- Sütun: ${slot.pillar}\n- İdeya: ${slot.idea}\n- Hook fikri: ${slot.hook}${slot.series ? `\n- Seriya: ${slot.series}` : ""}`;
  return { strategy, text };
};
