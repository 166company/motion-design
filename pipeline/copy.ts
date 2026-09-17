/**
 * Post kopiyası — Ootto "caption-and-hashtags" + "hashtag-keyword-research" + "cta-writer" metodologiyası ilə.
 * Bütün şablonlar üçün ortaq son addım: meta.json-dakı caption/hashtag-ləri cilalayır və əlavə edir:
 *   caption      — ilk sətir ikinci hook (yalnız o görünür), 2-4 qısa dəyər sətri, BİR CTA (+ nömrə); caption-da maks 3 hashtag
 *   hashtags     — 12-15 pilləli (geniş / orta / niş), ilk şərhə gedir
 *   firstComment — cavab doğuran sual + hashtag-lər (yayımdan sonra ilk şərh; musiqi krediti də ora əlavə olunur)
 *   altText      — əlçatanlıq təsviri
 *
 *   npx tsx pipeline/copy.ts <id>
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { contact } from "../src/brand/contact.ts";
import { playbook } from "./skills.ts";
import { chat } from "./llm.ts";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

const schema = {
  type: "object", additionalProperties: false,
  required: ["caption", "captionTags", "hashtags", "firstComment", "altText"],
  properties: {
    caption: { type: "string", description: "Tam caption (hashtag YOX, nömrə YOX — sistem əlavə edir). Format: 1 zərbəli ilk sətir → boş sətir → 2-4 qısa emojili sətir/abzas → boş sətir → 1 CTA cümləsi (səbəb + hərəkət)" },
    captionTags: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" }, description: "caption sonuna 2-3 ən uyğun hashtag" },
    hashtags: { type: "array", minItems: 12, maxItems: 15, items: { type: "string" }, description: "pilləli: 3-4 geniş (#bakı #köç), 5-6 orta, 4-5 niş; azərbaycanca; # ilə" },
    firstComment: { type: "string", description: "İlk şərh: cavab doğuran 1 sual (hashtag-siz), boş sətir, sonra bütün hashtag-lər" },
    altText: { type: "string", description: "Vizualın 1 cümləlik əlçatan təsviri" },
  },
} as const;

const SYSTEM = `Sən Yük.az (Azərbaycanda ev/ofis köçü, yükdaşıma; nömrə ${contact.phone}) üçün sosial media kopirayterisən.
Dil: sadə, isti, danışıq azərbaycan dili, "sən". Qiymət/rəqəm yazma. Digər brend adları yox. Caption-da hashtag divarı YOX.
Verilən caption-ın məzmununu və emosiyasını saxla — onu cilala, uzatma. Fun postda zarafatı davam etdir, satış postunda faydanı.`
  + playbook(["caption-and-hashtags", "hashtag-keyword-research", "cta-writer"], 6000);

export const polishCopy = async (meta: any) => {
  const context = [
    `Şablon: ${meta.template}${meta.kind ? ` (${meta.kind})` : ""}`,
    meta.strategy ? `Məqsəd: ${meta.strategy.goal} (${meta.strategy.emotion})` : "",
    meta.inspiration ? `Real nümunə (uyğunlaşdırılıb): "${meta.inspiration.quote}"` : "",
    `Mövcud caption:\n${meta.caption}`,
    `Mövcud hashtag-lər: ${(meta.hashtags ?? []).join(" ")}`,
  ].filter(Boolean).join("\n\n");
  const __r = await chat<any>({ task: "smart", name: "copy", model: MODEL, schema: schema, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: context }] });
  const c = (__r.data) as {
    caption: string; captionTags: string[]; hashtags: string[]; firstComment: string; altText: string;
  };
  const tag = (t: string) => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, "");
  let caption = c.caption.replace(/#\S+/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!caption.includes(contact.phone)) caption += `\n\n📞 Zəng et: ${contact.phone}`;
  caption += `\n\n${c.captionTags.map(tag).join(" ")}`;
  const hashtags = Array.from(new Set([...c.hashtags, ...c.captionTags].map(tag)));
  const question = c.firstComment.split("\n").find((l) => l.trim() && !l.includes("#"))?.trim() ?? "";
  const firstComment = `${question}\n\n${hashtags.join(" ")}`.trim();
  return { caption, hashtags, firstComment, altText: c.altText };
};

if (/[\\/]copy\.ts$/.test(process.argv[1] ?? "")) {
  const id = process.argv[2];
  const p = `content/data/${id}.meta.json`;
  const meta = JSON.parse(await fs.readFile(p, "utf-8"));
  const c = await polishCopy(meta);
  await fs.writeFile(p, JSON.stringify({ ...meta, ...c, captionRaw: meta.captionRaw ?? meta.caption }, null, 2), "utf-8");
  console.log(`  ✓ kopiya: ${id} — ${c.hashtags.length} hashtag, ilk şərh hazır`);
}
