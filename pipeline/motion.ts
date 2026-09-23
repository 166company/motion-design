/**
 * "Motion" şablonu — hər dəfə TAM FƏRQLİ illüstrasiya/motion-design videosu.
 *
 * Fərq: səhnə quruluşu sabit deyil. Model (gpt-5.5) bir video üçün bütün rejissuranı qurur:
 *   mövzu (topics.ts bankından, əvvəl işlənənlər bloklanır) → vizual üslub (əvvəlkilər bloklanır) →
 *   4-6 səhnə: fon, obyektlər, hər obyektin yeri/ölçüsü/hərəkəti, kamera, keçid, SFX, ekran mətni.
 * Assetlər həmin videonun öz siyahısına görə yaradılır (public/render/<id>/assets) — təkrar yoxdur.
 *
 *   npx tsx pipeline/motion.ts
 *   MOTION_TOPIC=piano        → mövzunu özün seç
 *   MOTION_REUSE_ASSETS=1     → asset yaratma (yalnız mətn/quruluş testi üçün)
 */
import "dotenv/config";
import "./plan.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { playbook as skillPlaybook, planFor, memory, postCount, todaySlot } from "./skills.ts";
import { chat, type ChatOpts } from "./llm.ts";
import { novelty, remember, type Novelty } from "./ideas.ts";
import { freshTopics, TOPICS, TONES } from "./topics.ts";
import { pickMusic } from "./audio.ts";
import { pickTrendMusic } from "./music_web.ts";
import { getPlaybook, playbookBlock } from "./movers.ts";
import { contact } from "../src/brand/contact.ts";
import { ANIMS, CAMERAS, SFX, TRANSITIONS, TRANSITION } from "../src/compositions/Motion.tsx";

const FPS = 30;
const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";
const log = (m: string) => console.log(`  ${m}`);

/** Vizual üslublar — hər video başqası (son 8 istifadə olunan bloklanır) */
export const STYLES: Record<string, string> = {
  claymation:    "Stop-motion claymation: hand-sculpted plasticine with visible fingerprints, miniature set, tilt-shift depth, warm practical light.",
  ghibli:        "Hand-painted anime film look: soft watercolor backgrounds, gentle cel-shaded shapes, warm nostalgic light, painterly clouds.",
  lego:          "Built from plastic toy bricks: blocky studded surfaces, glossy plastic sheen, toy-photography lighting.",
  papercut:      "Layered paper cut-out craft: flat paper shapes, drop shadows between layers, visible paper grain, diorama depth.",
  pixel:         "Chunky 16-bit pixel art: crisp pixels, limited palette dithering, retro game charm, clean silhouettes.",
  lowpoly:       "Isometric low-poly 3D: faceted geometry, flat-shaded polygons, soft ambient occlusion, miniature world.",
  retro_cartoon: "1990s Saturday-morning cartoon: bold black outlines, flat cel colors, exaggerated squash-and-stretch, halftone accents.",
  felt:          "Needle-felted wool craft: fuzzy fiber texture on every surface, cozy handmade toy look, soft diffused light.",
  storybook:     "Children's picture-book watercolor: loose ink outlines, translucent washes, paper texture, whimsical proportions.",
  voxel:         "Voxel 3D: everything built from small cubes, sandbox-game aesthetic, soft global illumination.",
  ligne_claire:  "Franco-Belgian 'ligne claire' comic: uniform clean ink lines, flat bright colors, no gradients.",
  risograph:     "Risograph print look: 2-3 spot inks, visible misregistration, grainy paper texture, bold simple shapes.",
  blueprint:     "Technical blueprint / schematic look: fine white line drawing on deep graphite, orange annotation marks, grid paper.",
  neon_synth:    "80s synthwave: neon orange rim light on graphite night, chrome highlights, grid horizon, subtle glow haze.",
  cutpaper_3d:   "Quilled paper 3D relief: rolled paper strips, pastel depth layers, museum-diorama lighting.",
  gouache:       "Mid-century gouache poster art: matte painterly texture, simplified geometric forms, limited retro palette.",
  claytoon:      "Glossy 3D toy render: chunky rounded vinyl figures, soft studio softbox, subtle subsurface glow.",
  woodcut:       "Hand-carved woodcut print: strong carved lines, ink texture, two-tone with orange accent.",
};

