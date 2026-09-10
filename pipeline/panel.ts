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
  status: "təsdiq-gözləyir" | "yayımlanıb" | "imtina";
  createdAt: string;
  instagram?: string;
  facebook?: string;
};

const FPS = 30;

export const buildPanel = async (repo: string) => {
  const dataDir = "content/data";
  const files = (await fs.readdir(dataDir).catch(() => [])).filter((f) => f.endsWith(".meta.json"));
  const status: Record<string, any> = JSON.parse(
    await fs.readFile(path.join(dataDir, "status.json"), "utf-8").catch(() => "{}")
  );

  const entries: Entry[] = [];
  for (const f of files) {
    const meta = JSON.parse(await fs.readFile(path.join(dataDir, f), "utf-8"));
    const propsPath = path.join("public", "render", meta.id, "props.json");
    const props = JSON.parse(await fs.readFile(propsPath, "utf-8").catch(() => "null"));
    if (!props) continue;

    const st = status[meta.id] ?? {};
    entries.push({
      id: meta.id,
      hook: props.hook,
      caption: meta.caption,
      hashtags: meta.hashtags,
      source: meta.link,
      video: `https://github.com/${repo}/releases/download/reel-${meta.id}/${meta.id}.mp4`,
      duration: +(props.scenes.reduce((a: number, b: any) => a + b.durationInFrames, 0) / FPS).toFixed(1),
      scenes: props.scenes.length,
      status: st.status ?? "təsdiq-gözləyir",
      createdAt: meta.id.slice(0, 10),
      instagram: st.instagram,
      facebook: st.facebook,
    });
  }

  entries.sort((a, b) => (a.id < b.id ? 1 : -1));
  await fs.mkdir("docs", { recursive: true });
  await fs.writeFile(
    "docs/data.json",
    JSON.stringify({ repo, updatedAt: new Date().toISOString(), entries }, null, 2),
    "utf-8"
  );
  return entries.length;
};

if (process.argv[1]?.endsWith("panel.ts")) {
  const repo = process.argv[3] ?? process.env.GITHUB_REPOSITORY ?? "166company/motion-design";
  const n = await buildPanel(repo);
  console.log(`panel yeniləndi: ${n} video`);
}
