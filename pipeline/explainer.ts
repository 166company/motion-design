/**
 * "Explainer" şablonu — tam kodla çəkilmiş kinetik izahat.
 * Mətnlər yuk.az məqalələrinə əsaslanır (uydurma yoxdur), səs OpenAI, musiqi Audius CC.
 *
 *   npx tsx pipeline/explainer.ts           → props + meta yazır
 *   EXPLAINER_SILENT=1                      → səsləndirməsiz (yalnız musiqi + SFX)
 */
import "dotenv/config";
import "./plan.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { listArticles } from "./wp.ts";
import { runTts, normalizeVo, pickMusic } from "./audio.ts";
import { pickVoice, contact } from "../src/brand/contact.ts";

const FPS = 30;
const TAIL = 16;
const TRANSITION = 12;
/** Animasiyaların tamamlanması üçün minimum kadr — səsləndirmə qısa olsa da */
const MIN_FRAMES: Record<string, number> = { intro: 110, call: 100, chat: 130, load: 140, route: 140 };
const CTA_FRAMES = 110;

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
const log = (m: string) => console.log(`  ${m}`);

type Content = {
  intro: { heading: string; spoken: string };
  call: { heading: string; spoken: string };
  chat: { heading: string; lines: string[]; spoken: string };
  load: { heading: string; spoken: string };
  route: { heading: string; from: string; to: string; spoken: string };
  cta: { line1: string };
  caption: string;
  hashtags: string[];
};

const schema = {
  type: "object", additionalProperties: false,
  required: ["intro", "call", "chat", "load", "route", "cta", "caption", "hashtags"],
  properties: {
    intro: { type: "object", additionalProperties: false, required: ["heading", "spoken"],
      properties: { heading: { type: "string", description: "3-5 söz, zərbəli, sonu vurğulu" }, spoken: { type: "string", description: "6-9 söz" } } },
    call: { type: "object", additionalProperties: false, required: ["heading", "spoken"],
      properties: { heading: { type: "string", description: "maks 4 söz" }, spoken: { type: "string", description: "7-11 söz, nömrəni oxuma" } } },
    chat: { type: "object", additionalProperties: false, required: ["heading", "lines", "spoken"],
      properties: {
        heading: { type: "string", description: "maks 5 söz; operatorun telefonda detalları soruşması haqqında (məs 'Operator detalları dəqiqləşdirir'). 'Mesaj yaz' kimi YOX — bu zəng söhbətidir" },
        lines: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" },
          description: "3 çat baloncuğu: [operator sualı, müştəri cavabı, operatorun təsdiqi]. Hər biri maks 6 söz. Rəqəm/qiymət YOX." },
        spoken: { type: "string", description: "7-11 söz" } } },
    load: { type: "object", additionalProperties: false, required: ["heading", "spoken"],
      properties: { heading: { type: "string", description: "maks 5 söz" }, spoken: { type: "string", description: "7-11 söz" } } },
    route: { type: "object", additionalProperties: false, required: ["heading", "from", "to", "spoken"],
      properties: {
        heading: { type: "string", description: "maks 5 söz" },
        from: { type: "string", description: "başlanğıc şəhər, məs Bakı" },
        to: { type: "string", description: "təyinat şəhər, məs Gəncə / Sumqayıt / Naxçıvan" },
        spoken: { type: "string", description: "7-11 söz" } } },
    cta: { type: "object", additionalProperties: false, required: ["line1"], properties: { line1: { type: "string", description: "maks 28 simvol" } } },
    caption: { type: "string" },
    hashtags: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
  },
} as const;

const SYSTEM = `Sən Yuk.az üçün Instagram Reels ssenaristisən. Yuk.az — Azərbaycanda yükdaşıma və ev daşınması xidmətidir.
Hədəf: yük sahibləri. Bu video "Yuk.az ilə daşınma 4 addımda" izahatıdır — tam animasiyalı, stok video yoxdur.
Səhnələr sabitdir: intro (kub loqo düşür) → zəng (telefon çalır) → çat (operatorla yazışma) → yükləmə (maşına qutular) → marşrut (xəritədə yol) → CTA.
QAYDALAR: yalnız verilən məqalə faktlarına söykən; KONKRET QİYMƏT YAZMA; sadə danışıq azərbaycan dili, "sən"; hər "spoken" 7-11 söz (intro 6-9), canlı, ritmik. Ümumi video 28-32 saniyə olmalıdır.
"spoken"-də "Yuk.az" əvəzinə "Yük nöqtə az" yaz (brend belə tələffüz olunur). Ekran mətnlərində "Yük.az".
Caption formatı MƏCBURİ: emoji hook → boş sətir → 2-3 emojili qısa abzas → boş sətir → "📞 Zəng et: ${contact.phone}".`;

