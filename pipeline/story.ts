/**
 * "Story" şablonu — hər post üçün FƏRQLİ AI illüstrasiya dəsti ilə "Köç günü" hekayəsi (fun, beynəlxalq trend əsaslı).
 *   1) Konsept (gpt-5.5): webdən tapılan REAL trend nümunəsi (trends.ts) → 4 səhnəlik yumorlu hekayə +
 *      bu post üçün vizual üslub (beynəlxalq trend üslubları rotasiya ilə: claymation, Ghibli-vari, LEGO, kağız-kəsmə, pixel-art…)
 *   2) Assetlər: gen_assets.py → public/render/<id>/assets (3 fon + 6 obyekt, hamısı həmin üslubda), bounds.json
 *   3) Səhnələr: zəng → qablaşdırma → yükləmə → çatdı → CTA (mexanika sabit, görüntü və mətn hər dəfə yeni)
 *
 *   npx tsx pipeline/story.ts
 *   STORY_VOICE=1        → səsli (default səssiz: musiqi + SFX + ekran mətni)
 *   STORY_REUSE_ASSETS=1 → asset yaratma, ortaq public/assets (test üçün, ucuz)
 */
import "dotenv/config";
import "./plan.ts";
import { playbook, planFor, memory, postCount } from "./skills.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { listArticles } from "./wp.ts";
import { getTrends } from "./trends.ts";
import { runTts, normalizeVo, pickMusic } from "./audio.ts";
import { pickVoice, contact } from "../src/brand/contact.ts";
import { chat, type ChatOpts } from "./llm.ts";
import { novelty, remember, type Novelty } from "./ideas.ts";

const FPS = 30;
const TAIL = 16;
const TRANSITION = 12;
/** Animasiyaların tamamlanması üçün minimum kadr — səsləndirmə qısa olsa da */
const MIN_FRAMES: Record<string, number> = { call: 110, pack: 130, load: 150, arrive: 140 };
const CTA_FRAMES = 110;

const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";
const log = (m: string) => console.log(`  ${m}`);

/** Beynəlxalq trend illüstrasiya üslubları — hər post fərqli (əvvəlki postların üslubu çıxarılır) */
const STYLES: Record<string, string> = {
  "claymation":     "Stop-motion claymation look: hand-sculpted plasticine characters and objects with visible fingerprints and soft clay texture, miniature set, tilt-shift depth of field, warm practical lighting.",
  "ghibli":         "Hand-painted anime film look inspired by classic Japanese animation studios: soft watercolor backgrounds, gentle cel-shaded characters with big expressive eyes, warm nostalgic light, painterly clouds.",
  "lego":           "Built entirely from plastic toy building bricks: blocky brick characters with cylindrical heads, studded surfaces, glossy plastic sheen, toy-photography lighting.",
  "papercut":       "Layered paper cut-out craft style: flat paper shapes with subtle drop shadows between layers, visible paper grain, diorama depth, soft studio light.",
  "pixel":          "Chunky 16-bit pixel-art style: crisp pixels, limited palette dithering, retro video game charm, clean readable silhouettes.",
  "lowpoly":        "Isometric low-poly 3D style: faceted geometric shapes, flat-shaded polygons, clean pastel-and-brand palette, soft ambient occlusion, miniature world feel.",
  "retro-cartoon":  "1990s Saturday-morning cartoon style: bold black outlines, flat cel colors, exaggerated squash-and-stretch proportions, halftone texture accents.",
  "felt":           "Needle-felted wool craft style: fuzzy wool fiber texture on every surface, cozy handmade toy look, soft diffused light, macro photography feel.",
  "storybook":      "Children's picture-book watercolor style: loose ink outlines, translucent watercolor washes, paper texture, whimsical proportions, warm and friendly.",
  "voxel":          "Voxel 3D style: everything built from small cubes, blocky sandbox-game aesthetic, soft global illumination, playful miniature scale.",
  "ligne-claire":   "Franco-Belgian comic 'ligne claire' style: uniform clean ink lines, flat bright colors, no gradients, classic adventure-comic charm.",
  "pixar":          "Vibrant polished 3D-rendered animation-film look: soft warm studio lighting, rich gradients, subtle rim light, rounded friendly shapes, high detail with clean silhouettes.",
};

