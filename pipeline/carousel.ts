/**
 * "Carousel" şablonu — aviasales.az üslubunda hazırcavab 3 slaydlı statik post.
 *   1–2: fotorealist AI foto + nəhəng mətn, cümlə sözün ortasından kəsilir (sürüşdürmə hiyləsi)
 *   3:   narıncı fon, 2–3 sözlük punchline
 * Model söz oyununu yazır (tanış azərbaycan ifadəsinin köç mövzusuna çevrilməsi), foto konseptini verir.
 * Bölünmə KODDADIR — modelə etibar edilmir.
 *
 *   npx tsx pipeline/carousel.ts
 */
import "dotenv/config";
import "./plan.ts";
import { playbook, planFor, memory, postCount } from "./skills.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { contact } from "../src/brand/contact.ts";
import { nvImageToFile, withNvidia } from "./nvidia.ts";
import { chat, type ChatOpts } from "./llm.ts";
import { novelty, remember, type Novelty } from "./ideas.ts";

// Söz oyunu yaradıcı işdir — kiçik model mənasız ifadə yazır; burada güclü model (post başına ~1 sent)
const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";
const IMG_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-sunburst-2026-09-08";
const log = (m: string) => console.log(`  ${m}`);

type Concept = {
  sentence: string; // 3-5 sözlük tam cümlə
  idiom: string;    // əsaslandığı ifadə
  punch: string;    // narıncı slayd
  photo: string;    // ingiliscə foto təsviri
  caption: string;  // adətən tək emoji
  hashtags: string[];
};

const schema = {
  type: "object", additionalProperties: false,
  required: ["sentence", "idiom", "punch", "photo", "caption", "hashtags"],
  properties: {
    sentence: { type: "string", description: "3-5 sözlük tam cümlə, nöqtə ilə. Hər söz maks 8 hərf. Tanış danışıq ifadəsinin köç mövzusuna çevrilmiş forması" },
    idiom: { type: "string", description: "əsaslandığı orijinal ifadə (məs 'dur burdan get')" },
    punch: { type: "string", description: "2-3 söz, nöqtə ilə, Yük.az faydası (məs 'Sığortalı daşınma.')" },
    photo: { type: "string", description: "İNGİLİSCƏ fotorealist səhnə: Bakı mənzərəsi və ya ev/mənzil, insansız, mətnsiz, 4:5" },
    caption: { type: "string", description: "Qısa caption: 1 hazırcavab sətir (emoji ilə, cümləyə göz vurur, amma onu təkrar etmir) + boş sətir + 1 sətir fayda. Sonda CTA sistem özü əlavə edir. 2-3 sətir cəmi." },
    hashtags: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
  },
} as const;

const NL = String.fromCharCode(10);

/**
 * Cümləni 2 slayda bölür. Kəsilən söz: sonuncu (3 sözdə) və ya sondan ikinci (4-5 sözdə),
 * ki 2-ci slaydda davam + bir söz olsun. 5 hərfdən qısa sözlər kəsilmir — bir söz geri çəkilir.
 * Nəticə böyük hərflərlə, hər söz öz sətrində.
 */
export const splitSentence = (sentence: string): [string, string] => {
  const words = sentence.trim().split(/\s+/);
  const n = words.length;
  let cut = n <= 3 ? n - 1 : n - 2;
  const bare = (w: string) => w.replace(/[.!?,]+$/, "");
  while (cut > 0 && bare(words[cut]).length < 5) cut -= 1;
  const word = words[cut];
  const core = bare(word);
  const punct = word.slice(core.length);
  const at = Math.ceil(core.length / 2);
  const head = core.slice(0, at).toLocaleUpperCase("az");
  const tail = (core.slice(at) + punct).toLocaleUpperCase("az");
  const slide1 = [...words.slice(0, cut).map((w) => w.toLocaleUpperCase("az")), head].join(NL);
  const slide2 = [tail, ...words.slice(cut + 1).map((w) => w.toLocaleUpperCase("az"))].join(NL);
  return [slide1, slide2];
};

