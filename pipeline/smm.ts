/**
 * SMM agentin tapşırığı → reel.
 *
 * SMM agent (yukaz-smm-agent) şəkli və yazını özü hazırlayır; bura yalnız hərəkət üçün gəlir.
 * Bu skript heç bir şəkil yaratmır və heç bir azərbaycanca mətn yazmır:
 *   tapşırığı götür → fotoları yüklə → musiqi → SmmReel render → yoxla → SMM agentə təhvil ver.
 * Hər hansı addım alınmasa SMM agentə "alınmadı" deyilir — o, tapşırığı yenidən təklif edir.
 *
 *   npx tsx pipeline/smm.ts                    # SMM_URL + SMM_TOKEN ilə tapşırığı özü götürür
 *   npx tsx pipeline/smm.ts out/brief.json     # workflow-un götürdüyü tapşırıq
 *   SMM_DELIVER=0 npx tsx pipeline/smm.ts x.json   # yalnız render (lokal sınaq)
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { SMM_TRANSITION, smmReelTotal, SMM_CAMERAS, SMM_SFX, type SmmReelProps } from "../src/compositions/SmmReel.tsx";
import { boxDropTotal } from "../src/compositions/BoxDrop.tsx";
import { storyReelTotal } from "../src/compositions/StoryReel.tsx";
import { imageToVideo, QuotaError } from "./hfVideo.ts";
import { pickWebMusic } from "./music_web.ts";
import { pickMusic } from "./audio.ts";

const FPS = 30;
const CLIP_CACHE = ".clipcache";
const SMM_URL = (process.env.SMM_URL ?? "").replace(/\/+$/, "");
const SMM_TOKEN = process.env.SMM_TOKEN ?? "";
const DELIVER = process.env.SMM_DELIVER !== "0";
const log = (m: string) => console.log(`  ${m}`);

type Spec = {
  version: number; briefId: number; topic: string; caption: string; layout: string;
  header?: string; plates: { url: string; scene?: string }[]; finalUrl: string; lettered: boolean;
  scenes: { plate: number; text?: string; label?: string; punch?: boolean; seconds: number; camera: string; focus: { x: number; y: number }; textAt: number; sfx: string }[];
  cta: { line1: string; line2: string }; mood: "upbeat" | "calm"; notes?: string;
  composition?: "SmmReel" | "BoxDrop" | "StoryReel"; assets?: Record<string, string>; texts?: Record<string, string>; lessons?: string[];
  shots?: { from: "plate" | "previous"; plate?: number; prompt: string; seconds: number; text?: string; punch?: boolean; video?: { url: string; start: number; page?: string } }[];
};
type Brief = { id: number; attempt: number; spec: Spec };

const auth = { Authorization: `Bearer ${SMM_TOKEN}` };

/** Render pulsuz planda yatır — ilk sorğu 30-60 san oyadır; ona görə bir neçə cəhd. */
const smmFetch = async (url: string, init: RequestInit = {}, tries = 4): Promise<Response> => {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
      if (res.status < 500) return res;
      last = new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 15_000 * (i + 1)));
  }
  throw last instanceof Error ? last : new Error(String(last));
};

const reportFail = async (briefId: number, reason: string) => {
  if (!DELIVER || !SMM_URL) return;
  await smmFetch(`${SMM_URL}/api/motion/brief/${briefId}/fail`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.slice(0, 480) }),
  }, 2).catch((e) => log(`⚠ xəta bildirilə bilmədi: ${(e as Error).message}`));
};

const loadBrief = async (): Promise<Brief | null> => {
  const file = process.argv[2];
  const body = file
    ? JSON.parse(await fs.readFile(file, "utf-8"))
    : await (await smmFetch(`${SMM_URL}/api/motion/brief`, { headers: auth })).json();
  if (body?.ok === false) throw new Error(`SMM agent: ${body.error ?? "rədd etdi"}`);
  return body?.brief ?? null;
};

const download = async (url: string, dest: string, format: "jpeg" | "png" = "jpeg") => {
  const res = await smmFetch(url, {}, 3);
  if (!res.ok) throw new Error(`şəkil yüklənmədi (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error(`şəkil oxunmadı: ${url}`);
  // Fotolar JPEG; şəffaf obyekt (qutu) PNG qalır
  // Kətan 1080×1920-dir; daha böyük foto yalnız yaddaş yeyir (zoom blur 5 nüsxə render edir)
  const fit = sharp(buf).resize({ width: 1440, height: 2560, fit: "inside", withoutEnlargement: true });
  if (format === "png") await fit.png().toFile(dest);
  else await fit.jpeg({ quality: 92 }).toFile(dest);
  return meta.width / meta.height;
};

const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} → kod ${code}`))));
  });

