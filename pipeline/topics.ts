/**
 * Mövzu bankı — "hər dəfə eyni lift/qutu zarafatı" problemini kökündən həll edir.
 *
 * Hər postun mövzusu buradan seçilir: son postlarda işlənənlər ÇIXARILIR (content/data/ideas-history.json),
 * qalanlardan təsadüfi 6-sı modelə verilir və o birini seçir. Mövzu meta-da saxlanılır → növbəti dəfə bloklanır.
 * Mövzular beynəlxalq top köç brendlərinin kontent sütunlarına uyğundur (bax: pipeline/movers.ts, content/movers-playbook.json).
 */
import fs from "node:fs";

export type Topic = { id: string; title: string; audience: string; hint: string };

export const TOPICS: Topic[] = [
  // — qablaşdırma texnikası (U-Haul/PODS tipli "hack" kontenti)
  { id: "kitchen_pack", title: "Mətbəxi 2 saata yığmaq", audience: "özü yığan ailə", hint: "boşqab şaquli, kağız aralıq, qutu ağırlığı" },
  { id: "labeling", title: "Qutuları düzgün nişanlamaq", audience: "planlaşdıran", hint: "otaq + nömrə + 'əvvəl aç' qutusu" },
  { id: "forgotten", title: "Ən çox unudulan əşyalar", audience: "hamı", hint: "açar, sənəd, şarj, dərman, pərdə qarmaqları" },
  { id: "packing", title: "Qablaşdırma materialı necə seçilir", audience: "özü yığan", hint: "köpük, lent, künc qoruyucu — nə vaxt hansı" },
  // — yükləmə texnikası ("tetris", peşəkarlıq sübutu)
  { id: "load_tetris", title: "Maşın necə yüklənir", audience: "yük sahibi", hint: "ağır alt, yüngül üst, boşluq qalmasın, kəmər" },
  { id: "blankets", title: "Mebel örtüyü niyə ilk gedir", audience: "mebel sahibi", hint: "cızıq, künc, örtük və streç" },
  { id: "elevator", title: "Liftsiz binada taktika", audience: "köhnə bina sakini", hint: "kəmər, növbə, komanda işi" },
  // — kövrək və ağır əşya
  { id: "fragile_art", title: "Güzgü və rəsm necə sarınır", audience: "sənət sahibi", hint: "künc qoruyucu, köpük, şaquli daşıma" },
  { id: "piano", title: "Pianonun köçü", audience: "musiqi ailəsi", hint: "4 nəfər, dolly, pilləkən döngəsi" },
  { id: "fridge", title: "Soyuducu daşınmadan əvvəl", audience: "ailə", hint: "buz açma, 24 saat dik durma, kəmər" },
  { id: "tv_glass", title: "Televizor və şüşə səthlər", audience: "ev sahibi", hint: "orijinal qutu, şaquli, təzyiq nöqtəsi" },
  { id: "gym", title: "İdman avadanlığı", audience: "idmançı", hint: "sökülmə, ağırlıq bölgüsü, yer qoruyucu" },
  // — qiymət və vaxt şəffaflığı
  { id: "price", title: "Qiymətə təsir edən amillər", audience: "qiymət soruşan", hint: "həcm, mərtəbə, lift, məsafə, tarix — rəqəmsiz" },
  { id: "peak", title: "Pik mövsümdə maşın niyə tapılmır", audience: "planlaşdıran", hint: "ay sonu, həftəsonu, bayram ərəfəsi" },
  { id: "checklist", title: "Köçə 8 həftə qalıb", audience: "planlaşdıran", hint: "həftə-həftə plan, saxlanılası siyahı" },
  { id: "timing", title: "Ən yaxşı köç saatı", audience: "planlaşdıran", hint: "səhər başlama, tıxac, qonşu, lift növbəsi" },
  // — komanda və proses
  { id: "crew_day", title: "Komandanın günü 07:00-da başlayır", audience: "hamı", hint: "brifinq, avadanlıq yoxlaması, marşrut" },
  { id: "crew_qa", title: "Ustadan sual-cavab", audience: "hamı", hint: "ən çox verilən 3 sual, qısa cavab" },
  { id: "disassembly", title: "Mebelin sökülüb yığılması", audience: "ailə", hint: "vint torbası, foto, eyni ustanın yığması" },
  // — müştəri anı
  { id: "last_box", title: "Son qutu düşəndə", audience: "köçən ailə", hint: "emosional payoff, yeni evdə ilk nəfəs" },
  { id: "first_home", title: "İlk ev", audience: "cavan ailə", hint: "açar, boş otaq, ilk qutu" },
  { id: "downsizing", title: "30 ildən sonra kiçik evə", audience: "yaşlı cütlük", hint: "xatirə əşyaları, hörmət, ehtiyat" },
  { id: "office", title: "Ofis köçü həftəsonu", audience: "şirkət", hint: "kabel nişanlama, monitor qutusu, bazar ertəsi start" },
  { id: "cafe", title: "Kafe avadanlığı", audience: "kiçik biznes", hint: "qəhvə maşını, vitrin, iş dayanmasın" },
  // — saxlama və marşrut
  { id: "storage", title: "Müvəqqəti saxlama", audience: "aralıq vəziyyət", hint: "köhnə ev bitdi, yeni hazır deyil" },
  { id: "regions", title: "Bakıdan rayona", audience: "rayona köçən", hint: "uzun yol, kəmər, çatdırılma vaxtı" },
  { id: "rain", title: "Yağışda köç", audience: "ailə", hint: "brezent, quru qalan əşya, döşəmə qoruyucu" },
  { id: "plants", title: "Bitkilər və akvarium", audience: "ev sahibi", hint: "su səviyyəsi, işıq, son yüklənən" },
];

