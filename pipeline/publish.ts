/**
 * Meta Graph API ilə yayım: Instagram Reels + Facebook Reels.
 * Video ictimai HTTPS linkdən götürülür (GitHub Release).
 */
import "dotenv/config";

const V = process.env.META_GRAPH_VERSION ?? "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN!;
const IG = process.env.META_IG_USER_ID!;
const PAGE = process.env.META_PAGE_ID!;

/** Şəbəkə xətalarında (ETIMEDOUT, ENETUNREACH, 5xx) 4 cəhd, artan gözləmə */
const fetchRetry = async (url: string, init?: RequestInit, tries = 4): Promise<Response> => {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status < 500) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    const wait = 3000 * (i + 1);
    console.log(`  şəbəkə xətası (${(last?.cause?.code ?? last?.message ?? "?").toString().slice(0, 40)}), ${wait / 1000}s sonra təkrar…`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw last;
};

const api = async (path: string, init?: RequestInit) => {
  const res = await fetchRetry(`https://graph.facebook.com/${V}/${path}`, init);
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

  const up = await fetchRetry(`https://rupload.facebook.com/video-upload/${V}/${videoId}`, {
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

/** Instagram karuseli: hər şəkil ayrıca container → CAROUSEL container → publish */
export const publishInstagramCarousel = async (imageUrls: string[], caption: string) => {
  const children: string[] = [];
  for (const url of imageUrls) {
    const c = await api(`${IG}/media?image_url=${encodeURIComponent(url)}&is_carousel_item=true&access_token=${TOKEN}`, { method: "POST" });
    children.push(c.id);
  }
  const car = await api(
    `${IG}/media?media_type=CAROUSEL&children=${children.join(",")}&caption=${encodeURIComponent(caption)}&access_token=${TOKEN}`,
    { method: "POST" }
  );
  for (let i = 0; i < 20; i++) {
    const st = await api(`${car.id}?fields=status_code,status&access_token=${TOKEN}`);
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR") throw new Error(`IG karusel xətası: ${st.status}`);
    await sleep(4000);
  }
  const pub = await api(`${IG}/media_publish?creation_id=${car.id}&access_token=${TOKEN}`, { method: "POST" });
  const link = await api(`${pub.id}?fields=permalink&access_token=${TOKEN}`);
  return { id: pub.id as string, permalink: link.permalink as string };
};

/** Facebook: şəkilləri published=false yüklə, sonra bir postda birləşdir */
export const publishFacebookPhotos = async (imageUrls: string[], message: string) => {
  const pt = await pageToken();
  const ids: string[] = [];
  for (const url of imageUrls) {
    const ph = await api(`${PAGE}/photos?url=${encodeURIComponent(url)}&published=false&access_token=${pt}`, { method: "POST" });
    ids.push(ph.id);
  }
  const attached = ids.map((id, i) => `attached_media[${i}]=${encodeURIComponent(JSON.stringify({ media_fbid: id }))}`).join("&");
  const post = await api(`${PAGE}/feed?message=${encodeURIComponent(message)}&${attached}&access_token=${pt}`, { method: "POST" });
  const [pg, pid] = String(post.id).split("_");
  return { id: post.id as string, permalink: pid ? `https://www.facebook.com/${pg}/posts/${pid}` : `https://www.facebook.com/${post.id}` };
};

/** Musiqi krediti (CC BY) — caption əvəzinə ilk şərh. Uğursuz olsa yayımı pozmur. */
const creditComment = async (igMediaId: string | null, fbObjectId: string | null, attribution: string | null) => {
  if (!attribution) return;
  const text = attribution.replace(/^🎵\s*/, "🎵 Musiqi: ");
  if (igMediaId) {
    await api(`${igMediaId}/comments?message=${encodeURIComponent(text)}&access_token=${TOKEN}`, { method: "POST" })
      .then(() => console.log("  ✓ IG kredit şərhi")).catch((e) => console.log("  ⚠ IG şərh:", e.message.slice(0, 80)));
  }
  if (fbObjectId) {
    const pt = await pageToken();
    await api(`${fbObjectId}/comments?message=${encodeURIComponent(text)}&access_token=${pt}`, { method: "POST" })
      .then(() => console.log("  ✓ FB kredit şərhi")).catch((e) => console.log("  ⚠ FB şərh:", e.message.slice(0, 80)));
  }
};

if (process.argv[1]?.endsWith("publish.ts")) {
  const [, , videoUrl, metaPath] = process.argv;
  const meta = JSON.parse(await (await import("node:fs/promises")).readFile(metaPath, "utf-8"));
  const caption = `${meta.caption}\n\n${meta.hashtags.join(" ")}`;

  if (meta.template === "Carousel") {
    // videoUrl = .../reel-<id>/<id>.mp4 → şəkillər eyni qovluqda <id>-1.png, -2, -3
    const base = videoUrl.replace(/[^/]+$/, "");
    const urls = Array.from({ length: meta.slides ?? 3 }, (_, i) => `${base}${meta.id}-${i + 1}.png`);
    console.log("Instagram (karusel)…");
    const ig = await publishInstagramCarousel(urls, caption);
    console.log("  ✓", ig.permalink);
    console.log("Facebook (foto post)…");
    const fb = await publishFacebookPhotos(urls, caption);
    console.log("  ✓", fb.permalink);
  } else {
    console.log("Instagram…");
    const ig = await publishInstagram(videoUrl, caption);
    console.log("  ✓", ig.permalink);
    console.log("Facebook…");
    const fb = await publishFacebook(videoUrl, caption);
    console.log("  ✓", fb.permalink);
    await creditComment(ig.id, fb.id, meta.attribution ?? null);
  }
}
process.on("unhandledRejection", (e: any) => {
  console.error("YAYIM XƏTASI:", e?.message ?? e);
  process.exit(1);
});
