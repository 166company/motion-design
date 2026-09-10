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