type Item = { asset: string; x: number; y: number; w: number; anim: string; delay: number; flip: boolean; z: number };
type Scene = { bg: string; text: string; textPos: string; camera: string; transition: string; sfx: string; items: Item[]; beats: number };
type Concept = {
  topicId: string; styleKey: string; setting: string; logline: string;
  backgrounds: { name: string; prompt: string }[];
  objects: { name: string; role: "truck" | "mover" | "cargo" | "prop"; prompt: string }[];
  scenes: Scene[];
  cta: string; caption: string; hashtags: string[];
};

const schema = {
  type: "object", additionalProperties: false,
  required: ["topicId", "styleKey", "setting", "logline", "backgrounds", "objects", "scenes", "cta", "caption", "hashtags"],
  properties: {
    topicId: { type: "string", description: "verilən mövzu siyahısından seçdiyin id" },
    styleKey: { type: "string", description: "verilən üslub siyahısından seçdiyin açar" },
    setting: { type: "string", description: "İNGİLİSCƏ 1 cümlə: hava/vaxt/işıq/əhval — bütün fonlarda eyni" },
    logline: { type: "string", description: "1 cümlə azərbaycanca: videonun hekayəsi (nə baş verir, sonda nə dəyişir)" },
    backgrounds: {
      type: "array", minItems: 2, maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["name", "prompt"], properties: {
        name: { type: "string", description: "bg_ ilə başlayan qısa ad, məs. bg_stage" },
        prompt: { type: "string", description: "İNGİLİSCƏ: 9:16 BOŞ səhnə plakası — insan, maşın, əsas obyektlər, yazı YOX; yalnız məkan" } } },
    },
    objects: {
      type: "array", minItems: 3, maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["name", "role", "prompt"], properties: {
        name: { type: "string", description: "qısa ingilis ad (a-z, _), məs. grand_piano" },
        role: { type: "string", enum: ["truck", "mover", "cargo", "prop"], description: "MƏCBURİ: siyahıda DƏQİQ 1 'truck' (Yük.az yük maşını) və ƏN AZI 1 'mover' (narıncı formalı işçi) olmalıdır; 'cargo' — daşınan əsas yük; 'prop' — köməkçi" },
        prompt: { type: "string", description: "İNGİLİSCƏ: TƏK obyekt/personaj, yan görünüş, kadr mərkəzində, şəffaf fon üçün — hekayəyə uyğun konkret detal, ifadəli" } } },
    },
    scenes: {
      type: "array", minItems: 4, maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        required: ["bg", "text", "textPos", "camera", "transition", "sfx", "items", "beats"],
        properties: {
          bg: { type: "string", description: "yuxarıdakı backgrounds adlarından biri" },
          text: { type: "string", description: "Ekran mətni, AZƏRBAYCANCA, maks 6 söz — video səssizdir, hekayəni bu daşıyır" },
          textPos: { type: "string", enum: ["top", "center", "bottom"] },
          camera: { type: "string", enum: [...CAMERAS] },
          transition: { type: "string", enum: [...TRANSITIONS], description: "bu səhnədən növbətiyə keçid" },
          sfx: { type: "string", enum: [...SFX] },
          beats: { type: "integer", description: "səhnənin uzunluğu: 3 (qısa) 4 (orta) 5 (uzun) — cəmi 16-20 olsun" },
          items: {
            type: "array", minItems: 1, maxItems: 4,
            items: { type: "object", additionalProperties: false, required: ["asset", "x", "y", "w", "anim", "delay", "flip", "z"], properties: {
              asset: { type: "string", description: "yuxarıdakı objects adlarından biri" },
              x: { type: "number", description: "0..1 — mərkəzin yeri (0.5 = orta)" },
              y: { type: "number", description: "0..1 — obyektin ALT xətti (0.8 ≈ yer)" },
              w: { type: "number", description: "0..1 — kadr eninə görə en. QƏHRƏMAN obyekt 0.45-0.85, dəstək 0.15-0.35, yaxın plan 0.8-0.9" },
              anim: { type: "string", enum: [...ANIMS] },
              delay: { type: "integer", description: "kadr gecikməsi (0-30)" },
              flip: { type: "boolean", description: "üfüqi güzgü" },
              z: { type: "integer", description: "sıra: böyük rəqəm öndə" } } },
          },
        },
      },
    },
    cta: { type: "string", description: "Son ekran üçün 1 sətir, maks 28 simvol — hekayənin nəticəsi. DM/açar söz/şərh istəmə (bizim yeganə CTA-mız zəngdir; nömrəni sistem yazır)" },
    caption: { type: "string", description: "Instagram caption: 1 hook sətri, 2-3 qısa emojili sətir, sonda sual. Nömrə yazma." },
    hashtags: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
  },
} as const;