/** Klipin son kadrı → növbəti klipin başlanğıcı (zəncir). Remotion-un öz ffmpeg-i. */
const lastFrame = (clip: string, dest: string) => run("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-sseof", "-0.1", "-i", clip, "-frames:v", "1", "-q:v", "2", dest]);

/** Klipin eni/hündürlüyü/müddəti. */
const probe = async (clip: string): Promise<{ w: number; h: number; sec: number }> => {
  const out = await new Promise<string>((resolve, reject) => {
    const p = spawn("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "json", clip], { shell: process.platform === "win32" });
    let buf = "";
    p.stdout.on("data", (d) => (buf += d));
    p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error("ffprobe"))));
  });
  const j = JSON.parse(out);
  const st = (j.streams ?? []).find((x: { width?: number }) => x.width) ?? { width: 672, height: 832 };
  return { w: st.width, h: st.height, sec: Number(j.format?.duration ?? 3.5) };
};

/**
 * 16 kadr/san → 30 kadr/san hərəkət interpolyasiyası (minterpolate) — sistemdə tam ffmpeg varsa
 * (GitHub runner-də quraşdırılır). Yoxdursa klip olduğu kimi qalır.
 */
/**
 * Real stock klip (Pexels): yüklə → lazım olan hissəni kəs → ≤1080 enə, 30 kadr/san, səssiz.
 * SMM agent 2 Okt-dan reel-ləri əsasən real videodan qurur — Wan şəkli "əridirdi" (loqo, tüstü).
 */
const stockClip = async (url: string, start: number, seconds: number, dest: string): Promise<void> => {
  const raw = dest.replace(/\.mp4$/, "-src.mp4");
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`stok klip yüklənmədi: ${res.status}`);
  await fs.writeFile(raw, Buffer.from(await res.arrayBuffer()));
  await run("npx", [
    "remotion", "ffmpeg", "-y", "-loglevel", "error", "-ss", String(start), "-t", String(seconds), "-i", raw,
    "-vf", "scale='min(1080,iw)':-2,fps=30", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an", dest,
  ]);
  await fs.rm(raw, { force: true });
};

const smoothClip = async (clip: string, dest: string): Promise<string> => {
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", clip, "-vf", "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-an", dest]);
    return dest;
  } catch {
    log("⚠ ffmpeg (minterpolate) yoxdur — klip 16 kadr/san qalır");
    return clip;
  }
};

const clampN = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** SMM spec → SmmReel props. Saniyələr kadra çevrilir; keçid örtüşməsi əlavə olunur ki, oxuma vaxtı qısalmasın. */
export const toProps = (id: string, spec: Spec, plates: { src: string; aspect: number }[], final: { src: string; aspect: number } | null): SmmReelProps => {
  const scenes = spec.scenes.map((s) => ({
    plate: Math.min(plates.length - 1, Math.max(0, Math.round(Number(s.plate) || 0))),
    text: (s.text ?? "").trim(),
    label: (s.label ?? "").trim(),
    punch: Boolean(s.punch),
    frames: Math.round(clampN(s.seconds, 1.5, 8, 3) * FPS) + SMM_TRANSITION,
    camera: ((SMM_CAMERAS as readonly string[]).includes(s.camera) ? s.camera : "pushIn") as SmmReelProps["scenes"][number]["camera"],
    focus: { x: clampN(s.focus?.x, 0.05, 0.95, 0.5), y: clampN(s.focus?.y, 0.05, 0.95, 0.5) },
    textAt: Math.round(clampN(s.textAt, 0, 2, 0.3) * FPS),
    sfx: ((SMM_SFX as readonly string[]).includes(s.sfx) ? s.sfx : "none") as SmmReelProps["scenes"][number]["sfx"],
  }));
  return {
    id, plates, final: spec.lettered ? null : final, header: (spec.header ?? "").trim(), lettered: Boolean(spec.lettered),
    scenes, cta: { line1: spec.cta?.line1 || "Köçü bizə tapşır", line2: spec.cta?.line2 || "Zəng et" },
    music: null, musicVolume: 0.6,
  };
};

