/**
 * "Story" şablonu — AI ilə yaradılmış illüstrasiyalarla (public/assets) "Köç günü" hekayəsi.
 * Səhnələr: zəng → qablaşdırma → yükləmə → çatdı → CTA. Mətnlər yuk.az faktlarına əsaslanır.
 *
 *   npx tsx pipeline/story.ts
 *   EXPLAINER_SILENT=1   → səsləndirməsiz (yalnız musiqi + SFX)
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
const MIN_FRAMES: Record<string, number> = { call: 110, pack: 130, load: 150, arrive: 140 };
const CTA_FRAMES = 110;

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
const log = (m: string) => console.log(`  ${m}`);

type Step = { heading: string; spoken: string };
type Content = { call: Step; pack: Step; load: Step; arrive: Step; cta: { line1: string }; caption: string; hashtags: string[] };

const step = (hint: string) => ({
  type: "object", additionalProperties: false, required: ["heading", "spoken"],
  properties: {
    heading: { type: "string", description: `maks 4 söz, zərbəli. ${hint}` },
    spoken: { type: "string", description: "7-11 söz, canlı danışıq dili" },
  },
});
const schema = {
  type: "object", additionalProperties: false,
  required: ["call", "pack", "load", "arrive", "cta", "caption", "hashtags"],
  properties: {
    call: step("Səhnə: bina qarşısında telefon çalır — 'bir zəng bəsdir' ideyası"),
    pack: step("Səhnə: daşıyıcı qutu ilə gəlir, qutular yığılır, divan sürüşür — qablaşdırma bizdən"),
    load: step("Səhnə: maşın gəlir, əşyalar içinə uçur, maşın yola düşür — yüklədik"),
    arrive: step("Səhnə: maşın yeni binaya çatır, daşıyıcı qutunu aparır — yeni evə xoş gəldin"),
    cta: { type: "object", additionalProperties: false, required: ["line1"], properties: { line1: { type: "string", description: "maks 28 simvol" } } },
    caption: { type: "string" },
    hashtags: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
  },
} as const;

const SYSTEM = `Sən Yuk.az üçün Instagram Reels ssenaristisən. Yuk.az — Azərbaycanda yükdaşıma və ev daşınması xidmətidir.
Hədəf: yük sahibləri. Bu video "Köç günü" illüstrasiyalı hekayəsidir — personaj, qutular, yük maşını, binalar.
Səhnələr sabitdir: zəng (bina + telefon) → qablaşdırma (daşıyıcı, qutular, divan) → yükləmə (maşın, əşyalar içinə uçur) → çatdı (yeni bina) → CTA.
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
  // İllüstrasiya videosu default səssizdir — yalnız musiqi + effektlər + ekran mətni (STORY_VOICE=1 ilə səsli)
  const silent = process.env.STORY_VOICE !== "1";
  const feedback = process.env.FEEDBACK?.trim() || undefined;

  console.log("\n1. Faktlar (yuk.az)…");
  const all = await listArticles();
  const az = all.filter((a) => a.lang === "az");
  // proses haqqında ən çox məlumat verən məqalələr: başlıqlarında "zəng", "daşınma günü", "operator" keçənlər
  const facts = az.slice(0, 3).map((a) => `• ${a.title}\n${a.headings.join(" | ")}\n${a.text.slice(0, 1500)}`).join("\n\n");
  log(`${az.length} AZ məqalədən faktlar götürüldü`);

  console.log("2. Ssenari…");
  const c = await writeContent(facts, feedback);
  log(`${c.call.heading} → ${c.pack.heading} → ${c.load.heading} → ${c.arrive.heading}`);

  const day = Math.floor(Date.now() / 86400_000);
  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-story`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  const order = ["call", "pack", "load", "arrive"] as const;
  const spoken: Record<string, string> = { call: c.call.spoken, pack: c.pack.spoken, load: c.load.spoken, arrive: c.arrive.spoken };

  let tts: Record<string, { words: any[]; duration: number }> = {};
  const voice = process.env.OPENAI_TTS_VOICE || pickVoice(id + c.call.heading);
  if (!silent) {
    console.log(`3. Səsləndirilir (OpenAI ${voice})…`);
    tts = await runTts(order.map((k) => ({ id: k, text: spoken[k] })), dir, voice);
    await normalizeVo([...order], dir);
    log(`${Object.values(tts).reduce((a, b) => a + b.duration, 0).toFixed(1)} san səs`);
  } else {
    console.log("3. Səssiz rejim — yalnız musiqi + SFX");
  }

  const frames = (k: string) => Math.max(MIN_FRAMES[k], tts[k] ? Math.ceil(tts[k].duration * FPS) + TAIL : 0);
  const scene = (kind: string, heading: string) => ({
    kind, heading, spoken: spoken[kind] ?? "", audio: tts[kind] ? `render/${id}/${kind}.wav` : null,
    words: tts[kind]?.words ?? [], durationInFrames: frames(kind),
  });
  const scenes = [
    scene("call", c.call.heading), scene("pack", c.pack.heading), scene("load", c.load.heading), scene("arrive", c.arrive.heading),
    { kind: "cta", heading: "", spoken: "", audio: null, words: [], durationInFrames: CTA_FRAMES },
  ];
  const secs = (scenes.reduce((a, b) => a + b.durationInFrames, 0) - (scenes.length - 1) * TRANSITION) / FPS;

  console.log("4. Musiqi…");
  const music = await pickMusic(day, secs, dir, id, log);

  const props = { id, cta: { line1: c.cta.line1, line2: "Zəng et" }, music: music.track || null, musicVolume: silent ? 0.75 : 0.5, scenes };
  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "Story", articleId: null, link: "https://yuk.az",
      caption: music.attribution ? `${c.caption}\n\n${music.attribution}` : c.caption,
      hashtags: c.hashtags, music: music.track || null, attribution: music.attribution, musicTrack: music.musicTrack,
      voice: silent ? null : voice, silent,
    }, null, 2),
    "utf-8"
  );

  console.log(`\n✓ Hazırdır: ${id}  (${secs.toFixed(1)} san, ${silent ? "səssiz" : "səs: " + voice})`);
  console.log(`  Render: npx remotion render src/index.ts Story out/${id}.mp4 --props=${dir}/props.json\n`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
