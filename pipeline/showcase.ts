/**
 * "Showcase" — OpenAI-siz, tamamilə PULSUZ API-lərlə qurulan premium motion-design videosu.
 *
 *   Data   : Open-Meteo (Bakı 7 günlük hava), Nager.Date (yaxın bayram), yuk.az WP faktları   — hamısı açarsız
 *   Ssenari: pulsuz LLM provayderləri (Gemini/Groq/Cerebras/OpenRouter/Mistral…) — LLM_ENGINE=free məcburi
 *   Kadrlar: Pexels (pulsuz açar) — hər video üçün FƏRQLİ axtarış sorğuları, premium stok
 *   Musiqi : music_web.ts — webdən trend janr siqnalı + CC0/BY lisenziyalı, instrumental (Instagram təhlükəsiz)
 *
 *   npx tsx pipeline/showcase.ts
 *   SHOWCASE_ANGLE="hava"|"bayram"|"marşrut"   → data bucağını özün seç
 */
import "dotenv/config";
import "./plan.ts";
process.env.LLM_ENGINE = "free";                 // bu şablon OpenAI işlətmir (istifadəçi tələbi)
// azərbaycan dilini ən yaxşı yazan pulsuz modellər öndə (gemini pro → groq → cerebras)
process.env.LLM_PROVIDERS = process.env.LLM_PROVIDERS ?? "gemini,groq,cerebras,openrouter,mistral,sambanova";
import fs from "node:fs/promises";
import path from "node:path";
import { chat } from "./llm.ts";
import { novelty, remember } from "./ideas.ts";
import { playbook } from "./skills.ts";
import { listArticles } from "./wp.ts";
import { findMedia, normalizeVideo } from "./assets.ts";
import { pickWebMusic } from "./music_web.ts";
import { contact } from "../src/brand/contact.ts";
import { MOVES, REVEALS, TRANSITION } from "../src/compositions/Showcase.tsx";

const FPS = 30;
const log = (m: string) => console.log(`  ${m}`);
const UA = { "User-Agent": "yukaz-motion-agent/1.0" };

/* ---------------------------------------------------------------- 1) REAL DATA (açarsız API-lər) */
export type Facts = { angle: string; source: string; lines: string[]; badges: string[] };

const weather = async (): Promise<Facts> => {
  const u = "https://api.open-meteo.com/v1/forecast?latitude=40.4093&longitude=49.8671&daily=precipitation_sum,temperature_2m_max,wind_speed_10m_max&timezone=Asia%2FBaku&forecast_days=7";
  const j = (await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) })).json()) as any;
  const d = j.daily;
  const rainy = d.precipitation_sum.filter((v: number) => v >= 1).length;
  const dry = d.time.filter((_: string, i: number) => d.precipitation_sum[i] < 1);
  const windy = Math.max(...d.wind_speed_10m_max).toFixed(0);
  const maxT = Math.max(...d.temperature_2m_max).toFixed(0);
  const day = (iso: string) => ["Bazar", "B.e", "Ç.a", "Çərşənbə", "C.a", "Cümə", "Şənbə"][new Date(iso).getDay()];
  return {
    angle: "hava",
    source: "Mənbə: Open-Meteo · Bakı, 7 gün",
    lines: [
      `Bu həftə Bakıda ${rainy} gün yağış gözlənilir`,
      `Quru günlər: ${dry.slice(0, 3).map(day).join(", ")}`,
      `Ən güclü külək: ${windy} km/saat`,
      `Ən isti gün: ${maxT}°C`,
    ],
    badges: [`${rainy} yağışlı gün`, `${dry.length} quru gün`, `${windy} km/s külək`, `${maxT}°C`],
  };
};

const holiday = async (): Promise<Facts> => {
  const y = new Date().getFullYear();
  const list = [
    ...(await (await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/AZ`, { headers: UA, signal: AbortSignal.timeout(20000) })).json().catch(() => [])) as any[],
    ...(await (await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y + 1}/AZ`, { headers: UA, signal: AbortSignal.timeout(20000) })).json().catch(() => [])) as any[],
  ];
  const today = new Date().toISOString().slice(0, 10);
  const next = list.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const days = next ? Math.round((new Date(next.date).getTime() - Date.now()) / 86400e3) : 0;
  return {
    angle: "bayram",
    source: "Mənbə: Nager.Date · rəsmi bayram təqvimi",
    lines: [
      `${next?.localName ?? "Bayram"}a ${days} gün qalıb`,
      "Bayram ərəfəsi köç sifarişləri sıxlaşır",
      "Tarixi əvvəlcədən tutan rahat köçür",
      "Son günə saxlama — maşın tapılmaya bilər",
    ],
    badges: [`${days} gün qalıb`, next?.localName ?? "Bayram", "sıx həftə", "erkən sifariş"],
  };
};

/* ---------------------------------------------------------------- 2) SSENARİ (pulsuz LLM) */
type SceneSpec = { media: string; query: string; move: string; reveal: string; text: string; sub: string; badge: string; align: string; transition: string; beats: number };
type Concept = { title: string; scenes: SceneSpec[]; cta: string; caption: string; hashtags: string[] };