const main = async () => {
  if (DELIVER && (!SMM_URL || !SMM_TOKEN)) throw new Error("SMM_URL və SMM_TOKEN lazımdır (və ya SMM_DELIVER=0)");
  const brief = await loadBrief();
  if (!brief) { console.log("Açıq tapşırıq yoxdur."); return; }
  const { spec } = brief;
  const id = `smm-${brief.id}-${brief.attempt ?? 1}`;
  // Boş/yarımçıq tapşırıq (spec "{}") — çökmək əvəzinə SMM agentə bildir ki, bağlasın.
  if (!spec?.topic || !Array.isArray(spec.scenes)) {
    console.log(`⚠ Tapşırıq #${brief.id} boşdur (spec yoxdur) — geri qaytarılır.`);
    await reportFail(brief.id, "tapşırıq boşdur: spec yoxdur");
    return;
  }
  console.log(`\n🎬 Tapşırıq #${brief.id} (cəhd ${brief.attempt}): ${spec.topic} — ${spec.layout}, ${spec.scenes.length} səhnə`);
  if (spec.notes) log(`əvvəlki cəhdin qeydi: ${spec.notes}`);

  try {
    const dir = path.join("public", "render", id);
    await fs.mkdir(dir, { recursive: true });
    // Hazır şablon (məs. BoxDrop) — fotolar/qutu SMM agentdən, burada yalnız hərəkət
    let compId = "SmmReel";
    let props: { music: string | null; [k: string]: unknown };
    let secs: number;
    if (spec.composition === "BoxDrop") {
      const a = spec.assets ?? {};
      if (!a.clouds || !a.aerial || !a.room || !a.boxTop || !a.boxFront) throw new Error("BoxDrop: clouds/aerial/room/boxTop/boxFront faylları çatışmır");
      await download(a.clouds, path.join(dir, "clouds.jpg"));
      await download(a.aerial, path.join(dir, "aerial.jpg"));
      await download(a.room, path.join(dir, "room.jpg"));
      const topRatio = await download(a.boxTop, path.join(dir, "box-top.png"), "png");
      const frontRatio = await download(a.boxFront, path.join(dir, "box-front.png"), "png");
      const t = spec.texts ?? {};
      props = {
        dir: `render/${id}`, clouds: "clouds.jpg", aerial: "aerial.jpg", room: "room.jpg",
        boxTop: "box-top.png", boxFront: "box-front.png", topAspect: 1 / topRatio, frontAspect: 1 / frontRatio,
        pinLabel: t.pinLabel || "Yeni ev", hook: t.hook || "Köç günü", landLine: t.landLine || "Yük ünvanına çatdı",
        cta: spec.cta, music: null,
      };
      compId = "BoxDrop";
      secs = boxDropTotal() / FPS;
      log("BoxDrop: buludlar + şəhər + mənzil (real foto) + qutu (yuxarıdan və qarşıdan) yükləndi");
    } else if (spec.composition === "StoryReel" && spec.shots?.length) {
      // Əsl hərəkət: hər kadr şəkildən-videoya klipdir; "previous" əvvəlki klipin son kadrından davam edir.
      const plateFiles: string[] = [];
      for (let i = 0; i < spec.plates.length; i++) {
        const p = path.join(dir, `p${i + 1}.jpg`);
        await download(spec.plates[i].url, p);
        plateFiles.push(p);
      }
      const clips: { src: string; aspect: number; frames: number; text: string; punch: boolean; continues: boolean }[] = [];
      let lastClip: string | null = null;
      // Hazır kliplər run-lar arasında saxlanır (smm.yml → actions/cache): kvota ortada bitsə, növbəti
      // run yalnız çatışmayanları çəkir. Açar: başlanğıc kadr + prompt + müddət.
      await fs.mkdir(CLIP_CACHE, { recursive: true });
      // keş böyüməsin: 5 gündən köhnə kliplər atılır
      for (const f of await fs.readdir(CLIP_CACHE)) {
        const p = path.join(CLIP_CACHE, f);
        if (Date.now() - (await fs.stat(p)).mtimeMs > 5 * 86_400_000) await fs.rm(p, { force: true });
      }
      let prevKey = "";
      for (let i = 0; i < spec.shots.length; i++) {
        const shot = spec.shots[i];
        // Real stock video: no GPU, no quota — trim it and move on.
        if (shot.video?.url) {
          const real = path.join(dir, `clip${i + 1}-30.mp4`);
          log(`klip ${i + 1}/${spec.shots.length}: real video — ${shot.video.page ?? shot.video.url}`);
          await stockClip(shot.video.url, shot.video.start ?? 0, shot.seconds, real);
          const meta = await probe(real);
          clips.push({
            src: `render/${id}/${path.basename(real)}`, aspect: meta.w / meta.h, frames: Math.max(30, Math.round(meta.sec * FPS)),
            text: shot.text ?? "", punch: Boolean(shot.punch), continues: false,
          });
          lastClip = real;
          continue;
        }
        let start = plateFiles[Math.min(plateFiles.length - 1, Math.max(0, shot.plate ?? 0))];
        const base = shot.from === "previous" && lastClip ? `prev:${prevKey}` : createHash("sha1").update(await fs.readFile(start)).digest("hex");
        const key = createHash("sha1").update(`${base}|${shot.prompt}|${shot.seconds}`).digest("hex").slice(0, 20);
        prevKey = key;
        const cached = path.join(CLIP_CACHE, `${key}.mp4`);
        const out = path.join(dir, `clip${i + 1}.mp4`);
        if (await fs.stat(cached).then(() => true, () => false)) {
          await fs.copyFile(cached, out);
          log(`klip ${i + 1}/${spec.shots.length}: keşdən (əvvəlki run-da çəkilib)`);
        } else {
          if (shot.from === "previous" && lastClip) {
            start = path.join(dir, `last${i}.jpg`);
            await lastFrame(lastClip, start);
          }
          log(`klip ${i + 1}/${spec.shots.length}: ${shot.prompt.slice(0, 90)}`);
          await imageToVideo(start, shot.prompt, shot.seconds, out);
          await fs.copyFile(out, cached);
        }
        const smooth = await smoothClip(out, path.join(dir, `clip${i + 1}-30.mp4`));
        const meta = await probe(smooth);
        clips.push({
          src: `render/${id}/${path.basename(smooth)}`, aspect: meta.w / meta.h, frames: Math.max(30, Math.round(meta.sec * FPS)),
          text: shot.text ?? "", punch: Boolean(shot.punch), continues: shot.from === "previous",
        });
        lastClip = out;
      }
      props = { clips, cta: spec.cta, music: null, musicVolume: 0.5 };
      compId = "StoryReel";
      secs = storyReelTotal({ clips }) / FPS;
      log(`StoryReel: ${clips.length} klip hazırdır`);
    } else {
      const plates: { src: string; aspect: number }[] = [];
      for (let i = 0; i < spec.plates.length; i++) {
        const aspect = await download(spec.plates[i].url, path.join(dir, `p${i + 1}.jpg`));
        plates.push({ src: `render/${id}/p${i + 1}.jpg`, aspect });
      }
      const finalAspect = await download(spec.finalUrl, path.join(dir, "final.jpg"));
      const final = { src: `render/${id}/final.jpg`, aspect: finalAspect };
      log(`${plates.length} foto + bütöv post yükləndi`);
      const reelProps = toProps(id, spec, plates, final);
      secs = smmReelTotal(reelProps) / FPS;
      props = reelProps;
    }
    if (spec.lessons?.length) log(`komandanın qaydaları: ${spec.lessons.length}`);

    // Musiqi: telif təmiz instrumental (Instagram-da susdurulmur) → Audius/lokal/sintez → musiqisiz
    let attribution: string | null = null;
    try {
      const web = await pickWebMusic(spec.mood === "calm" ? "calm acoustic" : "upbeat quirky", secs, dir, id);
      if (web) { props.music = web.file; attribution = web.attribution ?? null; }
      else {
        const m = await pickMusic(brief.id, secs, dir, id, log);
        props.music = m.track || null; attribution = m.attribution;
      }
    } catch (e) { log(`⚠ musiqi: ${(e as Error).message} — musiqisiz davam`); }

    const propsPath = path.join(dir, "props.json");
    await fs.writeFile(propsPath, JSON.stringify(props, null, 2));
    await fs.mkdir("out", { recursive: true });
    const out = path.join("out", `${id}.mp4`);
    log(`render: ${secs.toFixed(1)} san`);
    await run("npx", ["remotion", "render", "src/index.ts", compId, out, `--props=${propsPath}`, "--concurrency=2"]);

    const stat = await fs.stat(out);
    const mb = stat.size / 1024 / 1024;
    if (mb < 0.3 || mb > 95) throw new Error(`QA: video həcmi qəribədir (${mb.toFixed(1)} MB)`);
    if (secs < 5 || secs > 60) throw new Error(`QA: müddət ${secs.toFixed(1)} san`);
    log(`QA ✓ ${mb.toFixed(1)} MB, ${secs.toFixed(1)} san`);

    if (!DELIVER) { console.log(`\n✓ Hazırdır (təhvil verilmədi): ${out}`); return; }
    const q = new URLSearchParams({ briefId: String(brief.id) });
    if (attribution) q.set("attribution", attribution);
    const res = await smmFetch(`${SMM_URL}/api/motion/reels?${q}`, {
      method: "POST", headers: { ...auth, "Content-Type": "video/mp4" }, body: await fs.readFile(out),
    }, 3);
    const answer = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`SMM agent qəbul etmədi (${res.status}): ${JSON.stringify(answer).slice(0, 300)}`);
    console.log(`\n✓ SMM agentə təhvil verildi: ${JSON.stringify(answer)}`);
  } catch (e) {
    const reason = e instanceof QuotaError ? `quota: ${(e as Error).message}` : (e as Error).message;
    console.error(`\n✗ ${reason}`);
    // 422-də SMM agent tapşırığı özü yenidən açıb — ikinci dəfə bildirmə
    if (!/qəbul etmədi \(422\)/.test(reason)) await reportFail(brief.id, reason);
    process.exitCode = 1;
  }
};

if (/[\\/]smm\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
