/**
 * "Dəyişiklik" qeydinin interpretatoru.
 *
 * İstifadəçi sərbəst yazır ("səs olmasın, maşın geri gedir, bu şəkil kimi olsun"), şəkil əlavə edir.
 * Güclü model (görmə ilə) bunu pipeline-ın başa düşdüyü STRUKTUR parametrlərə çevirir:
 *   silent, voice, template, musicMood, contentNotes, visualNotes, imageRefs, assetHints
 *
 *   npx tsx pipeline/interpret.ts <meta.json> "<qeyd mətni>"   → JSON stdout + GITHUB_OUTPUT sətirləri
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { chat } from "./llm.ts";

const MODEL = process.env.OPENAI_CREATIVE_MODEL ?? "gpt-5.5";

export type Plan = {
  silent: boolean | null;                 // null = dəyişmə
  voice: "marin" | "coral" | "cedar" | "ash" | null;
  template: "TipList" | "Explainer" | "Story" | "Carousel" | "Poster" | null;
  musicMood: "energetic" | "calm" | "none" | null;
  contentNotes: string;                   // ssenari/mətn modelinə gedən qeyd
  visualNotes: string;                    // foto/illüstrasiya/asset promptlarına gedən qeyd (İNGİLİSCƏ)
  assetHints: string[];                   // yenidən yaradılmalı assetlər: truck, mover, boxes, sofa, phone, plant, bg_street, bg_home, bg_interior
  exactSlides: string[] | null;           // istifadəçi slayd mətnlərini DƏQİQ veribsə — olduğu kimi
  exactPunch: string | null;              // dəqiq punchline
  exactSentence: string | null;           // dəqiq tam cümlə (slaydlar verilməyibsə bölünmə kodda)
  imageRefs: string[];                    // istinad şəkil URL-ləri
  summary: string;                        // istifadəçiyə qısa təsdiq (azərbaycanca)
};

const schema = {
  type: "object", additionalProperties: false,
  required: ["silent", "voice", "template", "musicMood", "contentNotes", "visualNotes", "assetHints", "exactSlides", "exactPunch", "exactSentence", "summary"],
  properties: {
    silent: { type: ["boolean", "null"], description: "səsləndirmə olmasın → true; səs olsun → false; qeyd yoxdursa null" },
    voice: { type: ["string", "null"], enum: ["marin", "coral", "cedar", "ash", null], description: "qadın: marin/coral, kişi: cedar/ash; qeyd yoxdursa null" },
    template: { type: ["string", "null"], enum: ["TipList", "Explainer", "Story", "Carousel", "Poster", null], description: "şablon dəyişməli olduqda; yoxsa null" },
    musicMood: { type: ["string", "null"], enum: ["energetic", "calm", "none", null] },
    contentNotes: { type: "string", description: "mətn/ssenari üçün konkret göstərişlər, azərbaycanca; yoxdursa boş" },
    visualNotes: { type: "string", description: "vizual üçün konkret göstərişlər İNGİLİSCƏ (foto/illüstrasiya promptuna əlavə olunur): üslub, rəng, səhnə, istiqamət; yoxdursa boş" },
    assetHints: { type: "array", items: { type: "string" }, description: "yenidən yaradılmalı asset adları (truck, mover, boxes, sofa, phone, plant, bg_street, bg_home, bg_interior); yoxdursa boş" },
    exactSlides: { type: ["array", "null"], items: { type: "string" }, description: "İstifadəçi slayd mətnlərini AÇIQ veribsə ('1-ci slayd: … 2-ci slayd: …'), hər slaydın mətni OLDUĞU KİMİ (böyük hərf, üç nöqtə, durğu daxil); sətir ayırmaq üçün \n; yoxdursa null" },
    exactPunch: { type: ["string", "null"], description: "istifadəçi 3-cü slayd/punchline mətnini açıq veribsə, olduğu kimi; yoxsa null" },
    exactSentence: { type: ["string", "null"], description: "istifadəçi tam cümləni veribsə (slaydsız), olduğu kimi; yoxsa null" },
    summary: { type: "string", description: "1-2 cümlə azərbaycanca: nəyi necə başa düşdün" },
  },
} as const;

const SYSTEM = `Sən Yük.az video-istehsal sisteminin şərh interpretatorusan. İstifadəçi paneldə videoya baxıb sərbəst qeyd yazır, bəzən şəkil əlavə edir.
Sənin işin: qeydi (və şəkilləri) sistemin parametrlərinə çevirmək. Sistem haqqında:
- Şablonlar: TipList (məqalə əsaslı, stok video fonlu, səsli), Explainer (kodla çəkilmiş animasiya), Story (AI illüstrasiya "Köç günü", default səssiz), Carousel (3 slaydlı statik hazırcavab post), Poster (tək statik post: fun — trend meme formatı yük.az-a uyğunlaşdırılıb, və ya satış — loqolu işçilər/maşın/telefon səhnəsi; qısa kicker + 2-4 sözlük başlıq + nömrə).
- Səs: OpenAI səsləri marin/coral (qadın), cedar/ash (kişi). "səs olmasın / yalnız musiqi" → silent=true.
- Musiqi: energetic (gümrah), calm (sakit), none.
- Story assetləri: truck, mover, boxes, sofa, phone, plant, bg_street, bg_home, bg_interior — "maşın pisdir" → assetHints:["truck"].
- Şəkil əlavə olunubsa: onu istinad kimi qəbul et — üslub, rəng, kompozisiya, ovqat; visualNotes-a İNGİLİSCƏ dəqiq təsvir yaz ("reference image: warm golden-hour photo, low camera angle…").
- İstifadəçi KONKRET mətn veribsə (slayd mətnləri, cümlə, punchline, başlıq) — bunu exactSlides/exactPunch/exactSentence sahəsinə OLDUĞU KİMİ yaz, dəyişdirmə, "yaxşılaşdırma". Sistem onu hərfbəhərf istifadə edəcək.
- Anlaşılmayan şeyi uydurma; əmin olmadığın parametri null/boş saxla, summary-də de.
- Hər şeyi contentNotes-a atma: yalnız mətn/ssenari ilə bağlı olanlar ora, vizual olanlar visualNotes-a (ingiliscə), struktur olanlar müvafiq sahəyə.`;

export const interpret = async (note: string, meta: any, imageUrls: string[]): Promise<Plan> => {
  const content: any[] = [
    { type: "text", text: `HAZIRKI VİDEO: şablon=${meta.template ?? "TipList"}, səs=${meta.silent ? "səssiz" : meta.voice ?? "var"}, musiqi=${meta.musicTrack?.title ?? "sintez/yoxdur"}\nQEYD:\n${note}` },
  ];
  for (const url of imageUrls.slice(0, 4)) content.push({ type: "image_url", image_url: { url } });

  const __r = await chat<any>({ task: "smart", name: "plan", model: MODEL, schema: schema, messages: [{ role: "system", content: SYSTEM }, { role: "user", content }] });
  const p = (__r.data);
  return { ...p, imageRefs: imageUrls };
};

/** Issue mətnindən şəkil URL-lərini çıxarır: ![..](url), <img src>, çılpaq linklər */
export const extractImages = (body: string) =>
  [...body.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)|<img[^>]+src="(https?:[^"]+)"|(https?:\/\/\S+\.(?:png|jpe?g|webp)(?:\?\S*)?)/gi)]
    .map((m) => m[1] || m[2] || m[3])
    .filter(Boolean);

if (process.argv[1]?.endsWith("interpret.ts")) {
  const [, , metaPath, ...rest] = process.argv;
  const note = rest.join(" ") || process.env.FEEDBACK || "";
  const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
  const images = extractImages(note);
  const plan = await interpret(note.replace(/!\[[^\]]*\]\([^)]*\)/g, "[şəkil]"), meta, images);
  console.error(JSON.stringify(plan, null, 2));
  // GitHub Actions üçün
  const out = process.env.GITHUB_OUTPUT;
  const lines = [
    `silent=${plan.silent === null ? "" : plan.silent ? "1" : "0"}`,
    `voice=${plan.voice ?? ""}`,
    `template=${plan.template ?? ""}`,
    `music_mood=${plan.musicMood ?? ""}`,
    `asset_hints=${plan.assetHints.join(",")}`,
    `summary<<EOF\n${plan.summary}\nEOF`,
  ];
  // çoxsətirli dəyərlər üçün fayl
  await fs.writeFile("feedback-plan.json", JSON.stringify(plan, null, 2), "utf-8");
  if (out) await fs.appendFile(out, lines.join("\n") + "\n");
  console.log(plan.summary);
}