type Step = { heading: string; spoken: string; visual: string };
type Content = {
  styleKey: string; setting: string; objects: Record<string, string>; inspirationIndex: number;
  call: Step; pack: Step; load: Step; arrive: Step; cta: { line1: string }; caption: string; hashtags: string[];
};

const step = (hint: string) => ({
  type: "object", additionalProperties: false, required: ["heading", "spoken", "visual"],
  properties: {
    heading: { type: "string", description: `Ekran mətni, maks 7 söz, video səssizdir — hekayəni bu daşıyır. ${hint}` },
    spoken: { type: "string", description: "7-11 söz, canlı danışıq dili (səsli rejim üçün)" },
    visual: { type: "string", description: "İNGİLİSCƏ, 1 cümlə: bu səhnənin fonuna əlavə əhval/detal (hava, vaxt, məkan komik detalı)" },
  },
});
const schema = {
  type: "object", additionalProperties: false,
  required: ["styleKey", "setting", "objects", "inspirationIndex", "call", "pack", "load", "arrive", "cta", "caption", "hashtags"],
  properties: {
    styleKey: { type: "string", enum: Object.keys(STYLES), description: "bu post üçün vizual üslub — icazə verilən siyahıdan, əvvəlki postlarda istifadə olunmayan" },
    setting: { type: "string", description: "İNGİLİSCƏ, 1 cümlə: YALNIZ hava/mövsüm/vaxt/işıq/şəhər əhvalı (məs. 'rainy autumn evening, wet asphalt reflections, Baku'). Fonlar boş səhnə plakasıdır — insan, maşın, mebel, yazı, pəncərədə üz və s. YAZMA (onlar ayrıca obyektlərdir)" },
    objects: {
      type: "object", additionalProperties: false, required: ["truck", "mover", "boxes", "sofa", "plant", "phone"],
      properties: {
        truck: { type: "string", description: "İNGİLİSCƏ: yük maşını (sağa baxan, qrafit kuza + narıncı kabinə saxla), üsluba və hekayəyə uyğun detal" },
        mover: { type: "string", description: "İNGİLİSCƏ: daşıyıcı personaj (sağa addımlayan, qutu daşıyan, narıncı köynək) — bu postun personajı (yaş, ifadə, komik detal)" },
        boxes: { type: "string", description: "İNGİLİSCƏ: karton qutu yığını (narıncı lentli)" },
        sofa:  { type: "string", description: "İNGİLİSCƏ: divan (hekayəyə uyğun — məs. nəhəng, köhnə, dəbdəbəli)" },
        plant: { type: "string", description: "İNGİLİSCƏ: dibçək bitki" },
        phone: { type: "string", description: "İNGİLİSCƏ: gələn zəng ekranlı smartfon (narıncı zəng düyməsi)" },
      },
    },
    inspirationIndex: { type: "integer", description: "istifadə etdiyin REAL trend nümunəsinin siyahıdakı nömrəsi (1-dən), yoxdursa 0" },
    call: step("Səhnə 1 (setup): bina qarşısında telefon çalır — hekayənin başlanğıcı / açıq sual"),
    pack: step("Səhnə 2 (eskalasiya): daşıyıcı qutu ilə gəlir, qutular yığılır, divan sürüşür"),
    load: step("Səhnə 3 (kulminasiya): maşın gəlir, əşyalar içinə uçur — gərginlik + həll"),
    arrive: step("Səhnə 4 (payoff): maşın yeni binaya çatır — rahatlama, zarafatın cavabı"),
    cta: { type: "object", additionalProperties: false, required: ["line1"], properties: { line1: { type: "string", description: "maks 28 simvol, hekayənin bir cümləlik nəticəsi" } } },
    caption: { type: "string" },
    hashtags: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
  },
} as const;