const SYSTEM = `Sən Yük.az (yükdaşıma və ev daşınması) üçün hazırcavab Instagram karusel postu yazırsan — aviasales.az üslubu.
NÜMUNƏ (aviasales): cümlə "Dur burdan Sinqapura gedək." → punchline "Ucuz biletlər." Yumor: "dur burdan get" ifadəsinin gözlənilməz çevrilməsi.
QAYDALAR:
- Azərbaycan dilində HƏQİQƏTƏN tanış danışıq ifadəsi və ya atalar sözü götür (məs "dur burdan get", "evin yıxılsın", "başına dolanım", "qapını çal", "yükünü çək") və köç/daşınma/qutu/yük mövzusuna gözlənilməz, incə çevir. Oxuyan dərhal başa düşməli və gülümsəməlidir.
- Cümlə 3-5 söz, TƏBİİ azərbaycan dili, qrammatik düzgün, "sən" tonu. Hər söz maks 8 hərf.
- Punchline 2-3 söz, Yük.az faydası: sığorta, bir zəng, qablaşdırma, sürət. QİYMƏT RƏQƏMİ YOX.
- Caption: 1 hazırcavab sətir + 1 fayda sətri, emojili, qısa. Nömrəni yazma — sistem əlavə edir.
- "Dur burdan köçək." artıq istifadə olunub — TƏKRAR ETMƏ, təzəsini tap.`;

/** Sorğu qurucusu — eyni prompt/sxem compare.ts-də də istifadə olunur */
export const carouselRequest = (feedback: string | undefined, nv: Novelty): ChatOpts => ({
  task: "creative", name: "carousel", model: MODEL, schema: schema, seed: nv.seed, messages: [
        { role: "system", content: SYSTEM + playbook(["carousel-builder", "viral-hook-writer", "going-viral"]) + planFor("Carousel", postCount()).text + memory() + nv.text },
        { role: "user", content: `Yeni bir karusel konsepti yaz.${feedback ? `${NL}${NL}İSTİFADƏÇİ QEYDİ, MÜTLƏQ nəzərə al:${NL}${feedback}` : ""}` },
      ],
});

const writeConcept = async (feedback?: string): Promise<Concept> => {
  const nv = novelty("Carousel");
  const __r = await chat<any>(carouselRequest(feedback, nv));
  const concept = (__r.data) as Concept;
  remember("Carousel", concept, nv);
  return concept;
};

const genPhoto = (desc: string, dest: string) => {
  const visual = process.env.VISUAL_NOTES ? ` Style/composition guidance: ${process.env.VISUAL_NOTES}.` : "";
  const hasRefs = (process.env.IMAGE_REFS ?? "").split(",").some(Boolean);
  // İstinad şəkil (IMAGE_REFS) NVIDIA-da dəstəklənmir → həmin halda OpenAI yolu
  if (hasRefs && process.env.IMAGE_ENGINE !== "nvidia") return genPhotoOpenAI(desc, dest);
  return withNvidia(
    () =>
      nvImageToFile(
        `Photorealistic, vertical 4:5 framing, editorial photography, warm natural light, soft depth of field, no people, no text, no logos. Slightly darker lower third to hold large white typography. ${desc}${visual}`,
        dest,
        { format: "carousel", output: "jpeg" },
      ).then(() => undefined),
    () => genPhotoOpenAI(desc, dest),
  );
};

