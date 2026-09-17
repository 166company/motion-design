/**
 * Təkrarsız ideyalar — hər post əvvəlkilərdən FƏRQLİ çıxsın deyə:
 *   1) Yaddaş: content/data/ideas-history.json — son ideyalar (hook, başlıq, səhnə, üslub, model).
 *      Promptа "BUNLARI TƏKRARLAMA" siyahısı kimi gedir.
 *   2) Kreativ bucaq (lens): hər dəfə başqa komik/izah mexanizmi — təsadüfi, amma son istifadə olunanlar çıxılır.
 *   3) Vizual istiqamət: kompozisiya/işıq/kamera/rəng aksenti — qrafik və motion üçün.
 *   4) Model rotasiyası: llm.ts creative tapşırığında hər dəfə başqa model başlayır (seed buradan gəlir).
 *
 * Qaydalar (qiymət yoxdur, real sitat, brend adı və s.) HƏMİŞƏ bucaqdan üstündür — bucaq yalnız ilhamdır.
 *
 * NOVELTY=0 → söndürülür: novelty().text boş qayıdır, remember() heç nə yazmır (promptlar köhnə OpenAI axını kimi qalır).
 */
import fs from "node:fs";
import path from "node:path";
import { lastUsed } from "./llm.ts";

const FILE = path.join("content", "data", "ideas-history.json");
/** NOVELTY=0 → yenilik bloku və yaddaş söndürülür (default 1) */
const ON = (process.env.NOVELTY ?? "1").trim() !== "0";
const KEEP = 120;

type Entry = { at: string; template: string; summary: string; lens?: string; visual?: string; model?: string };

const load = (): Entry[] => {
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")) as Entry[]; } catch { return []; }
};

/** İDEYA bucaqları — Azərbaycan auditoriyası, köç/yük mövzusu */
export const IDEA_LENSES = [
  "Gözlənti vs reallıq (köçdən əvvəl / köç günü)",
  "Təbiət sənədli filmi diktoru kimi: 'Burada biz nadir Bakı köçkününü görürük…'",
  "İdman şərhçisi: divanın liftə girməsi final matçı kimi",
  "Qorxu filmi treyleri: 'Köçə 1 gün qalıb… qutular bitib'",
  "Xəbər buraxılışı / təcili xəbər formatı",
  "POV: sən qonşusan və yuxarıdan pianino enir",
  "Reseptlər formatı: 'Stressiz köçün resepti — 1 zəng, 0 əsəb'",
  "Hava proqnozu: 'Sabah Bakıda qutu yağışı gözlənilir'",
  "Nənə məsləhətləri vs Yük.az məsləhəti",
  "Mini seriya / epizod: 'Köç günlükləri, 3-cü bölüm'",
  "Rəqəmsiz 'infoqrafika zarafatı': diaqramda 'dostlara zəng' vs 'Yük.az'",
  "Dialoq çatı (WhatsApp ekranı kimi): ailə qrupunda köç planı",
  "Retro 90-lar televiziya reklamı parodiyası",
  "Əşyanın gözü ilə (divan / soyuducu / pişik danışır)",
  "'Heç kim demir, amma…' — gizli köç həqiqəti",
  "Səhv/düz: 'Bunu etmə → belə et'",
  "ASMR sakitliyi: qablaşdırma lenti, qutu qatlanması",
  "Super qəhrəman: narıncı formalı işçilər 'xilasetmə missiyası'",
  "Quiz / sual: 'Sən hansı köçkünsən? A) B) C)'",
  "Zaman atlaması: səhər 08:00 xaos → axşam 18:00 yeni evdə çay",
  "Ofis köçü: IT şöbəsinin kabelləri 'çözmə' dramı",
  "Bakı lokal detalı: lift işləmir, 9-cu mərtəbə, həyət maşını",
] as const;

/** VİZUAL istiqamətlər — qrafik dizayn və motion üçün */
export const VISUAL_LENSES = [
  "Kinematik geniş kadr, qızıl saat işığı, dayaz sahə dərinliyi",
  "Flaşlı 'candid' telefon fotosu, bir az əyri kadr, real həyat hissi",
  "Yuxarıdan (top-down / flat-lay) kompozisiya, qutular həndəsi düzülüb",
  "Balıqgözü / geniş bucaq, komik perspektiv",
  "Minimalist Swiss poster: böyük boş sahə, bir obyekt, güclü tipoqrafiya yeri",
  "İzometrik 3D səhnə, oyuncaq kimi miniatür şəhər",
  "Kağız-kəsmə (paper-cut) qatlı illüstrasiya",
  "Gil animasiya (claymation) görünüşü, yumşaq işıq",
  "Neon gecə Bakı, narıncı işıq zolaqları, tünd qrafit fon",
  "Split-screen: sol xaos / sağ nizam",
  "Makro detal: qablaşdırma lenti, qutu küncü, açar",
  "Dron kadrı: Bakı küçəsi, narıncı maşın kiçik nöqtə kimi",
  "Retro VHS / 90-lar reklam rəngləri və dənəvərlik",
  "Pop-art: qalın konturlar, nöqtəli fon, narıncı-qrafit",
  "Pastel yumşaq 3D, yumru formalar, sakit ovqat",
  "Kollaj: kəsilmiş foto + əl ilə cızılmış oxlar",
] as const;