const SYSTEM = `Sən Yük.az (Azərbaycanda ev/ofis köçü, yükdaşıma) üçün FUN illüstrasiyalı Instagram Reels ssenaristisən və art-direktorsan.
Hədəf: yük sahibləri. Video SƏSSİZ illüstrasiya hekayəsidir: 4 sabit səhnə mexanikası (zəng → qablaşdırma → yükləmə → çatdı) + CTA; görüntü və mətn hər dəfə YENİ.
HEKAYƏ: verilən REAL beynəlxalq trend nümunələrindən (viral tweet/meme mətnləri) birini götür, zarafatın strukturunu saxlayıb köç situasiyasına uyğunlaşdır — going-viral arkı: səhnə 1 açıq sual/vəd, 2-3 eskalasiya, 4 payoff. Yerli detal (Bakı, lift, qonşu, "az şeyimiz var"). Uydurma yumor yox, öz-özünə gülə bilən ton.
VİZUAL: bu post üçün siyahıdan bir üslub seç (əvvəlkiləri təkrar etmə) və məkan/əhval + obyekt təsvirlərini həmin üsluba və hekayəyə uyğun yaz (ingiliscə, konkret, komik detal ola bilər: məs. mover = "a tiny grandma mover", sofa = "an absurdly long sofa").
QAYDALAR: KONKRET QİYMƏT YAZMA; sadə danışıq azərbaycan dili, "sən"; ekran mətni maks 7 söz, orfoqrafiya səhvsiz; "spoken"-də "Yük nöqtə az", ekranda "Yük.az".
Caption: ilk sətir hook (sual/zarafat), 2-3 qısa emojili sətir, sonda sual; nömrə yazma (sistem əlavə edir).`;

/** Sorğu qurucusu — eyni prompt/sxem compare.ts-də də istifadə olunur */
export const storyRequest = (facts: string, trendText: string, usedStyles: string[], feedback: string | undefined, nv: Novelty): ChatOpts => ({
  task: "creative", name: "story", model: MODEL, schema: schema, seed: nv.seed, messages: [
        { role: "system", content: SYSTEM + playbook(["going-viral", "story-sequencer", "reel-builder", "on-screen-text-writer", "trend-spotter"]) + planFor("Story", postCount()).text + memory() + nv.text },
        { role: "user", content:
          `REAL TREND NÜMUNƏLƏRİ (webdən, bu həftə):\n${trendText || "(tapılmadı — ən məşhur relatable köç yumorunu istifadə et, amma sitat uydurma)"}\n\n` +
          `ÜSLUBLAR: ${Object.keys(STYLES).join(", ")}${usedStyles.length ? `\nƏVVƏLKİ POSTLARDA İSTİFADƏ OLUNUB (seçmə): ${usedStyles.join(", ")}` : ""}\n\n` +
          `YUK.AZ FAKTLARI (istinad üçün):\n${facts}\n\nBu post üçün konsept, 4 səhnə və vizual dəst yaz.${feedback ? `\n\nİSTİFADƏÇİ QEYDİ, MÜTLƏQ nəzərə al:\n${feedback}` : ""}` },
      ],
});

const writeContent = async (facts: string, trendText: string, usedStyles: string[], feedback?: string): Promise<Content> => {
  const nv = novelty("Story", { motion: true });
  const __r = await chat<any>(storyRequest(facts, trendText, usedStyles, feedback, nv));
  const c = (__r.data) as Content;
  remember("Story", c, nv);
  if (!c.caption.includes(contact.phone)) c.caption = `${c.caption.trim()}\n\n📞 Zəng et: ${contact.phone}`;
  return c;
};

/** gen_assets.py — bu postun qovluğuna, bu postun üslubunda */
const genAssets = (dir: string, c: Content) =>
  new Promise<void>((res, rej) => {
    const py = spawn("python", ["pipeline/gen_assets.py", "--all"], {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8",
        ASSET_DIR: path.join(dir, "assets"), BOUNDS_PATH: path.join(dir, "bounds.json"),
        ASSET_STYLE: STYLES[c.styleKey] ?? STYLES.pixar, ASSET_SETTING: c.setting, ASSET_OBJECTS: JSON.stringify(c.objects),
      },
    });
    py.on("close", (code) => (code === 0 ? res() : rej(new Error(`gen_assets.py ${code}`))));
  });

