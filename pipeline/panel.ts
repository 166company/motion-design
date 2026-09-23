/** docs/data.json yaradır — statik panelin yeganə məlumat mənbəyi. */
import fs from "node:fs/promises";
import path from "node:path";

type Entry = {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  source: string;
  video: string;
  duration: number;
  scenes: number;
  status: "təsdiq-gözləyir" | "yayımlanıb" | "imtina" | "silinib";
  note?: string;
  template: string;
  kind?: string;         // Poster: fun | sales
  inspiration?: { url: string; quote: string };  // fun post: uyğunlaşdırılan real nümunə
  strategy?: { goal: string; angle: string } | null;   // going-viral: məqsəd + bucaq
  hookAlternatives?: string[];                          // A/B hook-lar
  firstComment?: string;                                // ilk şərh (sual + hashtag-lər)
  metrics?: { views: number; reach: number; saved: number; shares: number; likes: number; comments: number } | null;
  /** karusel üçün slayd şəkilləri */
  images?: string[];
  voice?: string | null;
  createdAt: string;     // YYYY-MM-DD — panel tarix filtri bununla işləyir
  createdIso?: string;   // dəqiq vaxt (meta.createdAt varsa)
  instagram?: string;
  facebook?: string;
  music: { label: string; license: string | null; vocal: boolean | null; source: "audius" | "local" | "synth" };
};

const FPS = 30;

export const buildPanel = async (repo: string) => {
  const dataDir = "content/data";
  const files = (await fs.readdir(dataDir).catch(() => [])).filter((f) => f.endsWith(".meta.json"));
  const status: Record<string, any> = JSON.parse(
    await fs.readFile(path.join(dataDir, "status.json"), "utf-8").catch(() => "{}")
  );

  // Whisper vokal yoxlamasının nəticələri (screen_music.py)
  const screen: Record<string, { vocal: boolean | null; title?: string }> = JSON.parse(
    await fs.readFile(path.join(dataDir, "music-screen.json"), "utf-8").catch(() => "{}")
  );

  const analytics: Record<string, any> = JSON.parse(await fs.readFile("content/analytics.json", "utf-8").catch(() => "{}"));

  const musicOf = (meta: any): Entry["music"] => {
    if (meta.musicTrack || meta.attribution) {
      const t = meta.musicTrack;
      const label = t ? `${t.title} — ${t.artist}` : String(meta.attribution).replace(/^🎵\s*/, "").replace(/\s*\(.*$/, "");
      const license = t?.license ?? (String(meta.attribution).match(/\(([^)]+)\)/)?.[1] ?? null);
      // ID ilə, olmasa adla tap
      const hit = t ? screen[t.id] : Object.values(screen).find((v) => v.title && label.startsWith(v.title));
      return { label, license, vocal: hit?.vocal ?? null, source: "audius" };
    }
    if (meta.music && String(meta.music).startsWith("music/")) {
      return { label: String(meta.music).replace(/^music\//, ""), license: null, vocal: null, source: "local" };
    }
    return { label: "Orijinal sintez", license: null, vocal: false, source: "synth" };
  };

  const entries: Entry[] = [];
  for (const f of files) {
    const meta = JSON.parse(await fs.readFile(path.join(dataDir, f), "utf-8"));
    const propsPath = path.join("public", "render", meta.id, "props.json");
    const props = JSON.parse(await fs.readFile(propsPath, "utf-8").catch(() => "null"));
    if (!props) continue;

    const st = status[meta.id] ?? {};
    if (st.status === "silinib") continue;   // paneldən silinib
    const relBase = `https://github.com/${repo}/releases/download/reel-${meta.id}`;
    entries.push({
      id: meta.id,
      images: (meta.template === "Carousel" || meta.template === "Poster") ? Array.from({ length: meta.slides ?? 3 }, (_, i) => `${relBase}/${meta.id}-${i + 1}.png`) : undefined,
      hook: props.hook ?? props.scenes?.[0]?.heading ?? (props.lines ? `${props.lines.join(" ").replace(/\n/g, " ")} → ${props.punch}` : props.headline ? `${props.kicker ? props.kicker + " — " : ""}${props.headline.replace(/\n/g, " ")}` : meta.id),
      caption: meta.caption,
      hashtags: meta.hashtags,
      source: meta.link,
      video: `https://github.com/${repo}/releases/download/reel-${meta.id}/${meta.id}.mp4`,
      duration: props.scenes ? +(props.scenes.reduce((a: number, b: any) => a + b.durationInFrames, 0) / FPS).toFixed(1) : 0,
      scenes: props.scenes ? props.scenes.length : (meta.slides ?? 3),
      status: st.status ?? "təsdiq-gözləyir",
      kind: meta.kind ?? undefined,
      inspiration: meta.inspiration ?? undefined,
      strategy: meta.strategy ? { goal: meta.strategy.goal, angle: meta.strategy.angle } : null,
      hookAlternatives: meta.hookAlternatives ?? undefined,
      firstComment: meta.firstComment ?? undefined,
      metrics: analytics[meta.id] ? { views: analytics[meta.id].views, reach: analytics[meta.id].reach, saved: analytics[meta.id].saved, shares: analytics[meta.id].shares, likes: analytics[meta.id].likes, comments: analytics[meta.id].comments } : null,
      createdAt: (meta.createdAt ?? meta.id).slice(0, 10),
      createdIso: meta.createdAt ?? undefined,
      instagram: st.instagram,
      facebook: st.facebook,
      note: st.note,
      template: meta.template ?? "TipList",
      voice: meta.voice ?? null,
      music: musicOf(meta),
    });
  }

  // TARİX SIRALAMASI: ən yenisi yuxarıda (eyni gündə id-yə görə)
  entries.sort((a, b) => (b.createdIso ?? b.createdAt).localeCompare(a.createdIso ?? a.createdAt) || (a.id < b.id ? 1 : -1));
  // kontent təqvimi (növbəti 10 gün) + yaddaş — panelin yuxarısında
  const cal = JSON.parse(await fs.readFile("content/calendar.json", "utf-8").catch(() => "null"));
  const today = new Date().toISOString().slice(0, 10);
  const plan = cal ? { pillars: cal.pillars, series: cal.series, slots: cal.slots.filter((s: any) => s.date >= today).slice(0, 14) } : null;
  const brain = await fs.readFile("content/brain.md", "utf-8").catch(() => "");
  const leads = Object.values(JSON.parse(await fs.readFile("content/data/comments.json", "utf-8").catch(() => "{}")) as any[]).filter((c) => c.lead).length;
  await fs.mkdir("docs", { recursive: true });
  await fs.writeFile(
    "docs/data.json",
    JSON.stringify({ repo, updatedAt: new Date().toISOString(), plan, brain, leads, entries }, null, 2),
    "utf-8"
  );
  return entries.length;
};

if (process.argv[1]?.endsWith("panel.ts")) {
  const repo = process.argv[3] ?? process.env.GITHUB_REPOSITORY ?? "166company/motion-design";
  const n = await buildPanel(repo);
  console.log(`panel yeniləndi: ${n} video`);
}
