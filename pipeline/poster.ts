/**
 * "Poster" şablonu — gündəlik statik satış postları (1080×1350), default 3 ədəd.
 * Səhnə: AI foto, brend loqosu istinad şəkil kimi verilir (formada, maşında, telefon ekranında dəqiq çıxır).
 * Tipoqrafiya, loqo və nömrə kodla üstündən qoyulur (Poster.tsx).
 *
 *   npx tsx pipeline/poster.ts            → 3 post (ID: <tarix>-poster-1..3), out/new-ids.txt
 *   POSTER_COUNT=1                        → tək post
 */
import "dotenv/config";
import "./plan.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { contact } from "../src/brand/contact.ts";
import { listArticles } from "./wp.ts";

const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";
const IMG_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-sunburst-2026-09-08";
const COUNT = Number(process.env.POSTER_COUNT ?? 3);
const log = (m: string) => console.log(`  ${m}`);

/** Loqolu səhnə növləri — model bunlardan seçir və detallandırır */
const SCENES: Record<string, string> = {
  workers:  "Two friendly professional movers in bright orange t-shirts and dark graphite pants carrying a large cardboard box out of a modern Baku apartment entrance; the logo printed on the chest of the t-shirts.",
  truck:    "A modern box truck on a sunny Baku street, cargo box dark graphite with the logo printed large on its side, cab bright orange, movers loading furniture; Flame Towers softly in the background.",
  phone:    "Close-up of a hand holding a smartphone in a bright living room with packed boxes; the phone screen shows an incoming-call UI with a large orange call button and the logo at the top of the screen, no digits.",
  loading:  "Movers in orange t-shirts with the logo on the chest loading wrapped furniture into a graphite truck with the logo on its side, apartment building behind, golden hour.",
  interior: "A cozy apartment living room fully packed for moving: labeled cardboard boxes, wrapped sofa, an orange yük.az branded box tape roll on top, morning light, no people.",
  family:   "A happy young family with a child standing in a bright new empty apartment holding a cardboard box; a mover in an orange t-shirt with the logo on the chest smiles in the background.",
};
const VARIANTS = ["hero", "split", "card"] as const;

type Concept = { scene: keyof typeof SCENES; sceneDetail: string; headline: string; caption: string; hashtags: string[] };