const main = async () => {
  // İllüstrasiya videosu default səssizdir — yalnız musiqi + effektlər + ekran mətni (STORY_VOICE=1 ilə səsli)
  const silent = process.env.STORY_VOICE !== "1";
  const feedback = process.env.FEEDBACK?.trim() || undefined;
  const reuse = process.env.STORY_REUSE_ASSETS === "1";

  console.log("\n1. Faktlar + real trend nümunələri…");
  const az = (await listArticles()).filter((a) => a.lang === "az");
  const facts = az.slice(0, 3).map((a) => `• ${a.title}\n${a.headings.join(" | ")}\n${a.text.slice(0, 900)}`).join("\n\n");
  const trends = await getTrends();
  // əvvəlki postların ilham sitatları və üslubları — təkrar olmasın
  const usedQuotes = new Set<string>(); const usedStyles: string[] = [];
  for (const f of await fs.readdir("content/data").catch(() => [] as string[])) {
    if (!f.endsWith(".meta.json")) continue;
    const m = JSON.parse(await fs.readFile(`content/data/${f}`, "utf-8").catch(() => "{}"));
    if (m?.inspiration?.quote) usedQuotes.add(String(m.inspiration.quote).trim().toLowerCase());
    if (m?.template === "Story" && m?.style) usedStyles.push(m.style);
  }
  const examples = trends.examples.filter((e) => !usedQuotes.has(e.quote.trim().toLowerCase()));
  const trendText = examples.map((e, i) => `${i + 1}. [${e.platform}] "${e.quote}" — ${e.context} (${e.whyFunny})`).join("\n");
  log(`${examples.length} real nümunə, ${usedStyles.length} istifadə olunmuş üslub`);

  console.log(`2. Konsept + ssenari (${MODEL})…`);
  const c = await writeContent(facts, trendText, usedStyles.slice(-6), feedback);
  const insp = examples[c.inspirationIndex - 1];
  log(`üslub: ${c.styleKey} | ${c.setting}`);
  log(`${c.call.heading} → ${c.pack.heading} → ${c.load.heading} → ${c.arrive.heading}`);
  if (insp) log(`ilham: "${insp.quote.slice(0, 80)}"`);

  const day = Math.floor(Date.now() / 86400_000);
  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-story`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  let assetsBase = "assets"; let bounds: any = undefined;
  if (!reuse) {
    console.log("3. Assetlər — bu post üçün yeni dəst (9 şəkil, ~5 dəq)…");
    await genAssets(dir, c);
    assetsBase = `render/${id}/assets`;
    bounds = JSON.parse(await fs.readFile(path.join(dir, "bounds.json"), "utf-8"));
  } else {
    console.log("3. Assetlər — ortaq dəst (STORY_REUSE_ASSETS=1)");
  }

  const order = ["call", "pack", "load", "arrive"] as const;
  const spoken: Record<string, string> = { call: c.call.spoken, pack: c.pack.spoken, load: c.load.spoken, arrive: c.arrive.spoken };

  let tts: Record<string, { words: any[]; duration: number }> = {};
  const voice = process.env.OPENAI_TTS_VOICE || pickVoice(id + c.call.heading);
  if (!silent) {
    console.log(`4. Səsləndirilir (OpenAI ${voice})…`);
    tts = await runTts(order.map((k) => ({ id: k, text: spoken[k] })), dir, voice);
    await normalizeVo([...order], dir);
    log(`${Object.values(tts).reduce((a, b) => a + b.duration, 0).toFixed(1)} san səs`);
  } else {
    console.log("4. Səssiz rejim — yalnız musiqi + SFX");
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

  console.log("5. Musiqi…");
  const music = await pickMusic(day, secs, dir, id, log);

  const props = { id, assets: assetsBase, bounds, cta: { line1: c.cta.line1, line2: "Zəng et" }, music: music.track || null, musicVolume: silent ? 0.75 : 0.5, scenes };
  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "Story", articleId: null, link: "https://yuk.az",
      caption: c.caption,   // musiqi krediti caption-a yox — ilk şərh kimi gedir
      hashtags: c.hashtags, music: music.track || null, attribution: music.attribution, musicTrack: music.musicTrack,
      voice: silent ? null : voice, silent,
      style: c.styleKey, setting: c.setting, kind: "fun",
      inspiration: insp ? { url: insp.url, quote: insp.quote } : null,
    }, null, 2),
    "utf-8"
  );

  console.log(`\n✓ Hazırdır: ${id}  (${secs.toFixed(1)} san, ${silent ? "səssiz" : "səs: " + voice}, üslub: ${c.styleKey})`);
  console.log(`  Render: npx remotion render src/index.ts Story out/${id}.mp4 --props=${dir}/props.json\n`);
};

if (/[\\/]story\.ts$/.test(process.argv[1] ?? "")) main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
