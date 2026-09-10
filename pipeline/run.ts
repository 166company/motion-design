/** Məqalə → hazır video. Bütün zəncir bir əmrdə. */
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pickArticle } from "./wp.ts";
import { writeScript } from "./script.ts";
import { findMedia } from "./assets.ts";

const FPS = 30;
const TAIL = 10;        // səhnə sonuna nəfəs payı (kadr)
const CTA_FRAMES = 78;  // 2.6 saniyə

const log = (m: string) => console.log(`  ${m}`);

/** edge-tts Python skriptini çağırır */
const runTts = (jobs: { id: string; text: string }[], outDir: string) =>
  new Promise<Record<string, { words: any[]; duration: number; file: string }>>((res, rej) => {
    const py = spawn("python", ["pipeline/tts.py", outDir], {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
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

  const id = `${new Date().toISOString().slice(0, 10)}-${article.id}`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  console.log("3. Səsləndirilir (edge-tts)…");
  const jobs = [
    { id: "s0", text: s.hookSpoken },
    ...s.items.map((it, i) => ({ id: `s${i + 1}`, text: it.spoken })),
  ];
  const tts = await runTts(jobs, dir);
  const voTotal = Object.values(tts).reduce((a, b) => a + b.duration, 0);
  log(`${jobs.length} səhnə, ${voTotal.toFixed(1)} san səs`);

  console.log("4. Stok video axtarılır (Pexels)…");
  const queries = [s.hookQuery, ...s.items.map((i) => i.query)];
  const needs = [tts.s0.duration, ...s.items.map((_, i) => tts[`s${i + 1}`].duration)];
  const medias = await Promise.all(
    queries.map(async (q, i) => {
      const m = await findMedia(q, needs[i]);
      if (!m) { log(`⚠ tapılmadı: ${q}`); return null; }
      const ext = m.kind === "video" ? "mp4" : "jpg";
      const file = `m${i}.${ext}`;
      await download(m.src, path.join(dir, file));
      return { kind: m.kind, src: `render/${id}/${file}`, duration: m.duration };
    })
  );
  log(`${medias.filter(Boolean).length}/${queries.length} asset yükləndi`);

  console.log("5. Səhnələr qurulur…");
  const frames = (sec: number) => Math.ceil(sec * FPS) + TAIL;
  const scenes = [
    {
      kind: "hook" as const,
      spoken: s.hookSpoken,
      audio: `render/${id}/s0.mp3`,
      words: tts.s0.words,
      durationInFrames: frames(tts.s0.duration),
      media: medias[0],
    },
    ...s.items.map((it, i) => ({
      kind: "item" as const,
      spoken: it.spoken,
      title: it.title,
      body: it.body,
      index: i + 1,
      audio: `render/${id}/s${i + 1}.mp3`,
      words: tts[`s${i + 1}`].words,
      durationInFrames: frames(tts[`s${i + 1}`].duration),
      media: medias[i + 1],
    })),
    {
      kind: "cta" as const,
      spoken: "",
      audio: null,
      words: [],
      durationInFrames: CTA_FRAMES,
      media: null,
    },
  ];

  // Musiqi public/music/ qovluğundan götürülür (staticFile yalnız public/ görür).
  // Trek məqalə ID-sinə görə seçilir — eyni video həmişə eyni musiqi ilə render olunur.
  const tracks = await fs
    .readdir("public/music")
    .then((f) => f.filter((x) => /\.(mp3|m4a|wav)$/i.test(x)).sort())
    .catch(() => [] as string[]);
  let track = tracks.length ? `music/${tracks[article.id % tracks.length]}` : null;

  // Real trek yoxdursa, videonun uzunluğuna uyğun orijinal fon musiqisi sintez et.
  // Telif riski yoxdur. public/music/ dolduqda bu blok özü sönür.
  if (!track) {
    const secs = scenes.reduce((a, b) => a + b.durationInFrames, 0) / FPS;
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
    log("fon musiqisi sintez olundu");
  }

  const reel = {
    id,
    hook: s.hook,
    total: s.items.length,
    cta: s.cta,
    music: track,
    musicVolume: 0.1,
    scenes,
  };

  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(reel, null, 2), "utf-8");
  await fs.writeFile("src/defaultProps.json", JSON.stringify(reel, null, 2), "utf-8");
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({ id, articleId: article.id, link: article.link, caption: s.caption, hashtags: s.hashtags }, null, 2),
    "utf-8"
  );
  await fs.writeFile(usedPath, JSON.stringify([...used, article.id]), "utf-8");

  const total = scenes.reduce((a, b) => a + b.durationInFrames, 0);
  console.log(`\n✓ Hazırdır: ${id}`);
  console.log(`  müddət: ${(total / FPS).toFixed(1)} saniyə (${total} kadr)`);
  console.log(`  musiqi: ${track}`);
  console.log(`\n  Render: npm run render -- --props=${dir}/props.json out/${id}.mp4\n`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
