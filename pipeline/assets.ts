/** Pexels — portret stok video. Pulsuz açar, kart yoxdur. */

export type Media = { kind: "video" | "image"; src: string; duration: number | null };

const MAX_MB = 22;   // render sürəti üçün

/**
 * needSeconds — bu videonun örtməli olduğu səhnənin uzunluğu.
 * Ehtiyat pay MÜTLƏQdir: video səhnədən qısa olsa, render "no frame found" ilə çökür.
 */
export const findVideo = async (query: string, needSeconds = 6): Promise<Media | null> => {
  const minDur = Math.ceil(needSeconds) + 2;
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&orientation=portrait&size=medium&per_page=8`;

  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const data = (await res.json()) as any;

  for (const v of data.videos ?? []) {
    if (v.duration < minDur) continue;
    // 1080x1920-ə ən yaxın, amma çox böyük olmayan faylı seç
    const files = (v.video_files ?? [])
      .filter((f: any) => f.height >= 1000 && f.height <= 2200 && f.file_type === "video/mp4")
      .sort((a: any, b: any) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
    if (files[0]) return { kind: "video", src: files[0].link, duration: v.duration };
  }
  return null;
};

/** Video tapılmasa şəklə keç — səhnə heç vaxt boş qalmasın */
export const findImage = async (query: string): Promise<Media | null> => {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`,
    { headers: { Authorization: key } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const p = data.photos?.[0];
  return p ? { kind: "image", src: p.src.large2x ?? p.src.large, duration: null } : null;
};

export const findMedia = async (query: string, needSeconds = 6): Promise<Media | null> =>
  (await findVideo(query, needSeconds)) ?? (await findImage(query));

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";

/** Remotion-un öz ffmpeg-i — sistemdə ayrıca ffmpeg lazım deyil */
const ffmpegPath = () => {
  const require = createRequire(import.meta.url);
  const plat = `${process.platform}-${process.arch}`;
  const pkg: Record<string, string> = {
    "win32-x64": "@remotion/compositor-win32-x64-msvc",
    "linux-x64": "@remotion/compositor-linux-x64-gnu",
    "darwin-arm64": "@remotion/compositor-darwin-arm64",
    "darwin-x64": "@remotion/compositor-darwin-x64",
  };
  const name = pkg[plat];
  if (!name) throw new Error(`ffmpeg üçün dəstəklənməyən platforma: ${plat}`);
  const dir = require.resolve(`${name}/package.json`).replace(/package\.json$/, "");
  return dir + (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
};

/**
 * Yüklənən stok videonu vahid formata gətirir:
 * 1080×1920, 30 fps, h264 yuv420p, səssiz, lazım olan uzunluğa kəsilmiş.
 *
 * Niyə məcburidir: Pexels faylları müxtəlif fps/GOP ilə gəlir və Remotion
 * bəzilərində "No frame found at position N" ilə çökür. Normallaşdırma bunu
 * kökündən həll edir, üstəlik faylı 5–10 dəfə kiçildir və render sürətlənir.
 */
export const normalizeVideo = async (src: string, dest: string, seconds: number) => {
  const args = [
    "-hide_banner", "-y", "-loglevel", "error",
    "-i", src,
    "-t", (seconds + 1.5).toFixed(2),
    "-vf", "scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=w=1080:h=1920",
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    dest,
  ];
  await new Promise<void>((res, rej) => {
    const p = spawn(ffmpegPath(), args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err.slice(-300)}`))));
  });
  await fs.unlink(src).catch(() => {});
};
