/**
 * Analitika + yaddaş — Ootto "analytics-readout" + "hook-mining" + "content-audit" + "ai-brain" metodologiyası.
 *   1) Instagram Graph API: yayımlanmış hər post üçün views / reach / saved / shares / likes / comments → content/analytics.json
 *   2) gpt-5.5: sadə dillə həftəlik oxunuş (nə işlədi, nə yox, növbəti həftə nə etməli) → out/readout.md (Issue-ya gedir)
 *   3) ai-brain: qaliblərin hook-ları və nümunələri → content/brain.md (bütün pipeline promptlarına "YADDAŞ" kimi qoşulur)
 *
 *   npx tsx pipeline/analytics.ts            → hamısı
 *   npx tsx pipeline/analytics.ts fetch      → yalnız rəqəmlər
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { playbook } from "./skills.ts";
import { chat } from "./llm.ts";

const V = "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN!;
const IG = process.env.META_IG_USER_ID!;
const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";

export type Metrics = { views: number; reach: number; saved: number; shares: number; likes: number; comments: number; permalink: string; mediaId: string; fetchedAt: string };

const api = async (path: string) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${path}${path.includes("?") ? "&" : "?"}access_token=${TOKEN}`);
  const j = (await r.json()) as any;
  if (j.error) throw new Error(j.error.message);
  return j;
};

/** Yayımlanmış postların rəqəmləri — status.json-dakı Instagram linki ilə media uyğunlaşdırılır */
export const fetchMetrics = async (): Promise<Record<string, Metrics>> => {
  const status: Record<string, any> = JSON.parse(await fs.readFile("content/data/status.json", "utf-8").catch(() => "{}"));
  const media: any[] = [];
  let next = `${IG}/media?fields=id,permalink,media_type,timestamp,like_count,comments_count&limit=50`;
  for (let i = 0; i < 4 && next; i++) {
    const j = await api(next);
    media.push(...j.data);
    next = j.paging?.next ? j.paging.next.replace(`https://graph.facebook.com/${V}/`, "").replace(/([?&])access_token=[^&]*/, "$1") : "";
  }
  const byLink = new Map(media.map((m) => [m.permalink.replace(/\/$/, ""), m]));
  const out: Record<string, Metrics> = JSON.parse(await fs.readFile("content/analytics.json", "utf-8").catch(() => "{}"));
  for (const [id, st] of Object.entries(status)) {
    if (st.status !== "yayımlanıb" || !st.instagram) continue;
    const m = byLink.get(String(st.instagram).replace(/\/$/, ""));
    if (!m) continue;
    const metricList = m.media_type === "VIDEO" ? "views,reach,saved,shares,likes,comments" : "views,reach,saved,shares,likes,comments";
    try {
      const ins = await api(`${m.id}/insights?metric=${metricList}`);
      const g = (n: string) => Number(ins.data.find((d: any) => d.name === n)?.values?.[0]?.value ?? 0);
      out[id] = { views: g("views"), reach: g("reach"), saved: g("saved"), shares: g("shares"), likes: g("likes") || m.like_count, comments: g("comments") || m.comments_count, permalink: m.permalink, mediaId: m.id, fetchedAt: new Date().toISOString() };
    } catch (e: any) {
      out[id] = { views: 0, reach: 0, saved: 0, shares: 0, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, permalink: m.permalink, mediaId: m.id, fetchedAt: new Date().toISOString() };
      console.log(`  ⚠ ${id}: insights alınmadı (${e.message.slice(0, 60)})`);
    }
  }
  await fs.writeFile("content/analytics.json", JSON.stringify(out, null, 2), "utf-8");
  console.log(`  ✓ ${Object.keys(out).length} post üçün rəqəmlər`);
  return out;
};

/** Post cədvəli (model üçün) */
const table = async (metrics: Record<string, Metrics>) => {
  const rows: string[] = [];
  for (const [id, m] of Object.entries(metrics)) {
    const meta = JSON.parse(await fs.readFile(`content/data/${id}.meta.json`, "utf-8").catch(() => "null"));
    const props = JSON.parse(await fs.readFile(`public/render/${id}/props.json`, "utf-8").catch(() => "null"));
    const hook = props?.hook ?? props?.headline ?? props?.lines?.join(" ") ?? props?.scenes?.[0]?.heading ?? id;
    rows.push(`| ${id} | ${meta?.template ?? "?"}${meta?.kind ? "/" + meta.kind : ""} | ${meta?.strategy?.goal ?? "-"} / ${meta?.strategy?.angle ?? "-"} | "${String(hook).replace(/\n/g, " ")}" | ${m.views} | ${m.reach} | ${m.saved} | ${m.shares} | ${m.likes} | ${m.comments} |`);
  }
  return `| ID | şablon | məqsəd / bucaq | hook | baxış | əhatə | saxlama | paylaşım | bəyənmə | şərh |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`;
};

const readoutSchema = {
  type: "object", additionalProperties: false, required: ["readout", "brain"],
  properties: {
    readout: { type: "string", description: "Azərbaycanca, markdown, 200-350 söz: nə işlədi (ən yaxşı 3 post və NİYƏ), nə işləmədi, gələn həftə üçün 3 konkret addım (analytics-readout + content-audit üsulu). Rəqəmlər kiçikdirsə bunu dürüst de." },
    brain: { type: "string", description: "ai-brain yaddaşı, markdown, maks 1500 simvol: '## Qaliblər' (ən yaxşı hook-lar sitatla + hansı psixoloji nümunə: hook-mining bucketləri), '## İşləməyənlər', '## Qaydalar' (5-7 qısa öyrənilmiş qayda). Növbəti postları yazan modelə birbaşa veriləcək." },
  },
} as const;

export const readout = async (metrics: Record<string, Metrics>) => {
  const t = await table(metrics);
  const prev = await fs.readFile("content/brain.md", "utf-8").catch(() => "");
  const __r = await chat<any>({ task: "smart", name: "readout", model: MODEL, schema: readoutSchema, messages: [
        { role: "system", content: "Sən Yük.az (ev/ofis köçü, Bakı) Instagram səhifəsinin analitikisən. Sadə, dürüst, azərbaycanca." + playbook(["analytics-readout", "hook-mining", "content-audit", "ai-brain"], 9000) },
        { role: "user", content: `POSTLAR VƏ RƏQƏMLƏR (Instagram, ömürlük):\n${t}\n\nƏVVƏLKİ YADDAŞ:\n${prev || "(boş)"}\n\nHəftəlik oxunuş və yenilənmiş yaddaş yaz.` },
      ] });
  const r = (__r.data) as { readout: string; brain: string };
  await fs.mkdir("out", { recursive: true });
  await fs.writeFile("out/readout.md", `${r.readout}\n\n---\n\n${t}\n`, "utf-8");
  await fs.writeFile("content/brain.md", r.brain.trim() + "\n", "utf-8");
  console.log("  ✓ out/readout.md, content/brain.md");
  return r;
};

if (/[\\/]analytics\.ts$/.test(process.argv[1] ?? "")) {
  const mode = process.argv[2] ?? "all";
  const m = await fetchMetrics();
  if (mode === "all" && Object.keys(m).length) await readout(m);
}