const SYSTEM = `Sən Yük.az (Bakı; ev/ofis köçü, yükdaşıma) üçün motion-design rejissoru və art-direktorusan.
Səssiz illüstrasiya videosu qurursan: hekayəni YALNIZ görüntü + ekran mətni daşıyır.

QAYDA #1 — BU BİR YÜKDAŞIMA REKLAMIDIR (pozmaq olmaz):
- Video ilk saniyədən aydın göstərməlidir ki, söhbət YÜKÜN DAŞINMASINDAN gedir: narıncı formalı Yük.az işçiləri, qrafit kuzalı + narıncı kabinəli yük maşını, daşınan yük (mebel, qutu, texnika, xüsusi əşya).
- Obyekt siyahısında MƏCBURİ: 1 "truck" (yük maşını) + ən azı 1 "mover" (işçi) + mövzunun "cargo" əşyası.
- Səhnələrin ƏN AZI 3-də işçi və/və ya maşın kadrda olsun. BİRİNCİ səhnə: yük + işçi (götürmə anı). SONUNCU səhnə: maşın və ya işçi yükü yeni ünvana çatdırır.
- Yalnız əşya/prop göstərən "abstrakt" video OLMAZ (məs. təkcə pianonun cizgisi, təkcə pişik, təkcə raket). Metafora istifadə etsən belə, kadrda real daşınma işi görünməlidir.
- Ton/janr (aşağıda verilir) yalnız DANIŞIQ TƏRZİNİ dəyişir, səhnəni yox.

QAYDA #2 — TƏKRAR YOXDUR:
- Mövzu verilən siyahıdan seçilir; əvvəl işlənənlər siyahıda YOXDUR.
- "lift", "az qutu var", "divan liftə sığmır", "Bakı tıxacı", "dostları çağırım" kimi bizim artıq istifadə etdiyimiz zarafatları TƏKRARLAMA.
- Hər video başqa janr/ton olsun: bəzən gülməli, bəzən epik, bəzən nostalji, bəzən sakit-gözəl, bəzən sənədli.
- Kadr quruluşu da dəyişsin: səhnə sayı, kamera, keçid, obyekt yerləşməsi.

REJİSSURA (hekayə, siyahı yox):
- 4-6 səhnə, cəmi 16-20 "beat" (1 beat ≈ 1 saniyə). Quruluş: qarmaq → gərginlik/artım → dönüş → rahatlama.
- "1: … 2: … 3: …" kimi nömrələnmiş checklist YAZMA. Hər səhnə əvvəlkinin nəticəsi olsun.

KADR (ən vacib — kiçik obyektlər boş kadr deməkdir):
- Hər səhnədə QƏHRƏMAN obyekt var: w 0.45–0.85, y 0.72–0.90, adətən mərkəzə yaxın. Kadrı O doldurur.
- Dəstək obyektlər: w 0.2–0.4, qəhrəmanın yanında/arxasında (z ilə sırala). İŞÇİ (mover) w 0.35–0.5, MAŞIN (truck) w 0.55–0.8 — kiçik "oyuncaq" kimi görünməsin.
- Yaxın plan lazım olanda w 0.8–0.9 (obyekt kadrı doldurur), uzaq plan üçün 0.3.
- Obyektlər üst-üstə düşməsin, kadrdan çıxmasın: x ± w/2 → 0.03..0.97.
- Mətn obyektin üstünə düşməsin: obyekt aşağıdadırsa textPos "top", obyekt yuxarı/ortadadırsa "bottom".

RİTM:
- Hər səhnədə BAŞQA kamera və BAŞQA keçid (ardıcıl təkrar yoxdur).
- Fonlar növbələşsin: eyni fon ardıcıl 2 səhnədən çox olmasın; ən azı 2 fərqli məkan görünsün.
- Animasiyalar müxtəlif olsun (driveIn/rise/fall/spin/float/zoom/walkIn/swing) — hamısı "pop" olmasın.

MƏTN:
- Maks 6 söz, azərbaycanca, orfoqrafiya səhvsiz, hər səhnədə YENİ məlumat. Ekranda "Yük.az" yalnız lazım olsa.

ASSETLƏR:
- Fonlar BOŞ səhnə plakasıdır: insan, maşın, əsas obyekt, yazı YOX.
- Obyektlər ayrıca şəffaf PNG-dir: tək obyekt/personaj, yan görünüş, kadr mərkəzində.
- "truck" təsviri: box truck, dark graphite cargo box + bright orange cab, facing right, no text/logo.
- "mover" təsviri: friendly mover character in a bright orange t-shirt and dark graphite trousers, expressive, mid-action (carrying / lifting / strapping).
- Hamısı eyni üslubda və eyni məkan/işıq əhvalında olsun.

BREND: qiymət rəqəmi YOX; digər brend adları YOX; nömrə caption-a sistem əlavə edir.
MÖVZU MƏNBƏYİ: aşağıdakı BEYNƏLXALQ NÜMUNƏ blokundakı sütunlardan birini seç (top köç brendlərinin real kontenti) —
qablaşdırma texnikası, yükləmə tetrisi, kövrək/ağır əşya, qiymət-vaxt şəffaflığı, komanda/proses, müştəri anı, saxlama.
Janr oyunu (kosmos, heyvan POV, meme parodiyası) QADAĞANDIR; mövzu köçlə birbaşa bağlı olmalıdır.
CTA: yeganə hərəkət ZƏNGDİR — "DM yaz", "açar söz yaz", "şərh yaz" kimi çağırış YAZMA (o kanal bizdə avtomatlaşdırılmayıb).`;

