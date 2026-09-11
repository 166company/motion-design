/** Məqalə → reels ssenarisi. Yalnız məqalədəki məlumatdan istifadə edir. */
import type { Article } from "./wp.ts";
import { contact } from "../src/brand/contact.ts";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

export type ScriptItem = {
  title: string;
  body: string;
  spoken: string;
  /** Pexels üçün İNGİLİS dilində axtarış sorğusu */
  query: string;
  /** Lucide ikon adı (Iconify-dən çəkilir) */
  icon: string;
};

export type ScriptOut = {
  hook: string;
  hookSpoken: string;
  hookQuery: string;
  items: ScriptItem[];
  cta: { line1: string; line2: string };
  caption: string;
  hashtags: string[];
};

const SYSTEM = `Sən Yuk.az üçün Instagram Reels ssenaristisən.
Yuk.az — Azərbaycanda yükdaşıma və ev daşınması xidmətidir. Hədəf auditoriya: YÜK SAHİBLƏRİ,
yəni əşyasını/yükünü daşıtmaq istəyən adi insanlar və kiçik biznes sahibləri.

QAYDALAR:
- Yalnız verilən məqalədəki məlumatdan istifadə et. Heç nə uydurma.
- KONKRET QİYMƏT RƏQƏMİ YAZMA (nə manat, nə "təxminən X"). Məqalədə yoxdur, çünki qiyməti operator telefonda deyir.
- Dil: təmiz, sadə azərbaycan dili. "Sən" müraciəti. Rəsmi kargüzarlıq dili YOX.
- Hər bənd bir praktik fayda versin — ümumi sözlər yox.
- QISALIQ ƏSASDIR: bütün video 25-28 saniyə olmalıdır. Uzun cümlə yazma.
- "spoken" sahəsi səsləndirilir: rəvan, danışıq dilində, qısaltma və simvol olmasın.
  "Yuk.az" əvəzinə "Yük nöqtə az" yaz (brend belə tələffüz olunur).
- "title" ekranda böyük hərflərlə görünür: qısa və zərbəli.
  ÇOX VACİB: title tam və qrammatik cəhətdən düzgün azərbaycan ifadəsi olmalıdır.
  Simvol limitinə sığdırmaq üçün sözləri kəsmə və söz sırasını pozma.
  Sığmırsa, daha qısa BAŞQA ifadə seç. Pis nümunə: "NƏ SƏNƏDİR FƏRQİ".
  Yaxşı nümunə: "SƏNƏDLƏRİN FƏRQİ", "NƏ DAXİLDİR?", "LİFT VARMI?"
- "query" mütləq İNGİLİS dilində, stok video axtarışı üçün (məs: "movers carrying boxes stairs").
- "icon" hər bənd üçün Lucide ikon adı (İNGİLİS, kiçik hərf, defislə): məs "truck", "package", "building-2",
  "phone-call", "shield-check", "clock", "stairs", "home", "boxes", "calculator", "map-pin", "wallet".
- Caption formatı: emoji ilə hook → boş sətir → emojili qısa abzaslar → boş sətir → CTA. Divar kimi mətn YOX.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "hookSpoken", "hookQuery", "items", "cta", "caption", "hashtags"],
  properties: {
    hook: { type: "string", description: "Ekrandakı açılış sualı, maksimum 55 simvol" },
    hookSpoken: { type: "string", description: "TƏK qısa cümlə, maksimum 10 söz — ilk 3 saniyə həlledicidir" },
    hookQuery: { type: "string", description: "açılış səhnəsi üçün ingiliscə stok video sorğusu" },
    items: {
      type: "array",
      minItems: 4,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "spoken", "query", "icon"],
        properties: {
          title: { type: "string", description: "maksimum 34 simvol" },
          body: { type: "string", description: "maksimum 85 simvol" },
          spoken: { type: "string", description: "səsləndirilən mətn, 9-13 söz — qısa və zərbəli" },
          query: { type: "string", description: "ingiliscə stok video sorğusu" },
          icon: { type: "string", description: "Lucide ikon adı, məs: truck, package, phone-call" },
        },
      },
    },
    cta: {
      type: "object",
      additionalProperties: false,
      required: ["line1", "line2"],
      properties: {
        line1: { type: "string", description: "maksimum 32 simvol" },
        line2: { type: "string", description: "qısa: yuk.az və ya telefon" },
      },
    },
    caption: {
      type: "string",
      description:
        "Instagram təsviri. FORMAT MƏCBURİDİR: (1) emoji ilə başlayan zərbəli 1 sətirlik hook; " +
        "(2) boş sətir; (3) 2-4 qısa abzas, hər abzas boş sətirlə ayrılır, hər birinin əvvəlində uyğun emoji (📦 🚚 🏠 💡 ✅ ⏱ 📞 kimi); " +
        "(4) boş sətir; (5) SONDA CTA, MƏCBURİ olaraq bu formada: '📞 Zəng et: " + contact.phone + "' (nömrəni dəyişmə). " +
        "Hashtag YAZMA (ayrıca sahədə gəlir). Rəqəm/qiymət yazma.",
    },
    hashtags: { type: "array", minItems: 5, maxItems: 10, items: { type: "string" } },
  },
} as const;

export const writeScript = async (article: Article, feedback?: string): Promise<ScriptOut> => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY yoxdur");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `MƏQALƏ BAŞLIĞI: ${article.title}
LİNK: ${article.link}

BÖLMƏ BAŞLIQLARI:
${article.headings.map((h) => "- " + h).join("\n")}

MƏTN (ilk 6000 simvol):
${article.text.slice(0, 6000)}

Bu məqaləni 25-30 saniyəlik bir Reels ssenarisinə çevir.${
          feedback?.trim()
            ? `

İSTİFADƏÇİ QEYDİ — əvvəlki versiyaya baxıb bunu istəyib, MÜTLƏQ nəzərə al:
${feedback.trim()}`
            : ""
        }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "reel_script", strict: true, schema },
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as any;
  return normalize(JSON.parse(data.choices[0].message.content) as ScriptOut);
};

/**
 * "Yukaz" yalnız səsləndirmə üçündür (TTS düzgün oxusun).
 * Ekranda və caption-da həmişə "Yük.az" olmalıdır (yeni söz işarəsi).
 */
const toBrand = (t: string) => t.replace(/Yukaz|Yuk\.az/gi, "Yük.az");
const toSpoken = (t: string) => t.replace(/Y[uü]k\.?az/gi, "Yük nöqtə az");

/** Caption-ın sonunda nömrəli CTA mütləq olsun — model unutsa da */
const ensurePhoneCta = (caption: string) =>
  caption.includes(contact.phone) ? caption : `${caption.trim()}

📞 Zəng et: ${contact.phone}`;

const normalize = (s: ScriptOut): ScriptOut => ({
  ...s,
  hook: toBrand(s.hook),
  hookSpoken: toSpoken(s.hookSpoken),
  items: s.items.map((i) => ({
    ...i,
    title: toBrand(i.title),
    body: toBrand(i.body),
    spoken: toSpoken(i.spoken),
  })),
  cta: { line1: toBrand(s.cta.line1), line2: toBrand(s.cta.line2) },
  caption: ensurePhoneCta(toBrand(s.caption)),
});
