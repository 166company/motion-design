/**
 * Musiqi axtarışı — webdən TREND siqnalı + Instagram-da BLOKLANMAYAN treklər.
 *
 * Vacib fərq (dürüst olaq): Instagram-ın çartındakı hit mahnılar biznes hesabında API ilə yüklənən videoya
 * qoşula BİLMƏZ — Meta-nın hüquq sistemi onları susdurur/bloklayır. Ona görə:
 *   1) TREND SİQNALI webdən oxunur (Deezer chart + iTunes Search, açarsız) → hansı janr/ovqat indi qaynayır
 *   2) HƏMİN JANRDA lisenziyası təmiz trek axtarılır (Openverse CC0/BY, ccMixter, Audius) → yükləmək təhlükəsizdir
 *   3) Vokal yoxlaması (Groq Whisper, pulsuz) → instrumental seçilir: nə söz, nə də tanınan melodiya riski
 *
 *   npx tsx pipeline/music_web.ts trends           → cari trend janrlar (content/music-trends.json)
 *   npx tsx pipeline/music_web.ts find "energetic" → uyğun təhlükəsiz treklər (content/music-pool.json)
 *   npx tsx pipeline/music_web.ts get <sec> <dir> <id> → ən yaxşısını yükləyir (pipeline üçün)
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const UA = { "User-Agent": "yukaz-motion-agent/1.0 (+https://yuk.az)" };
const log = (m: string) => console.log(`  ${m}`);

/** Namizəd janr/ovqat sorğuları — trend siqnalı bunları sıralayır */
const GENRES = [
  "phonk", "afrobeats", "amapiano", "drill", "lo-fi hip hop", "synthwave", "hyperpop", "future funk",
  "melodic techno", "jersey club", "reggaeton", "trap", "indie pop", "cinematic epic", "corporate upbeat",
  "acoustic folk", "chillhop", "house", "garage", "ambient",
];

export type Trend = { genre: string; fresh: number; sample: string[] };

