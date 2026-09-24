/**
 * "Poster" şablonu — gündəlik statik postlar (1080×1350), default 3 ədəd: 2 FUN + 1 satış.
 *   fun   → webdən tapılan REAL viral nümunə (dəqiq sitat + URL) və ya real meme şablonu yük.az-a uyğunlaşdırılır (trends.ts); uydurma yumor yox
 *   sales → yuk.az faktlarına əsaslanan satış mesajı
 * Səhnə: AI foto, brend loqosu istinad şəkil kimi verilir. Yazı minimal: qısa "kicker" + 2-4 sözlük punchline + Zəng et.
 *
 *   npx tsx pipeline/poster.ts            → 3 post (ID: <tarix>-poster-1..3), out/new-ids.txt
 *   POSTER_COUNT=1  POSTER_MIX=fun        → tək fun post (mix: vergüllə fun/sales ardıcıllığı)
 */
import "dotenv/config";
import "./plan.ts";
import { playbook, planFor, memory, postCount } from "./skills.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { contact } from "../src/brand/contact.ts";
import { listArticles } from "./wp.ts";
import { getTrends, type Trends } from "./trends.ts";
import { nvImageToFile, withNvidia } from "./nvidia.ts";
import { chat, type ChatOpts } from "./llm.ts";
import { novelty, remember, type Novelty } from "./ideas.ts";
import { assertPhotos } from "./photos.ts";

const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";
const IMG_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-sunburst-2026-09-08";
const COUNT = Number(process.env.POSTER_COUNT ?? 3);
const MIX = (process.env.POSTER_MIX ?? "fun,fun,sales").split(",").map((s) => s.trim());
const log = (m: string) => console.log(`  ${m}`);

/** Satış səhnələri — model bunlardan seçir və detallandırır; fun postda "custom" (tam təsvir modeldən) */
const SCENES: Record<string, string> = {
  workers:  "Two friendly professional movers in bright orange t-shirts and dark graphite pants carrying a large cardboard box out of a modern Baku apartment entrance; the logo printed on the chest of the t-shirts.",
  truck:    "A modern box truck on a sunny Baku street, cargo box dark graphite with the logo printed large on its side, cab bright orange, movers loading furniture; Flame Towers softly in the background.",
  phone:    "Close-up of a hand holding a smartphone in a bright living room with packed boxes; the phone screen shows an incoming-call UI with a large orange call button and the logo at the top of the screen, no digits.",
  loading:  "Movers in orange t-shirts with the logo on the chest loading wrapped furniture into a graphite truck with the logo on its side, apartment building behind, golden hour.",
  interior: "A cozy apartment living room fully packed for moving: labeled cardboard boxes, wrapped sofa, an orange branded box tape roll with the logo on top, morning light, no people.",
  family:   "A happy young family with a child standing in a bright new empty apartment holding a cardboard box; a mover in an orange t-shirt with the logo on the chest smiles in the background.",
  custom:   "",
};
const VARIANTS = ["hero", "split", "card"] as const;

type Concept = {
  kind: "fun" | "sales"; format: string; sourceUrl: string; sourceQuote: string; scene: keyof typeof SCENES; sceneDetail: string;
  kicker: string; headline: string; caption: string; hashtags: string[];
};