const schema = {
  type: "object", additionalProperties: false, required: ["title", "scenes", "cta", "caption", "hashtags"],
  properties: {
    title: { type: "string", description: "videonun 3-5 sözlük adı (daxili istifadə)" },
    scenes: {
      type: "array", minItems: 4, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        required: ["query", "move", "reveal", "text", "sub", "badge", "align", "transition", "beats"],
        properties: {
          query: { type: "string", description: "İNGİLİSCƏ Pexels stok video sorğusu — YALNIZ köç/daşınma/anbar/logistika dünyası: movers, moving boxes, van loading, furniture delivery, warehouse, courier, family new apartment, city skyline. Fəlakət/sel/etiraz/kasıblıq sorğusu YAZMA. Hər səhnədə FƏRQLİ." },
          move: { type: "string", enum: [...MOVES] },
          reveal: { type: "string", enum: [...REVEALS] },
          text: { type: "string", description: "Ekran başlığı, AZƏRBAYCANCA, maks 6 söz — sonuncu söz narıncı vurğulanır" },
          sub: { type: "string", description: "1 qısa alt sətir (maks 45 simvol) və ya boş" },
          badge: { type: "string", description: "REAL data rozetkası — yalnız verilən faktlardan, yoxsa boş" },
          align: { type: "string", enum: ["top", "center", "bottom"] },
          transition: { type: "string", enum: ["slide", "fade", "wipe"] },
          beats: { type: "integer", description: "səhnə uzunluğu saniyə: 3-5; cəmi 16-19" },
        },
      },
    },
    cta: { type: "string", description: "son ekran sətri, maks 28 simvol" },
    caption: { type: "string", description: "Instagram caption: hook sətri + 2-3 qısa emojili sətir + sual. Nömrə yazma." },
    hashtags: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
  },
} as const;

const SYSTEM = `Sən Yük.az (Bakı; ev/ofis köçü, yükdaşıma) üçün motion-design rejissorusan.
Video REAL DATA ilə qurulur: sənə verilən rəqəmlər canlı API-dən gəlir (hava, bayram təqvimi) — onları UYDURMA, dəyişmə, yalnız istifadə et.
Quruluş: 1) data ilə diqqət çək 2) bunun köçə təsiri 3) Yük.az həlli 4) rahatlama/nəticə.
QAYDALAR: ekran mətni maks 6 söz, azərbaycanca, orfoqrafiya səhvsiz; hər səhnədə FƏRQLİ Pexels sorğusu (insan, hərəkət, kinematik);
kamera və keçid növbələşsin; qiymət rəqəmi YOX; "ucuz/sərfəli/endirim" kimi qiymət iddiası YOX; "DM yaz / açar söz" CTA YOX (yeganə hərəkət zəngdir); digər brend adı YOX.
KADR SORĞULARI: yalnız peşəkar köç/logistika dünyası (movers, moving boxes, van loading, furniture delivery, warehouse, courier, family in new apartment, city skyline).
Fəlakət, sel, etiraz, müharibə, kasıblıq kadrları QADAĞANDIR — brend təhlükəsizliyi.`;

const writeConcept = async (facts: Facts, articles: string, nv: ReturnType<typeof novelty>) => {
  const r = await chat<Concept>({
    task: "creative", name: "showcase", schema, seed: nv.seed,
    messages: [
      { role: "system", content: SYSTEM + playbook(["going-viral", "on-screen-text-writer", "cta-writer"], 6000) + nv.text },
      { role: "user", content:
        `REAL DATA (${facts.angle}) — ${facts.source}:\n${facts.lines.map((l) => `- ${l}`).join("\n")}\n` +
        `Hazır rozetkalar: ${facts.badges.join(" · ")}\n\nYUK.AZ FAKTLARI:\n${articles}\n\n` +
        `Bu data ilə 4-5 səhnəlik motion-design videosu yaz.` },
    ],
  });
  return r;
};

