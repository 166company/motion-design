/**
 * Mövzu bankı — "hər dəfə eyni lift/qutu zarafatı" problemini kökündən həll edir.
 *
 * Hər postun mövzusu buradan seçilir: son postlarda işlənənlər ÇIXARILIR (content/data/ideas-history.json),
 * qalanlardan təsadüfi 6-sı modelə verilir və o birini seçir. Mövzu meta-da saxlanılır → növbəti dəfə bloklanır.
 * Bank təkcə "köç dramı" deyil: müxtəlif auditoriya, mövsüm, əşya növü, emosiya və janr.
 */
import fs from "node:fs";

export type Topic = { id: string; title: string; audience: string; hint: string };

export const TOPICS: Topic[] = [
  // — qeyri-adi yüklər
  { id: "piano", title: "Pianonun köçü", audience: "musiqi ailəsi", hint: "ağır, kövrək, dar pilləkən — amma sonda yeni evdə ilk akkord" },
  { id: "aquarium", title: "Akvarium daşınması", audience: "ev sahibi", hint: "balıqlar da köçür; su, tarazlıq, ehtiyatlı sürücülük" },
  { id: "cat", title: "Pişik köçə necə baxır", audience: "heyvan sahibi", hint: "pişik qutunun içində 'nəzarətçi' kimi; əşyanın gözü ilə yumor" },
  { id: "plants", title: "Ev bitkiləri karvanı", audience: "bitki həvəskarı", hint: "nəhəng monstera, kaktus, yaşıl otaq — hər biri ayrı 'sərnişin'" },
  { id: "gym", title: "Ev idman avadanlığı", audience: "idmançı", hint: "ştanq, qaçış yolu — 'ən ağır çəki bizdə'" },
  { id: "vinyl", title: "Vinil və kitab kolleksiyası", audience: "kolleksiyaçı", hint: "qutular ağır, dəyər böyük; nizam və nömrələmə" },
  { id: "art", title: "Rəsm və güzgü daşınması", audience: "sənət sahibi", hint: "kövrək, bahalı; köpüklü qablaşdırma və sığorta" },
  { id: "fridge", title: "Soyuducu 9-cu mərtəbədən", audience: "ailə", hint: "texnika, kəmər, ehtiyatlı enmə" },
  // — insan hekayələri
  { id: "student", title: "Tələbənin ilk mənzili", audience: "tələbə", hint: "az əşya, çox həyəcan; büdcə və sürət" },
  { id: "newlyweds", title: "Yeni ailə, yeni ev", audience: "cavan ailə", hint: "hədiyyələr, çay dəsti, iki evdən bir ev" },
  { id: "grandma", title: "Nənənin xalçaları", audience: "böyük ailə", hint: "xatirə əşyaları, hörmət, ehtiyat" },
  { id: "baby", title: "Körpə otağı köçür", audience: "yeni valideyn", hint: "səssiz, təmiz, sürətli — uşaq yatır" },
  { id: "student_back", title: "Semestr sonu: yataqxanadan evə", audience: "tələbə", hint: "mövsümi axın, çantalar, avtobus əvəzinə maşın" },
  // — biznes
  { id: "office", title: "Ofis köçü həftəsonu", audience: "şirkət", hint: "kabellər, monitorlar, bazar ertəsi işləməlidir" },
  { id: "cafe", title: "Kafe avadanlığı", audience: "kiçik biznes", hint: "qəhvə maşını, soyuducu vitrin, iş dayanmasın" },
  { id: "shop", title: "Mağaza anbarı", audience: "satıcı", hint: "rəf, qutu, inventar; sayım və nizam" },
  { id: "startup", title: "Coworking-dən öz ofisə", audience: "startap", hint: "böyümə hekayəsi, 5 stul → 20 stul" },
  // — marşrut / coğrafiya
  { id: "regions", title: "Bakıdan rayona", audience: "rayona köçən", hint: "uzun yol, dağ yolu, çatdırılma vaxtı" },
  { id: "village", title: "Kənddən şəhərə", audience: "yeni bakılı", hint: "tərs istiqamət: kənddən şəhərə ilk gün" },
  { id: "abroad", title: "Konteyner: ölkədən ölkəyə", audience: "xaricə köçən", hint: "sənəd, siyahı, uzun səfər" },
  { id: "intercity", title: "Gecə marşrutu", audience: "yük sahibi", hint: "gecə yolu, sakit şəhər, səhər çatır" },
  // — mövsüm və hava
  { id: "rain", title: "Yağışda köç", audience: "ailə", hint: "brezent, ehtiyat, quru qalan əşyalar" },
  { id: "snow", title: "Qarlı gündə daşınma", audience: "ailə", hint: "sürüşkən yol, isti çay, planlı iş" },
  { id: "summer", title: "İyul istisində köç", audience: "ailə", hint: "kölgə, su, səhər tezdən başlamaq" },
  { id: "autumn", title: "Payızda kirayə dəyişmək", audience: "kirayənişin", hint: "mövsümi köç dalğası, yarpaq, yeni başlanğıc" },
  // — janr / format oyunu
  { id: "heist", title: "Soyğunçu filmi parodiyası", audience: "hamı", hint: "planlaşdırma səhnəsi, taymer, 'komanda toplanır' — amma bu qanuni köçdür" },
  { id: "nature_doc", title: "Təbiət sənədli filmi", audience: "hamı", hint: "diktor tonu: 'burada nadir Bakı köçkününü müşahidə edirik'" },
  { id: "sport", title: "Final matçı şərhi", audience: "hamı", hint: "idman şərhçisi, təkrar, 'qol!' anı" },
  { id: "space", title: "Kosmik missiya", audience: "hamı", hint: "start geri sayımı, 'yük orbitə çıxdı'" },
  { id: "cooking", title: "Yemək şousu resepti", audience: "hamı", hint: "'köçün resepti: 1 zəng, 0 əsəb'" },
  { id: "weather", title: "Hava proqnozu buraxılışı", audience: "hamı", hint: "'sabah qutu yağışı, axşama doğru nizam'" },
  { id: "news", title: "Təcili xəbər buraxılışı", audience: "hamı", hint: "ekran altı lent, müxbir, 'hadisə yerindən'" },
  { id: "game", title: "Video oyun səviyyəsi", audience: "gənc", hint: "level 1-4, 'boss: divan', can göstəricisi" },
  { id: "museum", title: "Muzey audio-bələdçisi", audience: "hamı", hint: "eksponat: 'köhnə divan, XXI əsr'" },
  // — faydalı / izahedici
  { id: "checklist", title: "Köçdən 3 gün əvvəl", audience: "planlaşdıran", hint: "addım-addım hazırlıq, saxlanılası siyahı" },
  { id: "packing", title: "Qablaşdırma sənəti", audience: "özü yığan", hint: "lent, köpük, nişanlama — peşəkar üsul" },
  { id: "insurance", title: "Sığorta necə işləyir", audience: "ehtiyatlı müştəri", hint: "nə əhatə olunur, niyə rahatdır" },
  { id: "price", title: "Qiymət nədən asılıdır", audience: "qiymət soruşan", hint: "həcm, mərtəbə, məsafə, lift — rəqəmsiz izah" },
  { id: "timing", title: "Ən yaxşı köç saatı", audience: "planlaşdıran", hint: "tıxac, qonşu, lift növbəsi" },
  { id: "elevator", title: "Liftsiz bina taktikası", audience: "köhnə bina sakini", hint: "kəmər, növbə, komanda işi" },
  { id: "storage", title: "Müvəqqəti saxlama", audience: "aralıq vəziyyət", hint: "köhnə ev bitdi, yeni hazır deyil" },
  { id: "disassembly", title: "Mebelin sökülüb yığılması", audience: "ailə", hint: "vintlər, çertyoj, 'artıq vint qalmadı'" },
];

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