/** Trend siqnalı: iTunes Search-də son 120 günün buraxılışlarının payı + Deezer chart-dan ovqat işarələri */
export const trendSignals = async (): Promise<Trend[]> => {
  const since = Date.now() - 120 * 86400e3;
  const out: Trend[] = [];
  for (const g of GENRES) {
    try {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(g)}&media=music&limit=25`, { headers: UA, signal: AbortSignal.timeout(20000) });
      const j = (await r.json()) as any;
      const items = (j.results ?? []) as any[];
      const fresh = items.filter((t) => new Date(t.releaseDate ?? 0).getTime() > since).length / Math.max(1, items.length);
      out.push({ genre: g, fresh: +(fresh * 100).toFixed(0), sample: items.slice(0, 3).map((t) => `${t.trackName} — ${t.artistName}`) });
    } catch { /* keç */ }
  }
  // Deezer chart — ümumi ovqat işarəsi (yalnız siqnal, audio İSTİFADƏ OLUNMUR)
  let chart: string[] = [];
  try {
    const j = (await (await fetch("https://api.deezer.com/chart/0/tracks?limit=10", { headers: UA, signal: AbortSignal.timeout(20000) })).json()) as any;
    chart = (j.data ?? []).map((t: any) => `${t.title} — ${t.artist?.name}`);
  } catch { /* keç */ }
  out.sort((a, b) => b.fresh - a.fresh);
  await fs.mkdir("content", { recursive: true });
  await fs.writeFile("content/music-trends.json", JSON.stringify({ fetchedAt: new Date().toISOString(), chart, genres: out }, null, 2), "utf-8");
  return out;
};

export type Track = { id: string; title: string; artist: string; license: string; url: string; download: string; duration: number; source: "openverse" | "ccmixter" | "audius"; attribution: string };

/** Kommersiya istifadəsinə icazə verənlər: CC0 / public domain / BY / BY-SA. NC və ND QADAĞANDIR (biznes hesabı) */
const OK_LICENSE = /^(cc0|pdm|by|by-sa|publicdomain|attribution( share ?alike)?( \(?\d|\b)|creative commons attribution)/i;
const BAD_LICENSE = /non-?commercial|\bnc\b|no-?deriv|\bnd\b|sampling/i;
const licenseOk = (l: string) => OK_LICENSE.test(l ?? "") && !BAD_LICENSE.test(l ?? "");
const BAD_TITLE = /\b(remix|cover|feat\.?|vs\.?|mashup|karaoke|acapella|type beat)\b/i;

/** Openverse — CC0/BY audio (açarsız) */
const fromOpenverse = async (q: string, minSec: number): Promise<Track[]> => {
  const r = await fetch(`https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=cc0,by&page_size=20`, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return [];
  const j = (await r.json()) as any;
  return (j.results ?? [])
    .filter((a: any) => (a.duration ?? 0) / 1000 >= minSec && !BAD_TITLE.test(a.title ?? "") && licenseOk(String(a.license)))
    .map((a: any) => ({
      id: `ov-${a.id}`, title: a.title ?? "Untitled", artist: a.creator ?? "—", license: String(a.license).toUpperCase(),
      url: a.foreign_landing_url ?? a.url, download: a.url, duration: Math.round((a.duration ?? 0) / 1000), source: "openverse" as const,
      attribution: `🎵 ${a.title ?? "Untitled"} — ${a.creator ?? "—"} (CC ${String(a.license).toUpperCase()}) · openverse.org`,
    }));
};

/** ccMixter — CC musiqi (açarsız) */
const fromCcMixter = async (q: string, minSec: number): Promise<Track[]> => {
  const r = await fetch(`https://ccmixter.org/api/query?f=json&limit=20&tags=${encodeURIComponent(q)}&sinced=2024-01-01`, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return [];
  const j = (await r.json()) as any[];
  return (j ?? [])
    .filter((x) => licenseOk(x.license_name ?? "") && !BAD_TITLE.test(x.upload_name ?? ""))
    .map((x) => {
      const file = (x.files ?? []).find((f: any) => /mp3/i.test(f.file_format_info?.["mime-type"] ?? f.file_name ?? ""));
      return {
        id: `cc-${x.upload_id}`, title: x.upload_name, artist: x.user_name, license: x.license_name,
        url: x.file_page_url ?? `https://ccmixter.org/files/${x.user_name}/${x.upload_id}`,
        download: file?.download_url ?? "", duration: Number(file?.file_format_info?.duration ?? 0) || 0,
        source: "ccmixter" as const,
        attribution: `🎵 ${x.upload_name} — ${x.user_name} (${x.license_name}) · ccmixter.org`,
      };
    })
    .filter((t) => t.download && (t.duration === 0 || t.duration >= minSec));
};

/** Audius — CC lisenziyalı treklər (açarsız oxuma) */
const fromAudius = async (q: string, minSec: number): Promise<Track[]> => {
  const hosts = (await (await fetch("https://api.audius.co", { headers: UA, signal: AbortSignal.timeout(15000) })).json()) as any;
  const host = (hosts.data ?? [])[0];
  if (!host) return [];
  const r = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=yukaz&limit=20`, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return [];
  const j = (await r.json()) as any;
  return (j.data ?? [])
    .filter((t: any) => licenseOk(t.license ?? "") && (t.duration ?? 0) >= minSec && !BAD_TITLE.test(t.title ?? "") && t.is_downloadable !== false)
    .map((t: any) => ({
      id: `au-${t.id}`, title: t.title, artist: t.user?.name ?? "—", license: t.license ?? "CC",
      url: t.permalink ? `https://audius.co${t.permalink}` : "https://audius.co",
      download: `${host}/v1/tracks/${t.id}/stream?app_name=yukaz`, duration: t.duration ?? 0, source: "audius" as const,
      attribution: `🎵 ${t.title} — ${t.user?.name ?? "—"} (${t.license ?? "CC"}) · audius.co`,
    }));
};

/** Trend janrına uyğun, lisenziyası təmiz namizədlər */
export const findTracks = async (mood: string, minSec: number): Promise<Track[]> => {
  const trends = JSON.parse(await fs.readFile("content/music-trends.json", "utf-8").catch(() => "null"))?.genres as Trend[] | undefined
    ?? await trendSignals();
  const top = trends.slice(0, 5).map((t) => t.genre);
  const queries = [...new Set([mood, ...top.map((g) => `${g} instrumental`)])].slice(0, 6);
  const all: Track[] = [];
  for (const q of queries) {
    for (const fn of [fromOpenverse, fromCcMixter, fromAudius]) {
      try { all.push(...(await fn(q, minSec))); } catch (e) { log(`${fn.name}(${q}): ${(e as Error).message.slice(0, 60)}`); }
    }
    if (all.length > 25) break;
  }
  const seen = new Set<string>();
  const uniq = all.filter((t) => !seen.has(t.title.toLowerCase()) && seen.add(t.title.toLowerCase()));
  await fs.writeFile("content/music-pool.json", JSON.stringify({ mood, trendGenres: top, fetchedAt: new Date().toISOString(), tracks: uniq }, null, 2), "utf-8");
  return uniq;
};

