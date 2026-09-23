/**
 * Pulsuz API kataloqu — github.com/public-apis/public-apis README-si oxunur, süzülür və layihəyə uyğun rollara bölünür.
 *
 *   npx tsx pipeline/apis.ts            → content/free-apis.json + out/free-apis.md
 *   npx tsx pipeline/apis.ts --check    → bizim istifadə etdiyimiz API-ləri canlı yoxlayır (açarsız olanları)
 *
 * Süzgəc: HTTPS=Yes, Auth = yoxdur / apiKey (pulsuz səviyyə), CORS mühüm deyil (server tərəfdə işlədirik).
 * "useful" = bizim üçün faydalı rollardan birinə düşənlər (media, musiqi, şəkil, şrift, ikon, mətn, data, coğrafiya…).
 */
import fs from "node:fs/promises";

const README = "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md";

export type Api = { name: string; url: string; description: string; auth: string; https: boolean; cors: string; category: string; roles: string[] };

/** Bizim pipeline üçün rollar — açar sözlərlə tanınır */
const ROLES: Record<string, RegExp> = {
  "şəkil/foto":     /\b(photo|image|picture|stock|wallpaper|unsplash|pexels|pixabay|illustration|avatar|placeholder)\b/i,
  "video":          /\b(video|clip|footage|stream|movie file|mp4)\b/i,
  "musiqi/audio":   /\b(music|audio|song|track|sound|podcast|radio|jamendo|audius|deezer|spotify|lyric)\b/i,
  "şrift/ikon":     /\b(font|typeface|icon|iconset|svg|emoji|logo)\b/i,
  "mətn/tərcümə":   /\b(translat|dictionary|lorem|text generat|quote|proverb|language detect|transliterat)\b/i,
  "ML/AI":          /\b(machine learning|ai\b|nlp|sentiment|speech|transcri|ocr|caption|summar)\b/i,
  "coğrafiya":      /\b(geocod|map|address|country|city|postal|zip|distance|route|timezone)\b/i,
  "hava/mövsüm":    /\b(weather|forecast|temperature|air quality|sunrise)\b/i,
  "təqvim/bayram":  /\b(holiday|calendar|date|time\b|nager|workday|namaz|prayer)\b/i,
  "valyuta/iqtisad":/\b(currency|exchange rate|fuel|price index|inflation|salary)\b/i,
  "nəqliyyat/yük":  /\b(transport|logistic|shipping|freight|truck|delivery|parcel|traffic|vehicle|fleet|road)\b/i,
  "sosial/trend":   /\b(reddit|twitter|instagram|tiktok|youtube|trend|meme|social|news)\b/i,
  "alət/utility":   /\b(qr code|url short|screenshot|pdf|convert|color|palette|random|uuid|webhook|email valid)\b/i,
};