/* ---------------------------------------------------------------- 3) ƏSAS */
const main = async () => {
  const angle = (process.env.SHOWCASE_ANGLE ?? (Math.random() < 0.5 ? "hava" : "bayram")).toLowerCase();
  console.log(`\n1. Real data (${angle}) — açarsız API…`);
  const facts = angle === "bayram" ? await holiday() : await weather();
  for (const l of facts.lines) log(l);

  console.log("2. Faktlar (yuk.az)…");
  const az = (await listArticles()).filter((a) => a.lang === "az");
  const articles = az.slice(0, 2).map((a) => `• ${a.title}: ${a.text.slice(0, 500)}`).join("\n");

  console.log("3. Ssenari — YALNIZ pulsuz LLM (OpenAI yoxdur)…");
  const nv = novelty("Showcase", { motion: true });
  // türkcə/yad yazılış sızsa bir dəfə yenidən yaz (pulsuz modellər bəzən qarışdırır)
  const TR = /(kutu|kutular|değil|iyi|şehir|araba|taşınma|ev taşıma|güzel)/i;
  let res = await writeConcept(facts, articles, nv);
  if (res.data.scenes.some((s) => TR.test(s.text) || TR.test(s.sub ?? ""))) {
    log("⚠ türkcə yazılış aşkarlandı — yenidən yazılır");
    res = await writeConcept(facts, articles, nv);
  }
  const c = res.data;
  log(`model: ${res.provider}/${res.model}`);
  log(`${c.title} → ${c.scenes.map((s) => s.text).join(" · ")}`);
  remember("Showcase", c, nv);

  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-showcase`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  // brend təhlükəsizliyi: sorğu və mətn süzgəci
  const BAD_Q = /(flood|storm|disaster|protest|war|refugee|poverty|slum|accident|crash|garbage|homeless)/i;
  const SAFE_Q = ["professional movers carrying boxes", "moving van loading furniture", "warehouse logistics team", "family unpacking new apartment", "courier delivering parcel city"];
  const BAD_TXT = /(ucuz|sərfəli|endirim|pulsuz|qiymət)/i;
  c.scenes.forEach((s, i) => {
    if (BAD_Q.test(s.query)) { log(`⚠ təhlükəli sorğu dəyişdirildi: "${s.query}"`); s.query = SAFE_Q[i % SAFE_Q.length]; }
    if (BAD_TXT.test(s.text)) { log(`⚠ qiymət iddiası çıxarıldı: "${s.text}"`); s.text = s.text.replace(BAD_TXT, "rahat"); }
    if (BAD_TXT.test(s.sub ?? "")) s.sub = "";
  });

  console.log("4. Premium kadrlar (Pexels) — hər səhnəyə fərqli…");
  const scenes: any[] = [];
  for (let i = 0; i < c.scenes.length; i++) {
    const s = c.scenes[i];
    const beats = Math.min(5, Math.max(3, s.beats));
    const need = beats;
    const m = await findMedia(s.query, need);
    let media = "", kind: "video" | "photo" = "video";
    if (m) {
      const ext = m.kind === "video" ? "mp4" : "jpg";
      const file = `m${i}.${ext}`;
      const target = path.join(dir, file);
      const r = await fetch(m.src, { signal: AbortSignal.timeout(180000) });
      const buf = Buffer.from(await r.arrayBuffer());
      if (m.kind === "video") {
        const raw = path.join(dir, `raw${i}.mp4`);
        await fs.writeFile(raw, buf);
        await normalizeVideo(raw, target, need + 1);
        await fs.unlink(raw).catch(() => {});
      } else await fs.writeFile(target, buf);
      media = `render/${id}/${file}`;
      kind = m.kind === "video" ? "video" : "photo";
      log(`${i + 1}. ${s.query} → ${m.kind}`);
    } else {
      log(`⚠ ${i + 1}. tapılmadı: ${s.query}`);
      continue;
    }
    scenes.push({
      media, kind, move: s.move, text: s.text, sub: s.sub ?? "", badge: s.badge ?? "",
      reveal: s.reveal, align: s.align, transition: s.transition, durationInFrames: Math.round(beats * FPS),
    });
  }
  if (scenes.length < 3) throw new Error("kifayət qədər kadr tapılmadı");

  const secs = (scenes.reduce((a, b) => a + b.durationInFrames, 0) + 110 - scenes.length * TRANSITION) / FPS;
  console.log("5. Musiqi — webdən trend janr + CC0/BY, instrumental…");
  const music = await pickWebMusic(angle === "bayram" ? "uplifting cinematic" : "upbeat corporate", secs, dir, id);

  const props = {
    id, scenes, cta: { line1: c.cta.slice(0, 28), line2: "Zəng et" },
    music: music?.file ?? null, musicVolume: 0.7, source: facts.source,
  };
  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
  const caption = c.caption.includes(contact.phone) ? c.caption : `${c.caption.trim()}\n\n📞 Zəng et: ${contact.phone}`;
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "Showcase", articleId: null, link: "https://yuk.az", caption, hashtags: c.hashtags,
      music: music?.file ?? null, attribution: music?.attribution ?? null,
      musicTrack: music ? { id: music.track.id, title: music.track.title, artist: music.track.artist, license: music.track.license, source: music.track.source, url: music.track.url } : null,
      musicSafe: music ? { license: music.track.license, instrumental: music.instrumental, note: "CC0/BY + instrumental → Instagram-da bloklanmır" } : null,
      voice: null, silent: true, kind: "data", topic: `data-${angle}`, dataSource: facts.source, model: `${res.provider}/${res.model}`,
      createdAt: new Date().toISOString(),
    }, null, 2),
    "utf-8"
  );
  console.log(`\n✓ Hazırdır: ${id} (${secs.toFixed(1)} san, ${scenes.length} səhnə, ssenari: ${res.provider}/${res.model})`);
  console.log(`  Render: npx remotion render src/index.ts Showcase out/${id}.mp4 --props=${dir}/props.json\n`);
};

if (/[\\/]showcase\.ts$/.test(process.argv[1] ?? "")) main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