const schema = {
  type: "object", additionalProperties: false, required: ["posts"],
  properties: {
    posts: {
      type: "array", minItems: COUNT, maxItems: COUNT,
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "format", "sourceUrl", "sourceQuote", "scene", "sceneDetail", "kicker", "headline", "caption", "hashtags"],
        properties: {
          kind: { type: "string", enum: ["fun", "sales"] },
          format: { type: "string", description: "fun: mənbənin qısa adı, məs. 'The Poke tweet: clean house' və ya 'Onedio tweet'; sales: boş" },
          sourceUrl: { type: "string", description: "fun: siyahıdakı real nümunənin URL-i VERBATIM (şablon üçün şablonun şəkil URL-i); sales: boş" },
          sourceQuote: { type: "string", description: "fun: real nümunənin orijinal mətni VERBATIM (şablon üçün şablonun adı); sales: boş" },
          scene: { type: "string", enum: Object.keys(SCENES), description: "sales: hazır səhnələrdən biri; fun: custom" },
          sceneDetail: { type: "string", description: "İNGİLİSCƏ. fun: meme formatını yük.az elementləri ilə (narıncı formalı işçilər, loqolu qrafit maşın, kartonlar, telefon) yenidən canlandıran TAM foto təsviri, 2-3 cümlə, komik situasiya aydın görünsün, real insanlar/ifadələr; sales: səhnəyə 1 cümlə detal. Şəkildə heç bir yazı olmasın." },
          kicker: { type: "string", description: "Setup — real zarafatın uyğunlaşdırılmış hissəsi, maks 12 söz, azərbaycanca, təbii danışıq dili; sales üçün boş ola bilər" },
          headline: { type: "string", description: "Böyük punchline: 2-4 söz, 1-2 sətir \\n ilə, hər sətir maks 12 hərf; sonuncu söz vurğulanacaq" },
          caption: { type: "string", description: "Instagram caption: fun — zarafatı davam etdirən 1-2 emojili abzas, dostcasına; sales — emoji hook + 1-2 qısa abzas. Nömrə YAZMA (sistem əlavə edir). Rəqəm/qiymət YOX" },
          hashtags: { type: "array", minItems: 4, maxItems: 7, items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM = `Sən Yük.az (Azərbaycanda ev/ofis köçü və yükdaşıma) Instagram səhifəsinin kreativ redaktorusan. Səhifə ÇOX FUN olmalıdır.
Hədəf: yük sahibləri — köç edən ailələr, ofislər, ağır əşya daşıtdıranlar. Onların gündəlik dərdləri: köç stresi, sığmayan divan, "dostları çağırım?" dilemması, qonşular, lift, Bakı tıxacı, "bir zənglə həll".
FUN post: YALNIZ verilən REAL viral nümunələrdən (bu həftənin real tweet/meme mətnləri, dəqiq sitat + URL) birini götür — öz yumorunu UYDURMA. Meme şablonları yalnız real sitat siyahısı boş olanda.
Uyğunlaşdırma qaydası: orijinalın cümlə quruluşunu və komik mexanizmini (gözlənilməz dönüş, özünə gülmə, "hamımız belə edirik") OLDUĞU KİMİ saxla; yalnız mövzunu köç/yük situasiyasına çevir; kicker = uyğunlaşdırılmış setup (azərbaycanca, təbii, maks 12 söz), headline = 2-4 sözlük punchline (Yük.az həlli və ya köç gerçəyi).
Nümunə: "I regret to inform you that the secret to a clean house is to clean the house" → kicker "Təəssüflə bildirirəm: köçün sirri" / headline "Köçməkdir.\nYa da zəng." Yerli detal əlavə et (Bakı, lift, qonşu, "az qutu var"). Ən gülməli, ən relatable sitatları seç; hər fun post FƏRQLİ sitat; sourceUrl/sourceQuote-u dəyişmədən köçür.
SALES post: yalnız verilən yuk.az faktlarından; zərbəli, sadə.
YAZI MİNİMAL: kicker (maks 7 söz) + punchline (2-4 söz). İzahat cümləsi yox. Konkret qiymət/rəqəm yox. "Yük.az" yaz. Digər brend adları yox.`;

/** Sorğu qurucusu — eyni prompt/sxem compare.ts-də də istifadə olunur (təkrarlanmasın deyə ayrıca export) */
export const posterRequest = (facts: string, trends: Trends, feedback: string | undefined, nv: Novelty): ChatOpts => {
  const mix = MIX.slice(0, COUNT); while (mix.length < COUNT) mix.push("fun");
  const exText = trends.examples.length
    ? trends.examples.map((e, i) => `${i + 1}. [${e.platform}] "${e.quote}" — ${e.context} (${e.whyFunny})\n   URL: ${e.url}`).join("\n")
    : "(bu gün web nümunəsi tapılmadı — yalnız aşağıdakı real meme şablonlarından istifadə et)";
  // real meme şablonları — model şəkilləri görür (vision), strukturu sadiq saxlayır
  const tpl = trends.examples.length >= 4 ? [] : trends.templates.slice(0, 10);
  const tplText = tpl.map((t, i) => `T${i + 1}. ${t.name} — ${t.url}`).join("\n");
  return { task: "creative", name: "posters", model: MODEL, schema: schema, seed: nv.seed, messages: [
        { role: "system", content: SYSTEM + playbook(["viral-hook-writer", "cta-writer", "trend-spotter"]) + planFor("Poster", postCount()).text + memory() + nv.text },
        { role: "user", content: [
          { type: "text" as const, text:
            `REAL VİRAL NÜMUNƏLƏR (webdən, dəqiq sitat + URL):\n${exText}\n\n` +
            (tpl.length ? `REAL MEME ŞABLONLARI (şəkilləri aşağıda görürsən):\n${tplText}\n\n` : "") +
            `YUK.AZ FAKTLARI (sales üçün):\n${facts}\n\n` +
            `Bu gün üçün ${COUNT} post yaz, ardıcıllıq dəqiq belə: ${mix.map((k, i) => `${i + 1}=${k}`).join(", ")}.` +
            (feedback ? `\n\nİSTİFADƏÇİ QEYDİ, MÜTLƏQ nəzərə al:\n${feedback}` : "") },
          ...tpl.map((t) => ({ type: "image_url" as const, image_url: { url: t.url, detail: "low" } })),
        ] },
      ] };
};

const writeConcepts = async (facts: string, trends: Trends, feedback?: string): Promise<Concept[]> => {
  const nv = novelty("Poster", { idea: false });
  const __r = await chat<any>(posterRequest(facts, trends, feedback, nv));
  const posts = ((__r.data) as { posts: Concept[] }).posts;
  remember("Poster", posts, nv);
  return posts;
};

/** Loqolu səhnə — /images/edits, loqo PNG istinad kimi */
const genScene = (desc: string, dest: string, fun: boolean) =>
  (assertPhotos("poster səhnəsi"), withNvidia)(
    // NVIDIA (FLUX) loqonu dəqiq çəkə bilmir → loqosuz, düz narıncı formalar; loqo layout-da qalır
    () =>
      nvImageToFile(
        `${desc.replace(/(with )?the logo[^,.;]*/gi, "")} ` +
          (fun
            ? "Photorealistic, candid, slightly exaggerated comedic advertising photo, vertical 4:5, natural light, expressive faces, the joke must be readable from the image alone. "
            : "Photorealistic commercial advertising photo, vertical 4:5, editorial lighting, sharp, premium. ") +
          "Brand colors: bright orange #FF6600 and dark graphite #1E2124. Plain orange t-shirts and plain graphite truck without any print. " +
          "No text, letters, logos or signs anywhere. Keep the lower third relatively clean and slightly darker for typography." +
          (process.env.VISUAL_NOTES ? ` Style guidance: ${process.env.VISUAL_NOTES}.` : ""),
        dest,
        { format: "post", output: "jpeg" },
      ).then(() => undefined),
    () => genSceneOpenAI(desc, dest, fun),
  );

const genSceneOpenAI = async (desc: string, dest: string, fun: boolean) => {
  const style =
    (fun
      ? "Photorealistic, candid, slightly exaggerated comedic advertising photo, vertical 4:5, natural light, expressive faces, the joke must be readable from the image alone. "
      : "Photorealistic commercial advertising photo, vertical 4:5, editorial lighting, sharp, premium. ") +
    "Brand colors: bright orange #FF6600 and dark graphite #1E2124. " +
    "The attached image is the brand logo 'yük.az' — reproduce it EXACTLY and legibly on the movers' t-shirts / the truck / the phone screen where they appear (same shapes, colors, proportions). No other text anywhere. " +
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

/** başlıq maks 4 söz, 2 sətir — model çox yazsa qısaldırıq */
const tidyHeadline = (h: string) => {
  const words = h.split(/\s+/).filter(Boolean);
  if (words.length <= 4 && h.includes("\n")) return h.trim();
  return words.length <= 2 ? words.join(" ") : `${words.slice(0, 2).join(" ")}\n${words.slice(2, 4).join(" ")}`;
};

const main = async () => {
  const feedback = process.env.FEEDBACK?.trim() || undefined;
  console.log("\n1. Faktlar + webdən trend yumor…");
  const az = (await listArticles()).filter((a) => a.lang === "az");
  const facts = az.slice(0, 3).map((a) => `• ${a.title}: ${a.text.slice(0, 700)}`).join("\n");
  const trends = await getTrends();
  // eyni real nümunə iki dəfə istifadə olunmasın — əvvəlki postların ilham sitatlarını çıxar
  const usedQuotes = new Set<string>();
  for (const f of await fs.readdir("content/data").catch(() => [] as string[])) {
    if (!f.endsWith(".meta.json")) continue;
    const q = JSON.parse(await fs.readFile(`content/data/${f}`, "utf-8").catch(() => "{}"))?.inspiration?.quote;
    if (q) usedQuotes.add(String(q).trim().toLowerCase());
  }
  const fresh = trends.examples.filter((e) => !usedQuotes.has(e.quote.trim().toLowerCase()));
  if (fresh.length >= 2) trends.examples = fresh;
  log(`${trends.examples.length} real nümunə (istifadə olunmuş ${usedQuotes.size} çıxarıldı)`);

  console.log(`2. ${COUNT} konsept (${MODEL}, mix: ${MIX.join("/")})…`);
  const posts = await writeConcepts(facts, trends, feedback);
  const date = new Date().toISOString().slice(0, 10);
  // eyni gün ikinci istehsalda nömrələmə davam edir (poster-4, -5…) — yayımlanmış post üstünə yazılmasın
  const existing = (await fs.readdir("content/data").catch(() => [] as string[]))
    .map((f) => f.match(new RegExp(`^${date}-poster-(\\d+)\\.meta\\.json$`))?.[1]).filter(Boolean).map(Number);
  const start = existing.length ? Math.max(...existing) : 0;
  const ids: string[] = [];

  for (let i = 0; i < posts.length; i++) {
    const c = posts[i];
    const id = process.env.REEL_ID && posts.length === 1 ? process.env.REEL_ID : `${date}-poster-${start + i + 1}`;
    const fun = c.kind === "fun";
    const variant = fun ? "meme" : VARIANTS[i % VARIANTS.length];
    const headline = tidyHeadline(c.headline);
    const kicker = c.kicker.split(/\s+/).filter(Boolean).slice(0, 14).join(" ");
    const dir = path.join("public", "render", id);
    await fs.mkdir(dir, { recursive: true });
    log(`${id}: [${c.kind}${fun ? ` · ${c.format}` : ` · ${c.scene}`}/${variant}] ${kicker ? kicker + " — " : ""}${headline.replace(/\n/g, " ")}`);

    console.log(`3. Səhnə ${i + 1}/${posts.length} (AI, loqo istinadla)…`);
    const desc = fun || c.scene === "custom" ? c.sceneDetail : `${SCENES[c.scene]} ${c.sceneDetail}`;
    await genScene(desc, path.join(dir, "photo.jpg"), fun);

    const props = { id, photo: `render/${id}/photo.jpg`, kicker, headline, cta: "Zəng et", variant };
    await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
    const caption = c.caption.includes(contact.phone) ? c.caption : `${c.caption.trim()}\n\n📞 Zəng et: ${contact.phone}`;
    await fs.writeFile(
      path.join("content", "data", `${id}.meta.json`),
      JSON.stringify({ id, template: "Poster", articleId: null, link: "https://yuk.az", caption, hashtags: c.hashtags, slides: 1,
        kind: c.kind, format: c.format || null, inspiration: fun ? { url: c.sourceUrl, quote: c.sourceQuote } : null, scene: c.scene, variant, music: null, attribution: null, musicTrack: null, voice: null, silent: true }, null, 2),
      "utf-8"
    );
    ids.push(id);
  }
  await fs.mkdir("out", { recursive: true });
  await fs.writeFile("out/new-ids.txt", ids.join("\n") + "\n", "utf-8");
  console.log(`\n✓ Hazırdır: ${ids.join(", ")}\n`);
};

if (/[\\/]poster\.ts$/.test(process.argv[1] ?? "")) main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