export const motionRequest = (topics: { id: string; title: string; hint: string; audience: string }[], usedStyles: string[], tone: string, pbText: string, feedback: string | undefined, nv: Novelty): ChatOpts => ({
  task: "creative", name: "motion", model: MODEL, schema, seed: nv.seed,
  messages: [
    { role: "system", content: SYSTEM + pbText + skillPlaybook(["going-viral", "reel-builder", "on-screen-text-writer", "story-sequencer", "cta-writer"]) + planFor("Motion", postCount()).text + memory() + nv.text },
    { role: "user", content:
      `MÖVZU SEÇİMİ (birini seç, id-ni yaz — hamısı təzədir):\n${topics.map((t) => `- ${t.id}: ${t.title} (kim üçün: ${t.audience}) — ${t.hint}`).join("\n")}\n\n` +
      `ÜSLUB SEÇİMİ:\n${Object.entries(STYLES).filter(([k]) => !usedStyles.includes(k)).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n` +
      `BU VİDEONUN TONU (yalnız danışıq tərzi — səhnə hər halda real daşınma işidir): ${tone}\n\n` +
      `Bu video üçün tam rejissura yaz: mövzu, üslub, məkan, 2-3 fon, 3-6 obyekt, 4-6 səhnə (obyekt yerləri və hərəkətləri ilə), CTA, caption.${feedback ? `\n\nİSTİFADƏÇİ QEYDİ, MÜTLƏQ nəzərə al:\n${feedback}` : ""}` },
  ],
});

/** Assetləri bu postun qovluğunda yarat (yalnız konseptin siyahısı) */
const genAssets = (dir: string, c: Concept) =>
  new Promise<void>((res, rej) => {
    const objects = Object.fromEntries(c.objects.map((o) => [o.name, o.prompt]));
    const backgrounds = Object.fromEntries(c.backgrounds.map((b) => [b.name, b.prompt]));
    const py = spawn("python", ["pipeline/gen_assets.py", "--all"], {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8",
        ASSET_DIR: path.join(dir, "assets"), BOUNDS_PATH: path.join(dir, "bounds.json"), ASSET_ONLY: "1",
        ASSET_STYLE: STYLES[c.styleKey] ?? STYLES.claymation, ASSET_SETTING: c.setting,
        ASSET_OBJECTS: JSON.stringify(objects), ASSET_BACKGROUNDS: JSON.stringify(backgrounds),
      },
    });
    py.on("close", (code) => (code === 0 ? res() : rej(new Error(`gen_assets.py ${code}`))));
  });

