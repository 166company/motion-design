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
import sharp from "sharp";
import { SMM_TRANSITION, smmReelTotal, SMM_CAMERAS, SMM_SFX, type SmmReelProps } from "../src/compositions/SmmReel.tsx";
import { boxDropTotal } from "../src/compositions/BoxDrop.tsx";
import { pickWebMusic } from "./music_web.ts";
import { pickMusic } from "./audio.ts";

const FPS = 30;
const SMM_URL = (process.env.SMM_URL ?? "").replace(/\/+$/, "");
const SMM_TOKEN = process.env.SMM_TOKEN ?? "";
const DELIVER = process.env.SMM_DELIVER !== "0";
const log = (m: string) => console.log(`  ${m}`);

type Spec = {
  version: number; briefId: number; topic: string; caption: string; layout: string;
  header?: string; plates: { url: string; scene?: string }[]; finalUrl: string; lettered: boolean;
  scenes: { plate: number; text?: string; label?: string; punch?: boolean; seconds: number; camera: string; focus: { x: number; y: number }; textAt: number; sfx: string }[];
  cta: { line1: string; line2: string }; mood: "upbeat" | "calm"; notes?: string;
  composition?: "SmmReel" | "BoxDrop"; assets?: Record<string, string>; texts?: Record<string, string>; lessons?: string[];
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
      if (!a.aerial || !a.room || !a.box) throw new Error("BoxDrop: aerial/room/box faylları çatışmır");
      await download(a.aerial, path.join(dir, "aerial.jpg"));
      await download(a.room, path.join(dir, "room.jpg"));
      const boxAspect = await download(a.box, path.join(dir, "box.png"), "png");
      const t = spec.texts ?? {};
      props = {
        dir: `render/${id}`, aerial: "aerial.jpg", room: "room.jpg", box: "box.png", boxAspect: 1 / boxAspect,
        pinLabel: t.pinLabel || "Yeni ev", hook: t.hook || "Köç günü", landLine: t.landLine || "Yük ünvanına çatdı",
        cta: spec.cta, music: null,
      };
      compId = "BoxDrop";
      secs = boxDropTotal() / FPS;
      log("BoxDrop: şəhər + mənzil (real foto) + qutu yükləndi");
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
    const reason = (e as Error).message;
    console.error(`\n✗ ${reason}`);
    // 422-də SMM agent tapşırığı özü yenidən açıb — ikinci dəfə bildirmə
    if (!/qəbul etmədi \(422\)/.test(reason)) await reportFail(brief.id, reason);
    process.exitCode = 1;
  }
};

if (/[\\/]smm\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