const parse = (md: string): Api[] => {
  const out: Api[] = [];
  let category = "";
  let inApiTable = false;
  for (const line of md.split("\n")) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) { category = h[1].trim(); inApiTable = false; continue; }
    // başlıq sətri bəzən "|" ilə başlamır: "API | Description | Auth | HTTPS | CORS"
    if (/^\|?\s*API\s*\|\s*Description\s*\|/i.test(line)) { inApiTable = /Auth/i.test(line); continue; }
    if (!inApiTable || !line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const m = cells[0].match(/\[(.+?)\]\((.+?)\)/);
    if (!m) continue;
    const auth = cells[2].replace(/`/g, "").trim();
    const api: Api = {
      name: m[1], url: m[2], description: cells[1], auth: auth || "No",
      https: /yes/i.test(cells[3]), cors: cells[4], category, roles: [],
    };
    const hay = `${api.name} ${api.description} ${api.category}`;
    api.roles = Object.entries(ROLES).filter(([, re]) => re.test(hay)).map(([k]) => k);
    out.push(api);
  }
  return out;
};

/** Layihədə HAZIRDA işlətdiyimiz / işlədə biləcəyimiz pulsuz API-lər — rol və istifadə yeri ilə */
export const STACK = [
  { name: "Pexels", role: "video + foto (premium stok)", auth: "pulsuz açar", used: "assets.ts — TipList fonları, Showcase kadrları", url: "https://www.pexels.com/api/" },
  { name: "Audius", role: "musiqi (CC/açıq lisenziya)", auth: "açarsız (token istəyə bağlı)", used: "audius.ts — fon musiqisi", url: "https://audiusproject.github.io/api-docs/" },
  { name: "Jamendo", role: "musiqi (CC, trend siyahıları)", auth: "pulsuz client_id", used: "music_web.ts — Instagram-təhlükəsiz trek axtarışı", url: "https://developer.jamendo.com/v3.0" },
  { name: "Free Music Archive / ccMixter", role: "musiqi (CC)", auth: "açarsız", used: "music_web.ts — ehtiyat mənbə", url: "https://ccmixter.org/query-api" },
  { name: "Openverse", role: "CC şəkil + audio axtarışı (Creative Commons)", auth: "açarsız (limitli)", used: "music_web.ts / şəkil ehtiyatı", url: "https://api.openverse.org/v1/" },
  { name: "Iconify", role: "100k+ ikon (SVG)", auth: "açarsız", used: "run.ts — TipList ikonları", url: "https://iconify.design/docs/api/" },
  { name: "Google Fonts (@remotion/google-fonts)", role: "şrift", auth: "açarsız", used: "brand/fonts.ts — Inter", url: "https://fonts.google.com" },
  { name: "Imgflip", role: "meme şablonları", auth: "açarsız (oxuma)", used: "trends.ts — format bankı", url: "https://api.imgflip.com/" },
  { name: "Nager.Date", role: "dövlət bayramları (AZ daxil)", auth: "açarsız", used: "calendar.ts — bayram/mövsüm planı", url: "https://date.nager.at/api/v3" },
  { name: "Open-Meteo", role: "hava proqnozu (açarsız)", auth: "açarsız", used: "calendar.ts — 'yağışda köç' kimi mövsümi mövzular", url: "https://open-meteo.com/en/docs" },
  { name: "WordPress REST (yuk.az)", role: "məzmun mənbəyi", auth: "açarsız", used: "wp.ts — faktlar", url: "https://yuk.az/wp-json/wp/v2/posts" },
  { name: "Meta Graph API", role: "yayım + analitika", auth: "System User token", used: "publish.ts, analytics.ts", url: "https://developers.facebook.com/docs/graph-api" },
] as const;

const main = async () => {
  const check = process.argv.includes("--check");
  console.log("\n1. public-apis README oxunur…");
  const md = await (await fetch(README)).text();
  const all = parse(md);
  const free = all.filter((a) => a.https && !/oauth/i.test(a.auth) === false ? true : a.https);
  const noCard = all.filter((a) => a.https && /^(no|apikey|user-?agent)?$/i.test(a.auth.replace(/\s/g, "")));
  const useful = all.filter((a) => a.roles.length && a.https);
  console.log(`   ${all.length} API · HTTPS+pulsuz giriş: ${noCard.length} · bizim rollara uyğun: ${useful.length}`);
  void free;

  await fs.mkdir("content", { recursive: true });
  await fs.writeFile("content/free-apis.json", JSON.stringify({
    source: "https://github.com/public-apis/public-apis",
    fetchedAt: new Date().toISOString(),
    total: all.length,
    stack: STACK,
    useful: useful.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  }, null, 2), "utf-8");

  // oxunaqlı hesabat — rol → API cədvəli
  const byRole = new Map<string, Api[]>();
  for (const a of useful) for (const r of a.roles) byRole.set(r, [...(byRole.get(r) ?? []), a]);
  const lines = [`# Pulsuz API kataloqu (public-apis)`, "", `Mənbə: https://github.com/public-apis/public-apis · ${new Date().toISOString().slice(0, 10)} · cəmi ${all.length} API`, "",
    `## Layihədə işlətdiyimiz dəst`, "", "| API | Rol | Giriş | Harada |", "|---|---|---|---|",
    ...STACK.map((s) => `| [${s.name}](${s.url}) | ${s.role} | ${s.auth} | ${s.used} |`), ""];
  for (const [role, list] of [...byRole.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`## ${role} (${list.length})`, "", "| API | Təsvir | Auth |", "|---|---|---|");
    for (const a of list.slice(0, 25)) lines.push(`| [${a.name}](${a.url}) | ${a.description.slice(0, 90)} | ${a.auth} |`);
    lines.push("");
  }
  await fs.mkdir("out", { recursive: true });
  await fs.writeFile("out/free-apis.md", lines.join("\n"), "utf-8");
  console.log(`   ✓ content/free-apis.json, out/free-apis.md`);

  if (check) {
    console.log("\n2. Açarsız API-lər canlı yoxlanır…");
    const probes: [string, string][] = [
      ["Audius", "https://api.audius.co"],
      ["Iconify", "https://api.iconify.design/lucide/truck.svg"],
      ["Imgflip", "https://api.imgflip.com/get_memes"],
      ["Nager.Date (AZ bayramları)", `https://date.nager.at/api/v3/PublicHolidays/${new Date().getFullYear()}/AZ`],
      ["Open-Meteo (Bakı)", "https://api.open-meteo.com/v1/forecast?latitude=40.41&longitude=49.87&daily=precipitation_sum&timezone=Asia%2FBaku"],
      ["Openverse (audio)", "https://api.openverse.org/v1/audio/?q=upbeat&page_size=1"],
      ["ccMixter", "https://ccmixter.org/api/query?f=json&limit=1&tags=instrumental"],
    ];
    for (const [name, url] of probes) {
      const t0 = Date.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "yukaz-agent/1.0" } });
        console.log(`   ${r.ok ? "✓" : "✗"} ${name.padEnd(28)} ${r.status} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (e) {
        console.log(`   ✗ ${name.padEnd(28)} ${(e as Error).message.slice(0, 60)}`);
      }
    }
  }
  console.log();
};

if (/[\\/]apis\.ts$/.test(process.argv[1] ?? "")) main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