const main = async () => {
  const feedback = process.env.FEEDBACK?.trim() || undefined;
  const reuse = process.env.MOTION_REUSE_ASSETS === "1";

  console.log("\n1. Mövzu və üslub (əvvəlkilər bloklanır)…");
  // prioritet: MOTION_TOPIC → kontent təqviminin bu günkü slotu → təzə mövzular
  const forced = (process.env.MOTION_TOPIC?.trim() || todaySlot("Motion")?.topic || "").trim();
  const topics = forced ? TOPICS.filter((t) => t.id === forced) : freshTopics(6);
  if (!topics.length) throw new Error(`mövzu tapılmadı: ${forced}`);
  const usedStyles: string[] = [];
  for (const f of await fs.readdir("content/data").catch(() => [] as string[])) {
    if (!f.endsWith(".meta.json")) continue;
    const m = JSON.parse(await fs.readFile(`content/data/${f}`, "utf-8").catch(() => "{}"));
    if (m?.style) usedStyles.push(m.style);
  }
  log(`namizəd mövzular: ${topics.map((t) => t.id).join(", ")}`);
  log(`bloklanan üslublar: ${usedStyles.slice(-8).join(", ") || "—"}`);

  console.log(`2. Rejissura (${MODEL})…`);
  const nv = novelty("Motion", { motion: true });
  const tone = TONES[Math.floor(Math.random() * TONES.length)];
  log(`ton: ${tone}`);
  const pb = await getPlaybook();
  const pbText = playbookBlock(pb);
  if (pb) log(`beynəlxalq nümunə: ${pb.pillars.length} sütun (${pb.brands.slice(0, 3).map((b) => b.name).join(", ")}…)`);
  const c = (await chat<Concept>(motionRequest(topics, usedStyles.slice(-8), tone, pbText, feedback, nv))).data;
  remember("Motion", c, nv);
  log(`${c.topicId} · ${c.styleKey} — ${c.logline}`);
  log(`səhnələr: ${c.scenes.map((s) => s.text).join(" → ")}`);

  // ---- XİDMƏT ZƏMANƏTİ: maşın və işçi həm asset siyahısında, həm də kadrda olmalıdır
  const style = STYLES[c.styleKey] ?? STYLES.claymation;
  const has = (r: string) => c.objects.some((o) => o.role === r);
  if (!has("truck")) {
    c.objects.push({ name: "yukaz_truck", role: "truck",
      prompt: "A box truck facing right: dark graphite cargo box, bright orange cab, chunky wheels with orange hubs, no text or logo." });
    log("⚠ maşın yox idi — əlavə olundu");
  }
  if (!has("mover")) {
    c.objects.push({ name: "yukaz_mover", role: "mover",
      prompt: "A friendly mover character walking to the right carrying a wrapped item, bright orange t-shirt, dark graphite trousers and cap, expressive face." });
    log("⚠ işçi yox idi — əlavə olundu");
  }
  const truck = c.objects.find((o) => o.role === "truck")!;
  const mover = c.objects.find((o) => o.role === "mover")!;
  void style;
  const bgNames = c.backgrounds.map((b) => b.name);
  const objNames = c.objects.map((o) => o.name);
  for (const s of c.scenes) {
    if (!bgNames.includes(s.bg)) s.bg = bgNames[0];
    s.items = s.items.filter((i) => objNames.includes(i.asset));
    if (!s.items.length) s.items = [{ asset: objNames[0], x: 0.5, y: 0.8, w: 0.45, anim: "pop", delay: 4, flip: false, z: 1 }];
  }
  // işçi/maşın kadrda: birinci səhnədə işçi, sonuncuda maşın və ya işçi, cəmi ən azı 3 səhnədə
  const inScene = (sc: typeof c.scenes[number], name: string) => sc.items.some((i) => i.asset === name);
  const addTo = (sc: typeof c.scenes[number], name: string, opts: { x: number; y: number; w: number; anim: string }) => {
    if (!inScene(sc, name)) sc.items.push({ asset: name, x: opts.x, y: opts.y, w: opts.w, anim: opts.anim, delay: 6, flip: false, z: 2 });
  };
  addTo(c.scenes[0], mover.name, { x: 0.72, y: 0.88, w: 0.44, anim: "walkIn" });
  const last = c.scenes[c.scenes.length - 1];
  if (!inScene(last, truck.name) && !inScene(last, mover.name)) addTo(last, truck.name, { x: 0.5, y: 0.86, w: 0.72, anim: "driveIn" });
  let withService = c.scenes.filter((sc) => inScene(sc, truck.name) || inScene(sc, mover.name)).length;
  for (const sc of c.scenes) {
    if (withService >= 3) break;
    if (inScene(sc, truck.name) || inScene(sc, mover.name)) continue;
    addTo(sc, truck.name, { x: 0.28, y: 0.86, w: 0.58, anim: "slideRight" });
    withService++;
  }
  log(`xidmət kadrda: ${withService}/${c.scenes.length} səhnə (maşın: ${truck.name}, işçi: ${mover.name})`);

  // CTA yalnız zəng ola bilər — DM/açar söz vədini sistem qəbul etmir
  if (/DM|açar söz|şərh yaz|komment/i.test(c.cta)) {
    log(`⚠ CTA DM istəyirdi ("${c.cta}") — zəngə çevrildi`);
    c.cta = "Ağır yükü bizə burax";
  }

  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-motion`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  let assetsBase = "assets"; let bounds: any = undefined;
  if (!reuse) {
    console.log(`3. Assetlər — ${c.backgrounds.length} fon + ${c.objects.length} obyekt (${c.styleKey})…`);
    await genAssets(dir, c);
    assetsBase = `render/${id}/assets`;
    bounds = JSON.parse(await fs.readFile(path.join(dir, "bounds.json"), "utf-8"));
  } else console.log("3. Assetlər — mövcud dəst (MOTION_REUSE_ASSETS=1)");

  // rejissura zəmanətləri: hər səhnədə iri qəhrəman obyekt + kamera/keçid növbəsi (model unutsa da)
  const CAM = ["push", "panRight", "pull", "shake", "panLeft"] as const;
  const TRS = ["slide", "wipe", "fade", "slide", "wipe"] as const;
  c.scenes.forEach((s, i) => {
    for (const it of s.items) {
      if (it.asset === mover.name && it.w < 0.34) it.w = 0.42;
      if (it.asset === truck.name && it.w < 0.5) it.w = 0.62;
    }
    const big = s.items.reduce((a, b) => (b.w > a.w ? b : a), s.items[0]);
    if (big && big.w < 0.45) { big.w = 0.55; big.y = Math.max(big.y, 0.78); }
    if (i > 0 && s.camera === c.scenes[i - 1].camera) s.camera = CAM[i % CAM.length];
    if (i > 0 && s.transition === c.scenes[i - 1].transition) s.transition = TRS[i % TRS.length];
  });

  const scenes = c.scenes.map((s) => ({
    bg: s.bg, text: s.text, textPos: s.textPos, camera: s.camera, transition: s.transition, sfx: s.sfx,
    items: s.items.map((i) => ({ ...i, x: Math.min(0.92, Math.max(0.08, i.x)), y: Math.min(0.95, Math.max(0.3, i.y)), w: Math.min(0.9, Math.max(0.12, i.w)) })),
    durationInFrames: Math.round(Math.min(6, Math.max(3, s.beats)) * FPS),
  }));
  const secs = (scenes.reduce((a, b) => a + b.durationInFrames, 0) + 110 - scenes.length * TRANSITION) / FPS;

  console.log("4. Musiqi — Instagram/TikTok trend ovqatı + telif təmiz…");
  const trend = await pickTrendMusic(secs, dir, id);
  const music = trend
    ? { track: trend.file, attribution: trend.attribution, musicTrack: trend.track as any }
    : await pickMusic(Math.floor(Date.now() / 86400_000), secs, dir, id, log);

  const props = { id, assets: assetsBase, bounds, scenes, cta: { line1: c.cta, line2: "Zəng et" }, music: music.track || null, musicVolume: 0.75 };
  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
  const caption = c.caption.includes(contact.phone) ? c.caption : `${c.caption.trim()}\n\n📞 Zəng et: ${contact.phone}`;
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "Motion", articleId: null, link: "https://yuk.az", caption, hashtags: c.hashtags,
      music: music.track || null, attribution: music.attribution, musicTrack: music.musicTrack,
      voice: null, silent: true, kind: "fun",
      topic: c.topicId, style: c.styleKey, logline: c.logline, setting: c.setting,
      trendMusic: trend ? { ref: trend.trendRef, license: trend.track.license, source: trend.track.source, note: trend.note } : null,
      pillarSource: pb ? pb.brands.map((b) => b.name).join(", ") : null,
      createdAt: new Date().toISOString(),
    }, null, 2),
    "utf-8"
  );

  console.log(`\n✓ Hazırdır: ${id}  (${secs.toFixed(1)} san, ${scenes.length} səhnə, üslub: ${c.styleKey}, mövzu: ${c.topicId})`);
  console.log(`  Render: npx remotion render src/index.ts Motion out/${id}.mp4 --props=${dir}/props.json\n`);
};

if (/[\\/]motion\.ts$/.test(process.argv[1] ?? "")) main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
