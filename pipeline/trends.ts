/**
 * Fun ilham mənbəyi — REAL nümunələr, uydurma yox:
 *   1) OpenAI web_search (gpt-5.5): bu həftə həqiqətən viral olmuş konkret postlar — dəqiq mətn (sitat) + mənbə URL
 *      (Reddit, X, Instagram, TikTok, 9GAG, türk/azərbaycan yumor səhifələri); köç/yük/qonşu/tıxac mövzuları + ümumi trend
 *   2) Imgflip məşhur meme şablonları (pulsuz, açarsız) — ad + şəkil URL; konsept modeli şəkli GÖRÜR və strukturu sadiq saxlayır
 * Nəticə gündəlik content/trends.json-a keşlənir (eyni gün təkrar sorğu yoxdur).
 */
import fs from "node:fs/promises";

const CACHE = "content/trends.json";
const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";

export type RealExample = { platform: string; url: string; quote: string; context: string; whyFunny: string };
export type MemeTemplate = { name: string; url: string };
export type Trends = { date: string; examples: RealExample[]; templates: MemeTemplate[] };

const imgflipTemplates = async (): Promise<MemeTemplate[]> => {
  try {
    const res = await fetch("https://api.imgflip.com/get_memes");
    const j = (await res.json()) as any;
    return (j.data.memes as any[]).slice(0, 40).map((m) => ({ name: m.name as string, url: m.url as string }));
  } catch { return []; }
};

const exampleSchema = {
  type: "object", additionalProperties: false, required: ["examples"],
  properties: {
    examples: {
      type: "array", minItems: 6, maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["platform", "url", "quote", "context", "whyFunny"],
        properties: {
          platform: { type: "string" },
          url: { type: "string", description: "the real page URL you found it on, verbatim" },
          quote: { type: "string", description: "the post's EXACT text / caption / meme text, verbatim (translate to English in brackets if not English)" },
          context: { type: "string", description: "what the image/video shows, 1 sentence" },
          whyFunny: { type: "string", description: "the joke mechanism in 1 sentence" },
        },
      },
    },
  },
} as const;

const webScout = async (): Promise<RealExample[]> => {
  const prompt = `Collect REAL jokes that actually went viral this week / this month, where the JOKE TEXT itself is readable on the page. Best sources — open them and copy the jokes:
- weekly "funniest tweets of the week" roundups (The Poke, Bored Panda, BuzzFeed, Pleated-Jeans, Twistedsifter)
- Turkish "haftanın en komik tweetleri / paylaşımları" roundups (Onedio, Listelist) and Azerbaijani humour pages
- "trending memes this week/month" explainers (Know Your Meme editorials, NapoleonCat, Later) — only when the meme's actual caption/text is given
- Reddit r/memes, r/me_irl, r/mildlyinfuriating ONLY if the joke is in the title/text (skip image-only posts whose title is meaningless like "So many of them")
Prefer relatable domestic/household/moving/renting/neighbours/traffic/adulting/work jokes and the 3-4 hottest general formats.
STRICT: quote = the actual joke text VERBATIM (tweet text or meme caption), not a headline or post title; url = the page you copied it from; never invent or paraphrase. Skip offensive, political, or other-company content. Return 8-12 examples. Work fast: a few searches, open 3-4 pages, then answer.`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
  // Axtarış bir neçə dəqiqə çəkə bilər — fetch-in 5 dəq başlıq limitinə düşməmək üçün background rejim + sorğulama
  let res!: Response;
  for (let i = 0; i < 4; i++) {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers,
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: "web_search" }],
        input: prompt,
        reasoning: { effort: "low" },
        background: true,
        text: { format: { type: "json_schema", name: "real_examples", strict: true, schema: exampleSchema } },
      }),
    });
    if (res.status !== 429 || i === 3) break;
    console.log("  OpenAI limit (429) — 20 san gözlənilir…");
    await new Promise((r) => setTimeout(r, 20000));
  }
  if (!res.ok) throw new Error(`web_search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let job = (await res.json()) as any;
  const t0 = Date.now();
  while (["queued", "in_progress"].includes(job.status)) {
    if (Date.now() - t0 > 12 * 60 * 1000) throw new Error("web_search vaxt bitdi");
    await new Promise((r) => setTimeout(r, 8000));
    const r = await fetch(`https://api.openai.com/v1/responses/${job.id}`, { headers });
    if (r.ok) job = await r.json();
  }
  if (job.status !== "completed") throw new Error(`web_search status ${job.status}: ${JSON.stringify(job.error ?? "").slice(0, 200)}`);
  const out = job.output as any[];
  const txt = out.filter((o) => o.type === "message").flatMap((o) => o.content).map((c) => c.text ?? "").join("");
  const ex = (JSON.parse(txt) as { examples: RealExample[] }).examples;
  return ex.filter((e) => /^https?:\/\//.test(e.url) && e.quote.trim().length > 3);
};

/** Bu günün real nümunələri — keşdən və ya webdən */
export const getTrends = async (): Promise<Trends> => {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const c = JSON.parse(await fs.readFile(CACHE, "utf-8")) as Trends;
    if (c.date === date && c.examples?.length) return c;
  } catch { /* keş yoxdur */ }
  let examples: RealExample[] = [];
  try { examples = await webScout(); console.log(`  web: ${examples.length} real nümunə`); }
  catch (e: any) { console.log(`  web_search alınmadı (${e.message}) — yalnız meme şablonları ilə davam`); }
  const templates = await imgflipTemplates();
  const t: Trends = { date, examples, templates };
  await fs.mkdir("content", { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(t, null, 2), "utf-8");
  return t;
};

if (process.argv[1]?.endsWith("trends.ts")) {
  await import("dotenv/config");
  const t = await getTrends();
  for (const e of t.examples) console.log(`• [${e.platform}] ${e.quote.slice(0, 100)}\n    ${e.url}`);
  console.log("\nŞablonlar:", t.templates.slice(0, 12).map((x) => x.name).join(", "));
}
