/** Məqalə → hazır video. Bütün zəncir bir əmrdə. */
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pickArticle, getArticle } from "./wp.ts";
import { writeScript } from "./script.ts";
import { findMedia, normalizeVideo } from "./assets.ts";
import { pickAndDownload } from "./audius.ts";
import { voices, contact } from "../src/brand/contact.ts";

const FPS = 30;
const TAIL = 16;        // səhnə sonuna nəfəs payı (kadr) — keçid (12) bunun içində qalır
const CTA_FRAMES = 96;  // 3.2 saniyə — loqo animasiyası + pill üçün

const log = (m: string) => console.log(`  ${m}`);

/**
 * Səsləndirmə mühərriki: TTS_ENGINE=openai (təbii, ~1 sent/video) və ya edge (pulsuz, robotvari).
 * İkisi də eyni formatda cavab verir: söz vaxtları + müddət.
 */
const TTS_SCRIPT = process.env.TTS_ENGINE === "edge" ? "pipeline/tts.py" : "pipeline/tts_openai.py";
const runTts = (jobs: { id: string; text: string }[], outDir: string, voice: string) =>
  new Promise<Record<string, { words: any[]; duration: number; file: string }>>((res, rej) => {
    const py = spawn("python", [TTS_SCRIPT, outDir], {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", OPENAI_TTS_VOICE: voice },
    });
    let out = "", err = "";
    py.stdout.on("data", (d) => (out += d));
    py.stderr.on("data", (d) => (err += d));
    py.on("close", (code) =>
      code === 0 ? res(JSON.parse(out)) : rej(new Error(`tts.py ${code}: ${err.slice(-500)}`))
    );
    py.stdin.write(JSON.stringify(jobs));
    py.stdin.end();
  });

/** Səviyyə normallaşdırma — mix-dən əvvəl hər mənbə eyni hədəfə gətirilir */
const VO_DB = -18;     // səsləndirmə hədəfi (RMS dBFS)
const MUSIC_DB = -20;  // musiqi hədəfi; Remotion-da ducking bunun üstündən tətbiq olunur
const normalizeAudio = (src: string, dest: string, targetDb: number, stereo = false, windowSec?: number) =>
  new Promise<void>((res, rej) => {
    const args = ["pipeline/loudness.py", src, dest, String(targetDb), stereo ? "stereo" : "mono"];
    if (windowSec) args.push(windowSec.toFixed(1));
    const py = spawn("python", args, {
      env: { ...process.env, PYTHONUTF8: "1" },
    });
    let err = "";
    py.stderr.on("data", (d) => (err += d));
    py.on("close", (c) => (c === 0 ? res() : rej(new Error(`loudness.py ${c}: ${err.slice(-300)}`))));
  });

const download = async (url: string, dest: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`yükləmə xətası ${r.status}`);
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
};

