/**
 * Fun ilham mənbəyi — webdən bu həftənin trend meme formatları və köç/yük mövzulu yumor.
 *   1) OpenAI web_search (gpt-5.5) — Instagram/TikTok/Reddit + AZ/TR sosial media trendləri
 *   2) Imgflip məşhur meme formatları (pulsuz, açarsız) — yalnız ad/format, şəkil istifadə olunmur
 * Nəticə gündəlik content/trends.json-a keşlənir (eyni gün təkrar sorğu yoxdur).
 */
import fs from "node:fs/promises";

const CACHE = "content/trends.json";
const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";

export type Trends = { date: string; web: string; formats: string[] };

const imgflipFormats = async (): Promise<string[]> => {
  try {
    const res = await fetch("https://api.imgflip.com/get_memes");
    const j = (await res.json()) as any;
    return (j.data.memes as any[]).slice(0, 40).map((m) => m.name as string);
  } catch { return []; }
};

const webScout = async (): Promise<string> => {
  const prompt = `Research quickly and answer in English, max 350 words, as a numbered list of 8 items.
Find what is trending THIS WEEK in fun/relatable content on Instagram Reels, TikTok, Reddit (r/memes, r/mildlyinfuriating) and Azerbaijani/Turkish social media:
meme formats, viral joke structures, relatable "moving house / relocating / delivery / cargo / neighbours / Baku traffic" humour.
For each item: (a) the format or joke structure in one line, (b) why it lands, (c) one concrete way a moving & cargo company (movers in orange t-shirts, a branded box truck, cardboard boxes, a phone call) could remake it as a single static image with a 2-4 word punchline.
No brand names of other companies. No sources needed in the text.`;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, tools: [{ type: "web_search" }], input: prompt }),
  });
  if (!res.ok) throw new Error(`web_search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = ((await res.json()) as any).output as any[];
  return out.filter((o) => o.type === "message").flatMap((o) => o.content).map((c) => c.text ?? "").join("\n")
    .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "")  // ([site](url)) istinadlarını sil
    .trim();
};

/** Bu günün trend xülasəsi — keşdən və ya webdən */
export const getTrends = async (): Promise<Trends> => {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const c = JSON.parse(await fs.readFile(CACHE, "utf-8")) as Trends;
    if (c.date === date && c.web) return c;
  } catch { /* keş yoxdur */ }
  let web = "";
  try { web = await webScout(); } catch (e: any) { console.log(`  web_search alınmadı (${e.message}) — modelin öz biliyi ilə davam`); }
  const formats = await imgflipFormats();
  const t = { date, web, formats };
  await fs.mkdir("content", { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(t, null, 2), "utf-8");
  return t;
};

if (process.argv[1]?.endsWith("trends.ts")) {
  await import("dotenv/config");
  const t = await getTrends();
  console.log(t.web, "\n\nFormatlar:", t.formats.slice(0, 15).join(", "));
}