/** MOTION istiqamətləri — Remotion keçidləri/ritm üçün təklif (şablon icazə verdiyi qədər) */
export const MOTION_LENSES = [
  "Sürətli kəsimlər, hər söz vurğusunda zoom-punch",
  "Yavaş parallaks, sakit kamera sürüşməsi, sonda sürətli CTA",
  "Kinetik tipoqrafiya: sözlər ekrana 'düşür' və yığılır",
  "Whip-pan keçidləri, səhnələr yan-yana sürüşür",
  "Stop-motion hissi: 12 fps kimi titrək hərəkət",
  "Bir kadr uzun plan, obyektlər kadra girib-çıxır",
] as const;

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Son N-də istifadə olunmayanlardan seç (təsadüfi) */
const pickFresh = <T extends string>(list: readonly T[], used: (string | undefined)[], rnd: number): T => {
  const recent = new Set(used.filter(Boolean).slice(-Math.floor(list.length * 0.6)));
  const fresh = list.filter((x) => !recent.has(x));
  const pool = fresh.length ? fresh : list;
  return pool[rnd % pool.length];
};

export type Novelty = { seed: number; lens: string; visual: string; motion: string; text: string };

/**
 * Bu post üçün yenilik bloku (sistem promptunun sonuna əlavə et).
 * opts.idea=false → yalnız vizual istiqamət (məs. real sitat tələb edən fun poster).
 */
export const novelty = (template: string, opts: { idea?: boolean; motion?: boolean; recent?: number } = {}): Novelty => {
  if (!ON) return { seed: Math.floor(Date.now() / 1000), lens: "", visual: "", motion: "", text: "" };
  const all = load();
  const mine = all.filter((e) => e.template === template);
  const seed = hash(`${template}|${Date.now()}|${Math.random()}`);
  const lens = pickFresh(IDEA_LENSES, mine.map((e) => e.lens), seed);
  const visual = pickFresh(VISUAL_LENSES, mine.map((e) => e.visual), seed >>> 7);
  const motion = pickFresh(MOTION_LENSES, [], seed >>> 13);
  const recent = mine.slice(-(opts.recent ?? 25)).map((e) => `- ${e.summary}`).join("\n");
  const text =
    `\n\n=== YENİLİK (hər post fərqli olmalıdır) ===\n` +
    (recent ? `ƏVVƏLKİ İDEYALAR — bunları, onların hook-larını, komik mexanizmini və səhnə quruluşunu TƏKRARLAMA, oxşar da yazma:\n${recent}\n` : "") +
    (opts.idea !== false ? `BU DƏFƏKİ KREATİV BUCAQ (ilham; qaydalar üstündür): ${lens}\n` : "") +
    `VİZUAL İSTİQAMƏT (şəkil/səhnə təsvirlərinə tətbiq et): ${visual}\n` +
    (opts.motion ? `MOTION RİTMİ (ekran mətni və səhnə bölgüsünə əks etdir): ${motion}\n` : "") +
    `Birinci ağlına gələn ideyanı yox, 5 variant düşün və ən gözlənilməz, amma dərhal başa düşülən birini seç.\n=== YENİLİK SONU ===`;
  return { seed, lens, visual, motion, text };
};

/** Obyektdən qısa xülasə (hook/başlıq/səhnə kimi sahələr) */
const summarize = (o: unknown): string => {
  const keys = ["hook", "headline", "kicker", "sentence", "punch", "title", "concept", "heading", "idea", "scene", "sceneDetail", "photo", "styleKey", "setting"];
  const out: string[] = [];
  const walk = (v: any, depth: number) => {
    if (!v || typeof v !== "object" || depth > 3 || out.join(" | ").length > 260) return;
    for (const k of keys) if (typeof v[k] === "string" && v[k].trim()) out.push(`${k}: ${v[k].replace(/\s+/g, " ").slice(0, 90)}`);
    for (const x of Object.values(v)) if (typeof x === "object") walk(x, depth + 1);
  };
  walk(o, 0);
  return [...new Set(out)].join(" | ").slice(0, 300) || JSON.stringify(o).slice(0, 200);
};

/** Yaradılan ideyanı yaddaşa yaz (bir neçə post varsa hər biri ayrıca) */
export const remember = (template: string, items: unknown | unknown[], n?: Pick<Novelty, "lens" | "visual">) => {
  if (!ON) return;
  const all = load();
  for (const it of Array.isArray(items) ? items : [items])
    all.push({ at: new Date().toISOString(), template, summary: summarize(it), lens: n?.lens, visual: n?.visual, model: lastUsed.model ? `${lastUsed.provider}/${lastUsed.model}` : undefined });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all.slice(-KEEP), null, 1), "utf-8");
};
