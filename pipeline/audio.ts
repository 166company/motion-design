/** Ortaq audio köməkçiləri — run.ts (TipList) və explainer.ts hər ikisi bunları işlədir. */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pickAndDownload } from "./audius.ts";

export const VO_DB = -18;     // səsləndirmə hədəfi (RMS dBFS)
export const MUSIC_DB = -20;  // musiqi hədəfi; Remotion-da ducking bunun üstündən tətbiq olunur

const py = (args: string[], extraEnv: Record<string, string> = {}) =>
  new Promise<string>((res, rej) => {
    const p = spawn("python", args, { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...extraEnv } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`${args[0]} ${c}: ${err.slice(-400)}`))));
    return p;
  });

export type TtsResult = Record<string, { words: any[]; duration: number; file: string }>;

/** TTS_ENGINE=openai (default) və ya edge. Nəticə: söz vaxtları + müddət. */
export const runTts = (jobs: { id: string; text: string }[], outDir: string, voice: string): Promise<TtsResult> =>
  new Promise((res, rej) => {
    const script = process.env.TTS_ENGINE === "edge" ? "pipeline/tts.py" : "pipeline/tts_openai.py";
    const p = spawn("python", [script, outDir], {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", OPENAI_TTS_VOICE: voice },
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error(`tts ${c}: ${err.slice(-400)}`))));
    p.stdin.write(JSON.stringify(jobs));
    p.stdin.end();
  });

/** Səviyyə normallaşdırma (loudness.py). windowSec — musiqi üçün ən dolğun parça. */
export const normalizeAudio = async (src: string, dest: string, targetDb: number, stereo = false, windowSec?: number) => {
  const args = ["pipeline/loudness.py", src, dest, String(targetDb), stereo ? "stereo" : "mono"];
  if (windowSec) args.push(windowSec.toFixed(1));
  await py(args);
};

/** Səsləndirmə fayllarını normallaşdırır, mp3-ləri silir; props üçün .wav yolları qaytarır */
export const normalizeVo = async (ids: string[], dir: string) => {
  for (const id of ids) {
    await normalizeAudio(path.join(dir, `${id}.mp3`), path.join(dir, `${id}.wav`), VO_DB);
    await fs.unlink(path.join(dir, `${id}.mp3`)).catch(() => {});
  }
};

export type MusicPick = {
  track: string;                 // props üçün public-nisbi yol
  attribution: string | null;
  musicTrack: { id: string; title: string; artist: string; license: string } | null;
  source: "local" | "audius" | "synth";
};

/**
 * Musiqi prioriteti: public/music/ → Audius CC → sintez.
 * Seçilən trek videonun uzunluğuna kəsilir və -20 dBFS-ə gətirilir.
 */
export const pickMusic = async (seed: number, seconds: number, dir: string, publicId: string, log: (m: string) => void): Promise<MusicPick> => {
  if (process.env.MUSIC_MOOD === "none") {
    log("musiqi: yoxdur (qeydə görə)");
    return { track: "", attribution: null, musicTrack: null, source: "synth" };
  }
  const local = await fs.readdir("public/music").then((f) => f.filter((x) => /\.(mp3|m4a|wav)$/i.test(x)).sort()).catch(() => [] as string[]);
  let src: string | null = null;
  let pick: MusicPick = { track: "", attribution: null, musicTrack: null, source: "synth" };

  if (local.length) {
    src = path.join("public", "music", local[seed % local.length]);
    pick = { ...pick, source: "local" };
    log(`musiqi: lokal — ${path.basename(src)}`);
  } else {
    const dest = path.join(dir, "music.mp3");
    const picked = await pickAndDownload(seed, seconds, dest).catch((e) => { log(`⚠ Audius: ${e.message}`); return null; });
    if (picked) {
      src = dest;
      pick = {
        ...pick, source: "audius", attribution: picked.attribution,
        musicTrack: { id: picked.track.id, title: picked.track.title, artist: picked.track.artist, license: picked.track.license },
      };
      log(`musiqi: Audius — ${picked.track.title} (${picked.track.artist}, ${picked.track.license})`);
    }
  }
  if (!src) {
    src = path.join(dir, "music.wav");
    await py(["pipeline/music.py", src, String(seed), seconds.toFixed(1)]);
    log("musiqi: sintez (orijinal)");
  }

  const norm = path.join(dir, "music.norm.wav");
  await normalizeAudio(src, norm, MUSIC_DB, true, seconds + 2);
  return { ...pick, track: `render/${publicId}/music.norm.wav` };
};