const genPhotoOpenAI = async (desc: string, dest: string) => {
  const visual = process.env.VISUAL_NOTES ? ` Style/composition guidance: ${process.env.VISUAL_NOTES}.` : "";
  const prompt = `Photorealistic, vertical 4:5 framing, editorial photography, warm natural light, soft depth of field, no people, no text, no logos. Slightly darker lower third to hold large white typography. ${desc}${visual}`;
  const refs = (process.env.IMAGE_REFS ?? "").split(",").filter(Boolean);

  let res: Response;
  if (refs.length) {
    // İstinad şəkil var → edits API: üslub/kompozisiya istinaddan, məzmun promptdan
    const img = await fetch(refs[0]);
    const blob = await img.blob();
    const form = new FormData();
    form.append("model", IMG_MODEL);
    form.append("image", blob, "ref.png");
    form.append("prompt", `Create a NEW photo that matches the style, mood, lighting and composition of the reference image. ${prompt}`);
    form.append("size", "1024x1536");
    form.append("quality", "high");
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: IMG_MODEL, prompt, size: "1024x1536", output_format: "jpeg", quality: "high", n: 1 }),
    });
  }
  if (!res.ok) throw new Error(`Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const b64 = ((await res.json()) as any).data[0].b64_json as string;
  await fs.writeFile(dest, Buffer.from(b64, "base64"));
};

const main = async () => {
  const feedback = process.env.FEEDBACK?.trim() || undefined;
  console.log(`${NL}1. Konsept (${MODEL})…`);
  // İstifadəçi dəqiq mətn veribsə (Dəyişiklik qeydindən) — model uydurmasın, olduğu kimi
  const exactSlides: string[] | null = process.env.EXACT_SLIDES ? JSON.parse(process.env.EXACT_SLIDES) : null;
  const joinSlides = (sl: string[]) =>
    sl.reduce((acc, x) => {
      const a = acc.replace(/\.\.\.$/, ""), b = x.replace(/^\.\.\./, "");
      return acc === "" ? b : /\.\.\.$/.test(acc) && /^\.\.\./.test(x) ? a + b : a + " " + b;
    }, "").replace(/\s+/g, " ").trim();
  const exactSentence = process.env.EXACT_SENTENCE || (exactSlides ? joinSlides(exactSlides.map((x) => x.replace(/\n/g, " "))) : null);
  const withCta = (cap: string) => cap.includes(contact.phone) ? cap : `${cap.trim()}${NL}${NL}📞 Zəng et: ${contact.phone}`;
  const c = await writeConcept(
    exactSentence
      ? `${feedback ?? ""}${NL}${NL}DİQQƏT: cümlə ARTIQ VERİLİB, onu dəyişmə, "sentence" sahəsinə olduğu kimi yaz: "${exactSentence}". Yalnız foto, caption, hashtag${process.env.EXACT_PUNCH ? "" : ", punch"} üçün işlə.`
      : feedback
  );
  if (exactSentence) c.sentence = exactSentence;
  if (process.env.EXACT_PUNCH) c.punch = process.env.EXACT_PUNCH;
  const [slide1, slide2] = exactSlides && exactSlides.length >= 2
    ? [exactSlides[0], exactSlides[1]]
    : splitSentence(c.sentence);
  log(`"${c.sentence}"  ←  ${c.idiom}  →  ${c.punch}`);
  log(`slaydlar: [${slide1.replace(/\n/g, " ")}] [${slide2.replace(/\n/g, " ")}]`);

  const id = process.env.REEL_ID || `${new Date().toISOString().slice(0, 10)}-carousel`;
  const dir = path.join("public", "render", id);
  await fs.mkdir(dir, { recursive: true });

  console.log("2. Foto (AI)…");
  await genPhoto(c.photo, path.join(dir, "photo.jpg"));

  const props = { id, photo: `render/${id}/photo.jpg`, lines: [slide1, slide2], punch: c.punch, fontSize: 190 };
  await fs.writeFile(path.join(dir, "props.json"), JSON.stringify(props, null, 2), "utf-8");
  await fs.writeFile(
    path.join("content", "data", `${id}.meta.json`),
    JSON.stringify({
      id, template: "Carousel", articleId: null, link: "https://yuk.az",
      caption: withCta(c.caption), hashtags: c.hashtags, slides: 3, spoken: c.sentence, idiom: c.idiom,
      music: null, attribution: null, musicTrack: null, voice: null, silent: true,
    }, null, 2),
    "utf-8"
  );
  console.log(`${NL}✓ Hazırdır: ${id}  (3 slayd)${NL}`);
};

if (process.argv[1]?.endsWith("carousel.ts")) {
  main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
}
