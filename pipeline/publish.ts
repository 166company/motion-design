/**
 * Meta Graph API ilə yayım: Instagram Reels + Facebook Reels.
 * Video ictimai HTTPS linkdən götürülür (GitHub Release).
 */
import "dotenv/config";

const V = process.env.META_GRAPH_VERSION ?? "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN!;
const IG = process.env.META_IG_USER_ID!;
const PAGE = process.env.META_PAGE_ID!;

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(`https://graph.facebook.com/${V}/${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as any;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Səhifə əməliyyatları üçün ayrıca Page token lazımdır */
const pageToken = async () => {
  const d = await api(`${PAGE}?fields=access_token&access_token=${TOKEN}`);
  return d.access_token as string;
};

export const publishInstagram = async (videoUrl: string, caption: string) => {
  const create = await api(
    `${IG}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}` +
      `&caption=${encodeURIComponent(caption)}&share_to_feed=true&access_token=${TOKEN}`,
    { method: "POST" }
  );
  const id = create.id as string;

  // Instagram videonu özü yükləyib emal edir — hazır olana qədər gözləyirik
  for (let i = 0; i < 40; i++) {
    await sleep(6000);
    const st = await api(`${id}?fields=status_code,status&access_token=${TOKEN}`);
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR") throw new Error(`IG emal xətası: ${st.status}`);
    if (i === 39) throw new Error("IG emalı 4 dəqiqədə bitmədi");
  }

  const pub = await api(`${IG}/media_publish?creation_id=${id}&access_token=${TOKEN}`, {
    method: "POST",
  });
  const link = await api(`${pub.id}?fields=permalink&access_token=${TOKEN}`);
  return { id: pub.id as string, permalink: link.permalink as string };
};

export const publishFacebook = async (videoUrl: string, description: string) => {
  const pt = await pageToken();

  const start = await api(`${PAGE}/video_reels?upload_phase=start&access_token=${pt}`, {
    method: "POST",
  });
  const videoId = start.video_id as string;

  const up = await fetch(`https://rupload.facebook.com/video-upload/${V}/${videoId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${pt}`, file_url: videoUrl },
  });
  if (!up.ok) throw new Error(`FB upload: ${(await up.text()).slice(0, 300)}`);

  await api(
    `${PAGE}/video_reels?upload_phase=finish&video_id=${videoId}` +
      `&video_state=PUBLISHED&description=${encodeURIComponent(description)}&access_token=${pt}`,
    { method: "POST" }
  );
  return { id: videoId, permalink: `https://www.facebook.com/reel/${videoId}` };
};

if (process.argv[1]?.endsWith("publish.ts")) {
  const [, , videoUrl, metaPath] = process.argv;
  const meta = JSON.parse(await (await import("node:fs/promises")).readFile(metaPath, "utf-8"));
  const caption = `${meta.caption}\n\n${meta.hashtags.join(" ")}`;

  console.log("Instagram…");
  const ig = await publishInstagram(videoUrl, caption);
  console.log("  ✓", ig.permalink);

  console.log("Facebook…");
  const fb = await publishFacebook(videoUrl, caption);
  console.log("  ✓", fb.permalink);
}