/** Vokal yoxlaması — Groq Whisper (pulsuz). Xəta olsa "bilinmir" qaytarır, blok etmir. */
const isInstrumental = (file: string): Promise<boolean | null> =>
  new Promise((res) => {
    if (!process.env.GROQ_API_KEY) return res(null);
    const py = spawn("python", ["-c", `
import json,os,sys,urllib.request
p=sys.argv[1]; key=os.environ["GROQ_API_KEY"]
b="----yk"+os.urandom(6).hex()
def part(k,v): return ("--%s\\r\\nContent-Disposition: form-data; name=\\"%s\\"\\r\\n\\r\\n%s\\r\\n"%(b,k,v)).encode()
body=part("model",os.environ.get("GROQ_WHISPER_MODEL","whisper-large-v3-turbo"))+part("response_format","json")
body+=("--%s\\r\\nContent-Disposition: form-data; name=\\"file\\"; filename=\\"a.mp3\\"\\r\\nContent-Type: audio/mpeg\\r\\n\\r\\n"%b).encode()+open(p,"rb").read()+("\\r\\n--%s--\\r\\n"%b).encode()
req=urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions",data=body,headers={"Authorization":"Bearer "+key,"Content-Type":"multipart/form-data; boundary="+b})
try:
    t=json.load(urllib.request.urlopen(req,timeout=120)).get("text","")
except Exception as e:
    print("?"); sys.exit(0)
words=[w for w in t.split() if len(w)>2]
print("instrumental" if len(words)<8 else "vocal")
`, file], { env: { ...process.env, PYTHONUTF8: "1" } });
    let out = "";
    py.stdout.on("data", (d) => (out += d));
    py.on("close", () => res(out.includes("instrumental") ? true : out.includes("vocal") ? false : null));
  });

const download = async (url: string, dest: string) => {
  const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`yükləmə ${r.status}`);
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
};

/** Pipeline üçün: uyğun treki tap, yüklə, vokal yoxla → { file, attribution, track } */
export const pickWebMusic = async (mood: string, seconds: number, dir: string, id: string) => {
  const pool = await findTracks(mood, Math.max(20, Math.round(seconds)));
  log(`${pool.length} namizəd (lisenziya təmiz)`);
  for (const t of pool.slice(0, 8)) {
    const dest = path.join(dir, "music.mp3");
    try {
      await download(t.download, dest);
      const stat = await fs.stat(dest);
      if (stat.size < 100_000) throw new Error("fayl kiçikdir");
      const instr = await isInstrumental(dest);
      if (instr === false) { log(`✗ vokal: ${t.title}`); continue; }
      log(`✓ ${t.title} — ${t.artist} (${t.license}${instr === null ? ", vokal yoxlanmadı" : ", instrumental"})`);
      return { file: `render/${id}/music.mp3`, track: t, attribution: t.attribution, instrumental: instr };
    } catch (e) { log(`✗ ${t.title}: ${(e as Error).message.slice(0, 50)}`); }
  }
  return null;
};

if (/[\\/]music_web\.ts$/.test(process.argv[1] ?? "")) {
  const cmd = process.argv[2] ?? "trends";
  if (cmd === "trends") {
    const t = await trendSignals();
    console.log("\nTrend janrlar (son 120 günün buraxılış payı):");
    for (const g of t.slice(0, 10)) console.log(`  ${String(g.fresh).padStart(3)}%  ${g.genre.padEnd(18)} ${g.sample[0] ?? ""}`);
    console.log("\n→ content/music-trends.json\n");
  } else if (cmd === "find") {
    const list = await findTracks(process.argv[3] ?? "energetic", Number(process.argv[4] ?? 25));
    for (const t of list.slice(0, 15)) console.log(`  ${t.source.padEnd(9)} ${t.license.padEnd(22)} ${t.duration}s  ${t.title} — ${t.artist}`);
    console.log(`\n${list.length} trek → content/music-pool.json\n`);
  } else if (cmd === "get") {
    const [, , , sec, dir, id] = process.argv;
    console.log(await pickWebMusic("upbeat", Number(sec), dir, id));
  }
}