const writeContent = async (facts: string, feedback?: string): Promise<Content> => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `MƏQALƏ FAKTLARI (yuk.az):\n${facts}\n\nBu faktlara əsaslanan 4 addımlı izahat yaz.${feedback ? `\n\nİSTİFADƏÇİ QEYDİ, MÜTLƏQ nəzərə al:\n${feedback}` : ""}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "explainer", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const c = JSON.parse(((await res.json()) as any).choices[0].message.content) as Content;
  if (!c.caption.includes(contact.phone)) c.caption = `${c.caption.trim()}\n\n📞 Zəng et: ${contact.phone}`;
  return c;
};

const main = async () => {
  const silent = process.env.EXPLAINER_SILENT === "1";
  const feedback = process.env.FEEDBACK?.trim() || undefined;

  console.log("\n1. Faktlar (yuk.az)…");
  const all = await listArticles();
  const az = all.filter((a) => a.lang === "az");
  // proses haqqında ən çox məlumat verən məqalələr: başlıqlarında "zəng", "daşınma günü", "operator" keçənlər
  const facts = az.slice(0, 3).map((a) => `• ${a.title}\n${a.headings.join(" | ")}\n${a.text.slice(0, 1500)}`).join("\n\n");
  log(`${az.length} AZ məqalədən faktlar götürüldü`);

  console.log("2. Ssenari…");
  const c = await writeContent(facts, feedback);
  log(`intro: ${c.intro.heading} | marşrut: ${c.route.from} → ${c.route.to}`);

  const day = Math.floor(Date.now() / 86400_000);
  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-explainer`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  const order = ["intro", "call", "chat", "load", "route"] as const;
  const spoken: Record<string, string> = {
    intro: c.intro.spoken, call: c.call.spoken, chat: c.chat.spoken, load: c.load.spoken, route: c.route.spoken,
  };

  let tts: Record<string, { words: any[]; duration: number }> = {};
  const voice = process.env.OPENAI_TTS_VOICE || pickVoice(id + c.intro.heading);
  if (!silent) {
    console.log(`3. Səsləndirilir (OpenAI ${voice})…`);
    tts = await runTts(order.map((k) => ({ id: k, text: spoken[k] })), dir, voice);
    await normalizeVo([...order], dir);
    log(`${Object.values(tts).reduce((a, b) => a + b.duration, 0).toFixed(1)} san səs`);
  } else {
    console.log("3. Səssiz rejim — yalnız musiqi + SFX");
  }

  const frames = (k: string) => Math.max(MIN_FRAMES[k], tts[k] ? Math.ceil(tts[k].duration * FPS) + TAIL : 0);
  const scene = (kind: string, heading: string, extra: Partial<{ sub: string; lines: string[] }> = {}) => ({
    kind, heading, sub: extra.sub ?? "", lines: extra.lines ?? [],
    spoken: spoken[kind] ?? "", audio: tts[kind] ? `render/${id}/${kind}.wav` : null,
    words: tts[kind]?.words ?? [], durationInFrames: frames(kind),
  });
  const scenes = [
    scene("intro", c.intro.heading),
    scene("call", c.call.heading, { sub: contact.phone }),
    scene("chat", c.chat.heading, { lines: c.chat.lines }),
    scene("load", c.load.heading),
    scene("route", c.route.heading, { lines: [c.route.from, c.route.to] }),
    { kind: "cta", heading: "", sub: "", lines: [], spoken: "", audio: null, words: [], durationInFrames: CTA_FRAMES },
  ];
  const secs = (scenes.reduce((a, b) => a + b.durationInFrames, 0) - (scenes.length - 1) * TRANSITION) / FPS;

  console.log("4. Musiqi…");
  const music = await pickMusic(day, secs, dir, id, log);

  const props = { id, cta: { line1: c.cta.line1, line2: "Zəng et" }, music: music.track || null, musicVolume: silent ? 0.75 : 0.5, scenes };
  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "Explainer", articleId: null, link: "https://yuk.az",
      caption: music.attribution ? `${c.caption}\n\n${music.attribution}` : c.caption,
      hashtags: c.hashtags, music: music.track || null, attribution: music.attribution, musicTrack: music.musicTrack,
      voice: silent ? null : voice, silent,
    }, null, 2),
    "utf-8"
  );

  console.log(`\n✓ Hazırdır: ${id}  (${secs.toFixed(1)} san, ${silent ? "səssiz" : "səs: " + voice})`);
  console.log(`  Render: npx remotion render src/index.ts Explainer out/${id}.mp4 --props=${dir}/props.json\n`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
