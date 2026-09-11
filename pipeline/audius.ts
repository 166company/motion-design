/**
 * Audius — Creative Commons fon musiqisi.
 *
 * VACİB: Audius-dakı treklərin ~99%-i "All rights reserved" və ya lisenziyasızdır.
 * Onları reklamda işlətmək müəllif hüququ pozuntusudur. Bu modul YALNIZ
 * kommersiya istifadəsinə açıq CC lisenziyalı trekləri seçir və atributu
 * caption-a əlavə edir (CC BY-nin tələbidir).
 */
import fs from "node:fs/promises";
import path from "node:path";

const API = "https://api.audius.co/v1";
const APP = "yukaz-motion";

/** Kommersiya istifadəsinə və video ilə birləşdirməyə icazə verən lisenziyalar */
const ALLOWED_LICENSES = new Set([
  "Attribution CC BY",
  "Attribution ShareAlike CC BY-SA",
  "Public Domain",
  "CC0",
]);

/** Fon musiqisi üçün yararsız janrlar */
const EXCLUDED_GENRES = new Set(["Spoken Word", "Podcasts", "Comedy", "Audiobooks", "Kids"]);

/** Brendin ovqatına uyğun axtarış sorğuları */
// 2026 Reels trendi (brend kontenti üçün): gümrah feel-good, lo-fi hip-hop,
// energetic instrumental, house/funk, atmosferik build-up. Vokalsız.
const QUERIES = [
  "upbeat instrumental", "feel good instrumental", "energetic beat", "uplifting hip hop instrumental",
  "funk instrumental", "house instrumental", "phonk instrumental", "trap beat instrumental",
  "pop instrumental upbeat", "summer vibes instrumental", "groove instrumental", "drill beat",
  "lofi hip hop", "chill beat", "upbeat corporate", "motivational instrumental",
  "cinematic build", "electronic upbeat", "positive energy", "afrobeat instrumental",
];

export type AudiusTrack = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  license: string;
  genre: string | null;
  permalink: string;
  streamUrl: string;
};

const headers = () => {
  const token = process.env.AUDIUS_API_TOKEN;
  return {
    "User-Agent": APP,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const toTrack = (t: any): AudiusTrack | null => {
  if (!ALLOWED_LICENSES.has(t.license ?? "")) return null;
  if (!t.is_streamable || t.is_stream_gated || t.is_unlisted || t.is_delete) return null;
  if (EXCLUDED_GENRES.has(t.genre ?? "")) return null;
  if (!t.stream?.url) return null;
  const d = Number(t.duration) || 0;
  if (d < 30 || d > 600) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.user?.name ?? "Unknown",
    duration: d,
    license: t.license,
    genre: t.genre ?? null,
    permalink: `https://audius.co${t.permalink}`,
    streamUrl: t.stream.url,
  };
};

/**
 * Kataloqu yığır. Nəticəni content/data/audius-catalog.json-a keşləyir —
 * hər işə düşəndə 10 sorğu atmayaq və seçim təkrarlana bilsin.
 * Keş 7 gündən köhnədirsə yenilənir.
 */
export const catalog = async (): Promise<AudiusTrack[]> => {
  const cachePath = path.join("content", "data", "audius-catalog.json");
  const cached = await fs.readFile(cachePath, "utf-8").then(JSON.parse).catch(() => null);
  if (cached && Date.now() - cached.fetchedAt < 7 * 86400_000 && cached.tracks?.length) {
    return cached.tracks;
  }

  const seen = new Map<string, AudiusTrack>();
  for (const q of QUERIES) {
    const res = await fetch(
      `${API}/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP}&limit=50`,
      { headers: headers() }
    ).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json()) as any;
    for (const raw of data.data ?? []) {
      const t = toTrack(raw);
      if (t && !seen.has(t.id)) seen.set(t.id, t);
    }
  }

  const tracks = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (tracks.length) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), tracks }, null, 2), "utf-8");
  }
  return tracks;
};

/**
 * Videoya uyğun trek seçib yükləyir.
 * Seçim məqalə ID-sinə görə deterministikdir — eyni video həmişə eyni musiqi.
 * Stream URL-ləri imzalıdır və vaxtla bitir, ona görə yükləmə anında kataloqdan
 * təzə URL götürülür.
 */
export const pickAndDownload = async (
  seed: number,
  needSeconds: number,
  dest: string
): Promise<{ track: AudiusTrack; attribution: string } | null> => {
  // İki istisna mənbəyi:
  //  - music-exclude.json — sənin əl ilə yazdığın ID-lər
  //  - music-screen.json  — screen_music.py-nin Whisper ilə tapdığı vokallı treklər
  const excluded: string[] = await fs
    .readFile(path.join("content", "data", "music-exclude.json"), "utf-8")
    .then(JSON.parse)
    .catch(() => []);
  const screen: Record<string, { vocal: boolean | null }> = await fs
    .readFile(path.join("content", "data", "music-screen.json"), "utf-8")
    .then(JSON.parse)
    .catch(() => ({}));

  const all = await catalog();
  const fit = all.filter(
    (t) => t.duration >= needSeconds + 5 && !excluded.includes(t.id) && screen[t.id]?.vocal !== true
  );
  if (!fit.length) return null;

  const track = fit[seed % fit.length];

  // İmzalı URL-lər tez köhnəlir və mirror-lar bəzən 403 verir — 3 cəhd, hər dəfə təzə URL
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    const fresh = await fetch(`${API}/tracks/${track.id}?app_name=${APP}`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const url = fresh?.data?.stream?.url ?? track.streamUrl;
    const res = await fetch(url, { headers: { "User-Agent": APP } }).catch(() => null);
    if (res?.ok) {
      await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      saved = true;
    } else {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  if (!saved) return null;

  const short = track.license.replace("Attribution ShareAlike ", "").replace("Attribution ", "");
  const attribution = `🎵 ${track.title} — ${track.artist} (${short}) ${track.permalink}`;
  return { track, attribution };
};

if (process.argv[1]?.endsWith("audius.ts")) {
  const { config } = await import("dotenv");
  config();
  const tracks = await catalog();
  console.log(`kataloq: ${tracks.length} yararlı trek\n`);
  for (const t of tracks) {
    console.log(`  ${t.duration.toString().padStart(3)}s  ${t.title.slice(0, 36).padEnd(36)}  ${t.artist.slice(0, 18).padEnd(18)}  ${t.license}`);
  }
}