/**
 * TON/janr — mövzunun ÜSTÜNDƏ işlənir, mövzunu ƏVƏZ ETMİR.
 * Yəni kadrda həmişə yük maşını, işçilər və daşınan yük var; ton yalnız danışıq tərzini dəyişir.
 */
export const TONES = [
  "sənədli film diktoru tonu (sakit, məlumatlı)",
  "idman şərhçisi həyəcanı (sürətli, emosional)",
  "nağıl/uşaq kitabı tonu (isti, sadə)",
  "təcili xəbər buraxılışı tonu (qısa, dəqiq)",
  "missiya/əməliyyat tonu (plan, addımlar, komanda)",
  "nostalji xatirə tonu (yumşaq, düşüncəli)",
  "özünə gülən yumor (relatable, isti)",
  "sakit-gözəl ASMR tonu (detal, tempo)",
] as const;

/** Son postlarda işlənən mövzular (meta.topic) */
export const usedTopics = (): string[] => {
  const out: string[] = [];
  try {
    for (const f of fs.readdirSync("content/data")) {
      if (!f.endsWith(".meta.json")) continue;
      const m = JSON.parse(fs.readFileSync(`content/data/${f}`, "utf-8"));
      if (m?.topic) out.push(String(m.topic));
    }
  } catch { /* yoxdur */ }
  return out;
};

/** Təzə mövzular — son N-də işlənənlər çıxarılır, qalanı qarışdırılır */
export const freshTopics = (n = 6, exclude: string[] = []): Topic[] => {
  const used = new Set([...usedTopics(), ...exclude]);
  let pool = TOPICS.filter((t) => !used.has(t.id));
  if (pool.length < n) pool = TOPICS.filter((t) => !exclude.includes(t.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
};

if (process.argv[1]?.replace(/\\/g, "/").endsWith("pipeline/topics.ts")) {
  const used = usedTopics();
  console.log(`İşlənmiş (${used.length}): ${[...new Set(used)].join(", ") || "—"}`);
  console.log(`\nTəzə seçim:\n${freshTopics(8).map((t) => `  ${t.id.padEnd(14)} ${t.title} — ${t.hint}`).join("\n")}`);
}