const main = async () => {
  const usedPath = "content/data/used.json";
  const used: number[] = JSON.parse(await fs.readFile(usedPath, "utf-8").catch(() => "[]"));

  console.log("\n1. Məqalə seçilir…");
  const article = await pickArticle(used);
  log(article.title);

  console.log("2. Ssenari yazılır…");
  const s = await writeScript(article);
  log(`hook: ${s.hook} | ${s.items.length} bənd`);

  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-${article.id}`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  // Hər video fərqli səslə — məqalə ID-sinə görə növbə. OPENAI_TTS_VOICE verilibsə, o üstündür.
  const voice = process.env.OPENAI_TTS_VOICE || voices[article.id % voices.length];
  console.log(`3. Səsləndirilir (${process.env.TTS_ENGINE === "edge" ? "edge-tts" : "OpenAI " + voice})…`);
  const jobs = [
    { id: "s0", text: s.hookSpoken },
    ...s.items.map((it, i) => ({ id: `s${i + 1}`, text: it.spoken })),
  ];
  const tts = await runTts(jobs, dir, voice);
  const voTotal = Object.values(tts).reduce((a, b) => a + b.duration, 0);
  log(`${jobs.length} səhnə, ${voTotal.toFixed(1)} san səs`);
  // edge-tts çıxışı sakitdir (~-25 dBFS) — sosial media üçün -18-ə qaldır
  for (const j of jobs) {
    await normalizeAudio(path.join(dir, `${j.id}.mp3`), path.join(dir, `${j.id}.wav`), VO_DB);
    await fs.unlink(path.join(dir, `${j.id}.mp3`)).catch(() => {});
  }

  console.log("4. Stok video axtarılır (Pexels)…");
  const queries = [s.hookQuery, ...s.items.map((i) => i.query)];
  const needs = [tts.s0.duration, ...s.items.map((_, i) => tts[`s${i + 1}`].duration)];
  const medias = await Promise.all(
    queries.map(async (q, i) => {
      const m = await findMedia(q, needs[i]);
      if (!m) { log(`⚠ tapılmadı: ${q}`); return null; }
      const ext = m.kind === "video" ? "mp4" : "jpg";
      const file = `m${i}.${ext}`;
      const target = path.join(dir, file);
      if (m.kind === "video") {
        // xam faylı yüklə → normallaşdır → xamı sil
        const raw = path.join(dir, `raw${i}.mp4`);
        await download(m.src, raw);
        await normalizeVideo(raw, target, needs[i] + TAIL / FPS);
      } else {
        await download(m.src, target);
      }
      return { kind: m.kind, src: `render/${id}/${file}`, duration: m.duration };
    })
  );
  log(`${medias.filter(Boolean).length}/${queries.length} asset yükləndi`);

  console.log("5. İkonlar (Iconify)…");
  const icons = await Promise.all(
    s.items.map(async (it, i) => {
      const name = (it.icon || "package").toLowerCase().replace(/[^a-z0-9-]/g, "");
      for (const candidate of [name, "package"]) {
        const r = await fetch(`https://api.iconify.design/lucide/${candidate}.svg?color=%23FFFFFF&width=64&height=64`).catch(() => null);
        if (r?.ok) {
          const svg = await r.text();
          if (svg.includes("<svg")) {
            await fs.writeFile(path.join(dir, `icon${i}.svg`), svg, "utf-8");
            return `render/${id}/icon${i}.svg`;
          }
        }
      }
      return null;
    })
  );
  log(`${icons.filter(Boolean).length}/${icons.length} ikon`);

  console.log("6. Səhnələr qurulur…");
  const frames = (sec: number) => Math.ceil(sec * FPS) + TAIL;
  const scenes = [
    {
      kind: "hook" as const,
      spoken: s.hookSpoken,
      audio: `render/${id}/s0.wav`,
      words: tts.s0.words,
      durationInFrames: frames(tts.s0.duration),
      media: medias[0],
      icon: null,
    },
    ...s.items.map((it, i) => ({
      kind: "item" as const,
      spoken: it.spoken,
      title: it.title,
      body: it.body,
      index: i + 1,
      icon: icons[i],
      audio: `render/${id}/s${i + 1}.wav`,
      words: tts[`s${i + 1}`].words,
      durationInFrames: frames(tts[`s${i + 1}`].duration),
      media: medias[i + 1],
    })),
    {
      kind: "cta" as const,
      spoken: "",
      icon: null,
      audio: null,
      words: [],
      durationInFrames: CTA_FRAMES,
      media: null,
    },
  ];

  // Musiqi prioriteti:
  //   1) public/music/ — sənin əl ilə seçdiyin treklər (varsa)
  //   2) Audius — Creative Commons, atributla (caption-a əlavə olunur)
  //   3) music.py — orijinal sintez (heç biri olmasa)
  const secs = scenes.reduce((a, b) => a + b.durationInFrames, 0) / FPS;
  let track: string | null = null;
  let attribution: string | null = null;
  let musicTrack: { id: string; title: string; artist: string; license: string } | null = null;

  const local = await fs
    .readdir("public/music")
    .then((f) => f.filter((x) => /\.(mp3|m4a|wav)$/i.test(x)).sort())
    .catch(() => [] as string[]);

  if (local.length) {
    track = `music/${local[article.id % local.length]}`;
    log(`musiqi: lokal — ${track}`);
  } else {
    const dest = path.join(dir, "music.mp3");
    const picked = await pickAndDownload(article.id, secs, dest).catch((e) => {
      log(`⚠ Audius: ${e.message}`);
      return null;
    });
    if (picked) {
      track = `render/${id}/music.mp3`;
      attribution = picked.attribution;
      musicTrack = { id: picked.track.id, title: picked.track.title, artist: picked.track.artist, license: picked.track.license };
      log(`musiqi: Audius — ${picked.track.title} (${picked.track.artist}, ${picked.track.license})`);
    }
  }

  if (!track) {
    const wav = path.join(dir, "music.wav");
    await new Promise<void>((res, rej) => {
      const py = spawn("python", ["pipeline/music.py", wav, String(article.id), secs.toFixed(1)], {
        env: { ...process.env, PYTHONUTF8: "1" },
      });
      let err = "";
      py.stderr.on("data", (d) => (err += d));
      py.on("close", (c) => (c === 0 ? res() : rej(new Error(`music.py ${c}: ${err.slice(-300)}`))));
    });
    track = `render/${id}/music.wav`;
    log("musiqi: sintez (orijinal)");
  }

  // Musiqi mənbəyindən asılı olmayaraq eyni səviyyəyə gətir
  {
    const srcAbs = track.startsWith("music/") ? path.join("public", track) : path.join("public", track);
    const normPath = path.join(dir, "music.norm.wav");
    // trekin ən dolğun hissəsini videonun uzunluğunda kəs (sakit giriş problemi)
    await normalizeAudio(srcAbs, normPath, MUSIC_DB, true, secs + 2);
    track = `render/${id}/music.norm.wav`;
  }

  const reel = {
    id,
    hook: s.hook,
    total: s.items.length,
    cta: { line1: s.cta.line1, line2: "Zəng et" },
    music: track,
    musicVolume: 0.45,  // səsləndirmə altında; CTA-da TipList özü qaldırır
    scenes,
  };

  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(reel, null, 2), "utf-8");
  await fs.writeFile("src/defaultProps.json", JSON.stringify(reel, null, 2), "utf-8");
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "TipList", articleId: article.id, link: article.link,
      // CC BY lisenziyası atribut tələb edir — caption-ın sonuna əlavə olunur
      caption: attribution ? `${s.caption}

${attribution}` : s.caption,
      hashtags: s.hashtags,
      music: track, attribution, musicTrack, voice,
    }, null, 2),
    "utf-8"
  );
  if (!used.includes(article.id)) await fs.writeFile(usedPath, JSON.stringify([...used, article.id]), "utf-8");

  const total = scenes.reduce((a, b) => a + b.durationInFrames, 0);
  console.log(`\n✓ Hazırdır: ${id}`);
  console.log(`  müddət: ${(total / FPS).toFixed(1)} saniyə (${total} kadr)`);

  console.log(`\n  Render: npm run render -- --props=${dir}/props.json out/${id}.mp4\n`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