const schema = {
  type: "object", additionalProperties: false, required: ["posts"],
  properties: {
    posts: {
      type: "array", minItems: COUNT, maxItems: COUNT,
      items: {
        type: "object", additionalProperties: false,
        required: ["scene", "sceneDetail", "headline", "caption", "hashtags"],
        properties: {
          scene: { type: "string", enum: Object.keys(SCENES) },
          sceneDetail: { type: "string", description: "İNGİLİSCƏ: səhnəyə əlavə 1 cümlə detal (vaxt, işıq, əhval), loqonu təkrar etmə" },
          headline: { type: "string", description: "Postdakı YEGANƏ yazı: 2-4 söz, 1-2 sətir \\n ilə, hər sətir maks 12 hərf; zərbəli satış mesajı; sonuncu söz vurğu (rəngli) olacaq" },
          caption: { type: "string", description: "Instagram caption: emoji hook + boş sətir + 2 qısa emojili abzas. Nömrə YAZMA (sistem əlavə edir). Rəqəm/qiymət YOX" },
          hashtags: { type: "array", minItems: 4, maxItems: 7, items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM = `Sən Yük.az (Azərbaycanda yükdaşıma və ev daşınması) üçün statik Instagram satış postlarının kopirayterisən.
Hər gün ${COUNT} fərqli post: hər biri FƏRQLİ səhnə (workers/truck/phone/loading/interior/family — təkrar etmə) və fərqli satış bucağı:
sürət ("bu gün"), sığorta/təhlükəsizlik, qablaşdırma daxil, bir zəng/rahatlıq, Bakı + rayonlar, ofis köçü, ağır əşya (piano, seyf).
QAYDALAR: postda AZ YAZI — yalnız 2-4 sözlük başlıq, izahat cümləsi yox (nömrə və düymə sistem tərəfindən qoyulur); sadə, inandırıcı azərbaycan dili, "sən"; KONKRET QİYMƏT/RƏQƏM YOX; "Yük.az" yaz.
Faktlar yalnız verilən məqalələrdən (sığorta daxildir, qiyməti operator telefonda deyir, qablaşdırma materialı daxildir).`;

const writeConcepts = async (facts: string, feedback?: string): Promise<Concept[]> => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `MƏQALƏ FAKTLARI:\n${facts}\n\nBu gün üçün ${COUNT} post yaz.${feedback ? `\n\nİSTİFADƏÇİ QEYDİ, MÜTLƏQ nəzərə al:\n${feedback}` : ""}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "posters", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (JSON.parse(((await res.json()) as any).choices[0].message.content) as { posts: Concept[] }).posts;
};

/** Loqolu səhnə — /images/edits, loqo PNG istinad kimi */
const genScene = async (desc: string, dest: string) => {
  const style =
    "Photorealistic commercial advertising photo, vertical 4:5, editorial lighting, sharp, premium. Brand colors: bright orange #FF6600 and dark graphite #1E2124. " +
    "The attached image is the brand logo 'yük.az' — reproduce it EXACTLY and legibly where indicated (same shapes, colors, proportions). No other text anywhere. " +
    "Keep the lower third relatively clean and slightly darker for typography." +
    (process.env.VISUAL_NOTES ? ` Style guidance: ${process.env.VISUAL_NOTES}.` : "");
  const logo = await fs.readFile("public/logo/logo-ref.png");
  const form = new FormData();
  form.append("model", IMG_MODEL);
  form.append("prompt", `${desc} ${style}`);
  form.append("size", "1024x1536");
  form.append("quality", "high");
  form.append("image[]", new Blob([logo], { type: "image/png" }), "logo.png");
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!res.ok) throw new Error(`Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const b64 = ((await res.json()) as any).data[0].b64_json as string;
  await fs.writeFile(dest, Buffer.from(b64, "base64"));
};

const main = async () => {
  const feedback = process.env.FEEDBACK?.trim() || undefined;
  console.log("\n1. Faktlar…");
  const az = (await listArticles()).filter((a) => a.lang === "az");
  const facts = az.slice(0, 3).map((a) => `• ${a.title}: ${a.text.slice(0, 700)}`).join("\n");

  console.log(`2. ${COUNT} konsept (${MODEL})…`);
  const posts = await writeConcepts(facts, feedback);
  const date = new Date().toISOString().slice(0, 10);
  const ids: string[] = [];

  for (let i = 0; i < posts.length; i++) {
    const c = posts[i];
    const id = process.env.REEL_ID && posts.length === 1 ? process.env.REEL_ID : `${date}-poster-${i + 1}`;
    const variant = VARIANTS[i % VARIANTS.length];
    const dir = path.join("public", "render", id);
    await fs.mkdir(dir, { recursive: true });
    log(`${id}: [${c.scene}/${variant}] ${c.headline.replace(/\n/g, " ")}`);

    console.log(`3. Səhnə ${i + 1}/${posts.length} (AI, loqo istinadla)…`);
    await genScene(`${SCENES[c.scene]} ${c.sceneDetail}`, path.join(dir, "photo.jpg"));

    // başlıq maks 4 söz — model çox yazsa qısaldırıq
    const words = c.headline.split(/\s+/).filter(Boolean);
    const headline = words.length <= 4 && c.headline.includes("\n")
      ? c.headline.trim()
      : words.length <= 2 ? words.join(" ") : `${words.slice(0, 2).join(" ")}\n${words.slice(2, 4).join(" ")}`;
    const props = { id, photo: `render/${id}/photo.jpg`, headline, cta: "Zəng et", variant };
    await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
    const caption = c.caption.includes(contact.phone) ? c.caption : `${c.caption.trim()}\n\n📞 Zəng et: ${contact.phone}`;
    await fs.writeFile(
      path.join("content", "data", `${id}.meta.json`),
      JSON.stringify({ id, template: "Poster", articleId: null, link: "https://yuk.az", caption, hashtags: c.hashtags, slides: 1,
        scene: c.scene, variant, music: null, attribution: null, musicTrack: null, voice: null, silent: true }, null, 2),
      "utf-8"
    );
    ids.push(id);
  }
  await fs.mkdir("out", { recursive: true });
  await fs.writeFile("out/new-ids.txt", ids.join("\n") + "\n", "utf-8");
  console.log(`\n✓ Hazırdır: ${ids.join(", ")}\n`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
