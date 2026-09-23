# Yuk.az — Motion Design Agent

Həftədə 3 dəfə Instagram Reels + Facebook Reels istehsal edən avtomatik sistem.
Kontent **yuk.az saytının öz məqalələrindən** gəlir — heç nə uydurulmur.

```
yuk.az məqaləsi  →  ssenari (OpenAI)  →  səsləndirmə (OpenAI TTS + Whisper hizalama)
      →  stok video (Pexels, ffmpeg normallaşdırma)  →  ikonlar (Iconify)
      →  musiqi (Audius CC, Whisper vokal yoxlaması)  →  render (Remotion)  →  QA
      →  GitHub Release  →  panel  →  təsdiq / dəyişiklik / sil  →  Instagram + Facebook
```

Server yoxdur. Hər şey GitHub Actions-da işləyir.

---

## Xərc

**Keyfiyyət birinci: OpenAI ƏSAS provayderdir**, pulsuzlar yalnız ehtiyat (`LLM_ENGINE=openai-first`, `TTS_ENGINE=openai-first`, `IMAGE_ENGINE=openai`).

| Xidmət | Aylıq |
|---|---|
| OpenAI — mətn/JSON (ssenari, konsept, caption, plan, analitika) | ~3–8 $ |
| OpenAI — səs (`gpt-4o-mini-tts` + Whisper hizalaması) | ~1 sent/video |
| OpenAI — şəkil (`gpt-image`, poster/karusel/Story assetləri) | ~0.2 $/şəkil |
| NVIDIA, Gemini, Groq, Cerebras, GitHub Models, OpenRouter, edge-tts — **yalnız ehtiyat** | 0 $ |
| Pexels, Audius, Iconify, GitHub, Meta | 0 $ |
| **Cəmi** | **şəkil sayından asılı — hazırkı cədvəldə ~40–60 $** |

Ehtiyat provayderlərin heç biri bank kartı tələb etmir; OpenAI ödənişlidir və əsas yoldur.

---

## Quraşdırma

### 1. Repo

```bash
git init
git add .
git commit -m "ilk quraşdırma"
git branch -M main
git remote add origin https://github.com/166company/motion-design.git
git push -u origin main
```

> Repo **public** olmalıdır. Instagram videonu ictimai HTTPS linkdən yükləyir;
> private repo-nun Release faylları token tələb edir və Instagram onları görə bilmir.
> Açarlar repoda deyil, GitHub Secrets-də saxlanır.

### 2. GitHub Secrets

`Settings → Secrets and variables → Actions → New repository secret`

| Ad | Dəyər |
|---|---|
| `OPENAI_API_KEY` | OpenAI açarın |
| `PEXELS_API_KEY` | pexels.com/api-dan pulsuz açar |
| `META_ACCESS_TOKEN` | Business Manager → System User token |
| `META_PAGE_ID` | `1318449774679428` |
| `META_IG_USER_ID` | `17841436916284553` |
| `AUDIUS_API_TOKEN` | api.audius.co → API Bearer Token (pulsuz, kartsız) |

İstəyə görə `Variables` bölməsində:
`OPENAI_MODEL` (default `gpt-5.4-mini`), `TTS_VOICE` (default `az-AZ-BanuNeural`).

### 3. GitHub Pages (panel)

`Settings → Pages → Source: Deploy from a branch → main → /docs`

Panel: `https://166company.github.io/motion-design/`

### 4. Musiqi

Üç qatlı prioritet, hamısı avtomatik:

1. **`public/music/`** — sənin əl ilə seçdiyin `.mp3` treklər (varsa, həmişə üstündür)
2. **Audius** — [pipeline/audius.ts](pipeline/audius.ts) yalnız **CC BY / CC BY-SA /
   Public Domain** trekləri seçir; atribut caption-a avtomatik əlavə olunur
   (lisenziyanın tələbidir). Audius-dakı treklərin ~99%-i "All rights reserved"-dir
   və süzülür — bu filtri zəiflətmə.
3. **Sintez** — [pipeline/music.py](pipeline/music.py) orijinal fon yastığı,
   heç biri olmasa.

**Vokal yoxlaması avtomatikdir:** [pipeline/screen_music.py](pipeline/screen_music.py)
hər yeni trekin ilk 60 saniyəsini Whisper-ə verir; söz çıxırsa trek vokallı sayılır
və seçimdən çıxarılır (`content/data/music-screen.json`). Xərc ~0.5 sent/trek, bir dəfə.

Buna baxmayaraq bəyənmədiyin trek olsa, ID-sini `content/data/music-exclude.json`-a yaz.
Trek adı hər təsdiq Issue-sunda göstərilir.

Kataloq `content/data/audius-catalog.json`-da 7 gün keşlənir.

---

## Gündəlik iş

Sistem Bazar ertəsi / Çərşənbə / Cümə saat **18:30**-da (Bakı vaxtı) özü işə düşür:

1. Növbəti məqaləni seçir, ssenari yazır, səsləndirir, render edir
2. QA-dan keçirir (müddət, həcm, altyazı zonası, azərbaycan hərfləri)
3. Videonu GitHub Release-ə yükləyir
4. **Təsdiq Issue-su açır** — sənə bildiriş gedir

Paneldə hər videonun 4 düyməsi var:

| Düymə | Nə edir |
|---|---|
| **🚀 Yayımla** | Dərhal Instagram + Facebook. Bir-klik üçün bir dəfə ⚙️ Token düyməsindən GitHub fine-grained token yapışdır (Repository: motion-design, Permissions: Issues: Read and write) — token yalnız sənin brauzerində saxlanır, səhifə kodunda yoxdur. Tokensiz: hazır doldurulmuş Issue səhifəsi açılır, bir "Submit" |
| **✏️ Dəyişiklik** | Pəncərə açılır: sərbəst qeyd + **şəkil əlavə etmə** (üslub istinadı). [pipeline/interpret.ts](pipeline/interpret.ts) (gpt-5.5, görmə ilə) qeydi və şəkilləri oxuyub konkret parametrlərə çevirir: səs/səssiz, hansı səs, şablon, musiqi ovqatı (gümrah/sakit/yox), mətn qeydi, vizual qeyd, yenilənməli assetlər. Issue-da "🧠 Belə başa düşdüm: …" yazır, sonra yenidən istehsal edir. Şəkillər `content/feedback/<id>/`-ə yüklənir (token: Contents write). |
| **🗑 Sil** | Release silinir, təsdiq Issue-su bağlanır, paneldən çıxır |
| **Caption kopyala** | Emoji + abzas + CTA formatlı caption, hashtag-larla |

Hamısı GitHub Issue üzərindən işləyir — server yoxdur, telefondan GitHub tətbiqi ilə də olur.
İcra edən: [.github/workflows/manage.yml](.github/workflows/manage.yml).

Etibar yaranandan sonra `create.yml`-dəki Issue addımını silib
`publish.yml`-i birbaşa çağırmaqla tam avtomatik rejimə keçmək olar.

---

## Lokal işlətmə

```bash
npm install
pip install edge-tts mutagen numpy

npx tsx pipeline/run.ts          # ssenari + səs + assetlər
npm run studio                   # Remotion Studio-da bax və düzəlt
npx remotion render src/index.ts TipList out/video.mp4 \
  --props=public/render/<ID>/props.json
npx tsx pipeline/qa.ts out/video.mp4 public/render/<ID>/props.json
```

---

## Struktur

```
src/
  brand/theme.ts        rəng, şrift, ölçü, təhlükəsiz zonalar — brend burada
  brand/fonts.ts        Inter + latin-ext (ə ğ ı ş üçün MƏCBURİ)
  components/           Caption, BackgroundMedia, IconBadge, AnimatedTitle, Overlay, CtaScene, LogoBug
  compositions/         TipList (məqalə), Explainer (kod animasiya), Story (AI illüstrasiya)
  components/explainer/ kodla çəkilmiş assetlər: Truck, Box, Road, Skyline, RingingPhone, Bubble, RouteMap
pipeline/
  wp.ts                 yuk.az WordPress REST API
  script.ts             OpenAI → strukturlu ssenari
  tts_openai.py         OpenAI TTS + Whisper hizalama (default)
  tts.py                edge-tts (pulsuz alternativ)
  sfx.py                səs effektləri sintezatoru
  assets.ts             Pexels portret video
  run.ts                TipList zənciri
  explainer.ts          Explainer zənciri
  story.ts              Story zənciri
  audio.ts              ortaq: TTS, normallaşdırma, musiqi seçimi
  qa.ts                 render sonrası yoxlamalar
  audius.ts             Audius — CC lisenziyalı musiqi + atribut
  screen_music.py       Whisper ilə vokal yoxlaması
  music.py              orijinal fon musiqisi sintezatoru
  publish.ts            Meta Graph API
  panel.ts              docs/data.json
docs/                   statik panel (GitHub Pages)
```

---

## Vacib qaydalar

**Qiymət rəqəmi yazılmır.** yuk.az məqalələrində konkret məbləğ yoxdur, çünki
qiyməti operator telefonda deyir. Ssenari promptu bunu qadağan edir — pozma.

**`Yukaz` yalnız səsləndirmə üçündür.** TTS `Yuk.az`-ı "Yuk" + "az-da" kimi ayrı
oxuyur. Kod avtomatik çevirir: ekranda və caption-da həmişə `Yuk.az`.

**UTF-8.** Windows-da Python default `cp1252` işlədir və `ı` hərfini sındırır.
Bütün fayl əməliyyatlarında `encoding="utf-8"`, mühitdə `PYTHONUTF8=1`.

**Rəqəmlər səsdə.** TTS rəqəmi ingiliscə oxuyur ("three"). [pipeline/az_numbers.py](pipeline/az_numbers.py)
səsləndirmədən əvvəl hamısını azərbaycan sözünə çevirir: `3` → üç, `4-cü` → dördüncü, `050 209 62 99` →
"sıfır əlli, iki yüz doqquz, altmış iki, doxsan doqquz", `25%` → iyirmi beş faiz.

**Şrift subset-i.** `latin-ext` olmasa `ə ğ ı ş` hərfləri kvadrat kimi görünür.

**Təhlükəsiz zonalar.** Real Instagram ekranından ölçülüb: yuxarı 320px ("Reels/Friends"),
aşağı 440px (ad + caption), yanlar 140px (hündür ekranlarda kəsilmə), altyazı eni ≤ 640px
(sağ ikon sütunu). `theme.ts`-dəki `safeArea` — bütün şablonlar buradan oxuyur.

**Remotion lisenziyası.** 3 nəfərdən böyük şirkətlər üçün company license tələb olunur.

---

## Kontent strategiyası — Ootto Content Skills inteqrasiyası

[Ootto-AI/claude-content-skills](https://github.com/Ootto-AI/claude-content-skills) (MIT, 50 skill) layihəyə iki qatda daxil edilib:

**1. Claude Code-da birbaşa** — `.claude/skills/` (bütün 50 skill). Bu qovluqda Claude Code açıb `/viral-hook-writer`, `/going-viral`, `/content-calendar`, `/competitor-teardown`, `/reel-analyzer` və s. yazmaq kifayətdir.

**2. Pipeline-ın içində (avtomatik, OpenAI ilə)** — `pipeline/skills.ts` SKILL.md playbook-larını oxuyub hər şablonun sistem promptuna qoşur:

| Harada | Skill-lər | Nə edir |
|---|---|---|
| `script.ts` (TipList) | going-viral, viral-hook-writer, reel-scripter, on-screen-text-writer, cta-writer | 10 hook-dan ən güclüsü + 3 A/B alternativ (`meta.hookAlternatives`), 4-hissəli struktur, səssiz oxunan ekran mətni, BİR CTA |
| `explainer.ts`, `story.ts` | going-viral, reel-builder, story-sequencer, on-screen-text-writer | beat-by-beat, hər sətrə vizual, tap-through arkı |
| `carousel.ts` | carousel-builder, viral-hook-writer, going-viral | slayd 1 < 8 söz, hər slayd 1 fikir |
| `poster.ts` | viral-hook-writer, cta-writer, trend-spotter | bucaq rotasiyası, real trend uyğunluğu |
| `copy.ts` (hamısı) | caption-and-hashtags, hashtag-keyword-research, cta-writer | caption-ın ilk sətri 2-ci hook; caption-da 2-3 hashtag, **12-15 pilləli hashtag + sual ilk şərhə** (`meta.firstComment`, `publish.ts` yayımdan sonra yazır) |
| `analytics.ts` (həftəlik) | analytics-readout, hook-mining, content-audit, ai-brain | Instagram insights (baxış/əhatə/saxlama/paylaşım) → `content/analytics.json`; sadə dillə həftəlik hesabat (Issue "📊"); **yaddaş** `content/brain.md` — qalib hook-lar və qaydalar, sonrakı bütün promptlara "YADDAŞ" kimi gedir |
| `calendar.ts` (həftəlik) | content-calendar, content-pillar-builder, series-planner, best-time-scheduler | 2 həftəlik plan `content/calendar.json`: sütunlar, seriyalar, hər slot üçün şablon/məqsəd/bucaq/hook; `create.yml` video günlərində şablonu, `run.ts` məqaləni plandan götürür; paneldə "📅 Kontent planı" |
| `comments.ts` (saatlıq) | comment-responder, dm-script-writer | cavabsız şərhlərə isti, linksiz cavab; lead-lər `content/data/comments.json`. **Default önizləmə** — göndərmək üçün repo Variables-də `AUTO_REPLY=1` |

**going-viral strategiyası** hər post üçün deterministik rotasiya ilə seçilir (`skills.ts → strategyFor`): məqsəd SAVE → SHARE → FOLLOW → LEAD, bucaq nəticə/necə/əks-fikir/POV/nömrəli/səhv/sual; plan varsa slotun məqsədi üstündür. Paneldə hər kartda "🎯 SHARE · sual" pill-i, yayımlananlarda ▶ 👥 🔖 ↗ ❤ 💬 rəqəmləri.

Workflow: `weekly.yml` — B.e. 06:00 UTC analitika + yaddaş + plan + hesabat Issue; hər saat `:17` şərhlər.

## Pulsuz API qatı — public-apis kataloqu, Instagram-təhlükəsiz musiqi, "Showcase" videosu

**Kataloq** — [pipeline/apis.ts](pipeline/apis.ts): `github.com/public-apis/public-apis` README-si oxunur, süzülür və rollara bölünür.
`npx tsx pipeline/apis.ts --check` → `content/free-apis.json` (1888 API, 684-ü bizim rollara uyğun) + `out/free-apis.md` + açarsız API-lərin canlı yoxlanışı.

| Rol | İşlətdiyimiz |
|---|---|
| video + foto (premium stok) | **Pexels** (pulsuz açar) |
| musiqi (lisenziyası təmiz) | **Openverse** (CC0/BY), **ccMixter**, **Audius** — hamısı açarsız oxuma |
| trend siqnalı | **iTunes Search**, **Deezer chart** — açarsız (yalnız siqnal, audio istifadə olunmur) |
| real data | **Open-Meteo** (Bakı 7 gün), **Nager.Date** (AZ bayramları) — açarsız |
| ikon / şrift | **Iconify**, **Google Fonts** |
| məzmun | **yuk.az WordPress REST** |

**Musiqi** — [pipeline/music_web.ts](pipeline/music_web.ts). Dürüst qayda: Instagram çartındakı hit mahnı biznes hesabında
API ilə yüklənən videoya qoşula bilməz (Meta hüquq sistemi susdurur). Ona görə: **trend janr** webdən oxunur
(`npx tsx pipeline/music_web.ts trends` — iTunes buraxılış tezliyi + Deezer chart), sonra həmin janrda **CC0/BY**
lisenziyalı, **instrumental** trek axtarılır (`find`), Groq Whisper ilə vokal yoxlanır. NC/ND lisenziyalar bloklanır.

**Showcase şablonu** — [pipeline/showcase.ts](pipeline/showcase.ts) + [src/compositions/Showcase.tsx](src/compositions/Showcase.tsx):
**OpenAI istifadə etmir**. Ssenari pulsuz LLM-lərdən (`LLM_ENGINE=free`), kadrlar Pexels-dən (hər səhnəyə fərqli sorğu),
musiqi yuxarıdakı axtarışdan, rəqəmlər canlı API-dən (ekranda "Mənbə: Open-Meteo · Bakı, 7 gün" krediti ilə).
Vizual: brend çərçivəsi, maska ilə açılan kinetik tipoqrafiya, data rozetkaları, kamera hərəkətləri.

```bash
npx tsx pipeline/showcase.ts                     # SHOWCASE_ANGLE=hava|bayram
npx remotion render src/index.ts Showcase out/<id>.mp4 --props=public/render/<id>/props.json
```

**Tarix sıralaması və filtr:** panel girişləri `createdAt`-a görə (ən yenisi yuxarıda) sıralanır; paneldə
📅 tarix zolağı var — Hamısı / Bu gün / 7 gün / 30 gün + əl ilə tarix aralığı.

## Səs

**Default: OpenAI `gpt-4o-mini-tts`** ([pipeline/tts_openai.py](pipeline/tts_openai.py)) — `instructions` ilə təbii, canlı intonasiya
("Language: AZERBAIJANI … NOT Turkish"). Söz vaxtı vermir, ona görə Whisper bizim mətni `prompt` kimi alıb audio ilə hizalayır;
sözlər difflib ilə uyğunlaşdırılır. Xərc ≈ 1 sent/video.
**Ehtiyat:** səhnə OpenAI-də alınmasa (kvota/şəbəkə) həmin səhnə avtomatik pulsuz edge-tts az-AZ ilə səslənir ([pipeline/tts.py](pipeline/tts.py)).

| Dəyişən | Default | Qeyd |
|---|---|---|
| `TTS_ENGINE` | `openai-first` | OpenAI → xətada edge-tts · `openai` (ehtiyatsız) · `edge` (yalnız pulsuz) · `auto` (əvvəl edge) |
| `OPENAI_TTS_VOICE` | `marin` | `coral`, `cedar`, `ash` da yoxlanıb |
| `OPENAI_TTS_SPEED` | `1.1` | 1.0-da video 33 saniyə çıxırdı |
| `TTS_VOICE` | `rotate` | yalnız edge yolunda: `az-AZ-BanuNeural` / `az-AZ-BabekNeural` |

GitHub-da `Variables` bölməsindən, lokal `.env`-dən dəyişilir.

## İki şablon

| Şablon | Nə | Mənbə | Nə vaxt |
|---|---|---|---|
| **TipList** | Məqalə əsaslı nömrələnmiş məsləhətlər, stok video fonlu | yuk.az məqaləsi | default |
| **Explainer** | "4 addımda daşınma" — **tam kodla çəkilmiş** animasiya: kub loqo düşür, telefon çalır, çat baloncuqları, yük maşınına qutular hoppanır, xəritədə marşrut cızılır | yuk.az faktları | növbədə hər 4-cü |
| **Story** | "Köç günü" — **AI ilə yaradılmış illüstrasiyalar** (`public/assets/`: yük maşını, qutular, daşıyıcı, telefon, bina, divan) + kod animasiyası: yeriş, parallaks, əşyaların maşına uçması, toz, kamera panı | yuk.az faktları | növbədə hər 4-cü |

| **Carousel** | aviasales.az üslubunda hazırcavab **statik 3 slayd**: fotorealist AI foto + nəhəng mətn, cümlə sözün ortasından kəsilir (sürüşdürmə hiyləsi), 3-cü slayd narıncı punchline. Söz oyununu `gpt-5.5` yazır (tanış ifadənin köç mövzusuna çevrilməsi), bölünmə kodda. Instagram karusel + Facebook foto post kimi yayımlanır | — | növbədə hər 5-ci |

| **Poster** | **Statik post** (1080×1350), hər gün **09:00-da 3 ədəd: 2 FUN + 1 satış**. FUN: `pipeline/trends.ts` webdən bu həftənin trend meme formatlarını / relatable köç yumorunu tapır (OpenAI web_search + Imgflip format siyahısı, gündəlik keş `content/trends.json`), gpt-5.5 onu yük.az situasiyasına uyğunlaşdırır, səhnə AI ilə yenidən canlandırılır (narıncı formalı işçilər, loqolu maşın). Satış: yuk.az faktları. Yazı minimal: qısa kicker + 2-4 sözlük punchline + "Zəng et · nömrə". Layout: meme / hero / narıncı panel / qrafit kart. Instagram foto + Facebook foto | web trendləri + yuk.az | hər gün 05:00 UTC |

Növbə (video günləri): tiplist → story → carousel → tiplist → explainer → … Əl ilə: `Actions → Reels yarat → template:` `tiplist` / `explainer` / `story` (`-silent` şəkilçisi ilə səssiz — yalnız musiqi + SFX).

Assetlər [pipeline/gen_assets.py](pipeline/gen_assets.py) ilə yaranır: OpenAI `gpt-image-2.5`, "high",
3D-yə yaxın Pixar üslubu, brend paleti. 6 şəffaf obyekt (yük maşını, qutular, daşıyıcı, telefon, divan, bitki)
+ 3 fon (küçə, yeni ev, interyer, 9:16). Sərhədlər `src/assetBounds.json`-da ölçülür ki, personaj yerə otursun.
Yeni obyekt lazımdırsa: `OBJECTS`-ə bir sətir əlavə et, `python pipeline/gen_assets.py <ad>` (~0.2 $/şəkil).

Explainer-in bütün assetləri [src/components/explainer/assets.tsx](src/components/explainer/assets.tsx)-də SVG/CSS ilə çəkilib — stok yoxdur, telif yoxdur, brendin kub loqosu birbaşa "qutu"dur.

## OpenAI əsas, pulsuz provayderlər ehtiyat

**Mətn/JSON işlərinin hamısı** (ssenari, konsept, caption, plan, analitika, şərh cavabı, dəyişiklik şərhi) [pipeline/llm.ts](pipeline/llm.ts) üzərindən gedir — **OpenAI yolu da**.
Default `openai-first`: əvvəl OpenAI çağırılır — həmin faylın öz model sabiti (`gpt-5.4-mini` / `gpt-5.5`), **strict `json_schema`**, `temperature` göndərilmir (köhnə davranışın eyni).
Pulsuza yalnız texniki xətada keçilir: **429 · 5xx · kvota bitib · şəbəkə xətası · açar yoxdur**. OpenAI **400** cavabı (sxem/prompt xətası) pulsuzla maskalanmır — xəta atılır.
Ehtiyat yolda açarı olan provayderlər avtomatik qoşulur, model adları `/models` siyahısından seçilir; JSON sxemə uyğun deyilsə modeldən bir dəfə düzəliş istənir.

| Dəyişən | Default | Qeyd |
|---|---|---|
| `LLM_ENGINE` | `openai-first` | OpenAI → texniki xətada pulsuz · `openai` (ehtiyatsız) · `auto` (əvvəl pulsuz) · `free` (yalnız pulsuz) |
| `LLM_PROVIDERS` | `nvidia,gemini,groq,cerebras,github,openrouter,mistral,sambanova` | ehtiyat sırası |
| `LLM_MODEL_<PROVAYDER>_<TASK>` | — | əl ilə model, məs. `LLM_MODEL_NVIDIA_CREATIVE=deepseek-ai/deepseek-v4-flash` |
| `TTS_ENGINE` | `openai-first` | OpenAI səs+Whisper → səhnə xətasında edge-tts |
| `IMAGE_ENGINE` | `openai` | `nvidia` · `auto` (NVIDIA, xəta olsa OpenAI) |
| `NOVELTY` | `1` | `0` → "yenilik bloku" və ideya yaddaşı söndürülür |

### Alternativləri özün yoxla — `pipeline/compare.ts`

Eyni prompt və eyni JSON sxem əvvəl OpenAI, sonra hər pulsuz modellə işlədilir. **Heç nə yayımlanmır, asset/render yaranmır, ideya yaddaşına yazılmır.**

```bash
npx tsx pipeline/compare.ts carousel     # → out/compare-carousel-<tarix>.md
npx tsx pipeline/compare.ts poster|story|script
npx tsx pipeline/compare.ts tts "Köç günü dramına son"   # → out/compare-tts/openai.mp3, edge-banu.mp3, edge-babek.mp3
```
`COMPARE_LIMIT` (default 6) — neçə pulsuz model sınansın; `COMPARE_TIMEOUT_MS` (default 180000).

**Ehtiyat açarları** (hamısı pulsuz səviyyə, istəyə bağlı; `.env` və GitHub Secrets — `npx tsx pipeline/_secrets.ts 166company/motion-design`):
`NVIDIA_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `GH_MODELS_TOKEN`, `MISTRAL_API_KEY`, `SAMBANOVA_API_KEY`.
Ən azı 2-3 provayder olsun — limitlər ayrı-ayrıdır və fərqli modellər fərqli ideya verir.

**Tapşırıqlar:** `creative` (Poster, Carousel, Story, Explainer, TipList — hər dəfə FƏRQLİ model başlayır), `smart` (caption, plan, analitika, dəyişiklik şərhi), `fast` (şərh cavabı), `vision` (şəkil varsa avtomatik).

**Təkrarsız ideyalar** — [pipeline/ideas.ts](pipeline/ideas.ts):
- `content/data/ideas-history.json` — son 120 ideya; hər kreativ promptа "bunları təkrarlama" siyahısı gedir
- hər post üçün yeni **kreativ bucaq** (sənədli film diktoru, idman şərhçisi, gözlənti/reallıq, WhatsApp çatı…), **vizual istiqamət** (Swiss poster, izometrik, claymation, neon Bakı…), video üçün **motion ritmi** — son istifadə olunanlar seçilmir
- qaydalar (qiymət yox, real sitat, brend adı) bucaqdan HƏMİŞƏ üstündür; fun poster yalnız vizual istiqamət alır

**Trendlər:** əsas — OpenAI `web_search` (background rejim + sorğulama); alınmasa `GEMINI_API_KEY` varsa Gemini + Google Search.
**Musiqi vokal yoxlaması:** əsas — OpenAI `whisper-1`; alınmasa Groq Whisper (`GROQ_API_KEY`).

**Ehtiyat səs (azərbaycanca):** [pipeline/tts.py](pipeline/tts.py) — edge-tts söz vaxtlarını özü verir (Whisper lazım deyil), brend `Yük nöqtə az` və rəqəmlər (`az_numbers.py`) düzgün oxunur, 3 cəhd.
Qeyd: NVIDIA, Gemini, Groq TTS modelləri azərbaycan dilini dəstəkləmir; ElevenLabs dəstəkləyir, amma pulsuz planı kommersiya istifadəsinə icazə vermir.

```bash
npx tsx pipeline/llm.ts status   # hansı provayder/model hansı tapşırığa düşür
npx tsx pipeline/llm.ts test     # hər kreativ modeldən qısa azərbaycanca JSON cavab
```

## NVIDIA — pulsuz şəkil / motion / 3D (build.nvidia.com)

OpenAI `gpt-image` (~0.2 $/şəkil) əvəzinə və ya yanında **pulsuz** NVIDIA NIM API. Modul: [pipeline/nvidia.ts](pipeline/nvidia.ts).

**Quraşdırma:** build.nvidia.com → model (məs. FLUX.1-schnell) → *Get API Key* → `nvapi-...`
`.env`-ə `NVIDIA_API_KEY=` yaz, GitHub-da Secret kimi əlavə et (`npx tsx pipeline/_secrets.ts 166company/motion-design` avtomatik yazır).

| Dəyişən (Variables) | Default | Qeyd |
|---|---|---|
| `IMAGE_ENGINE` | `openai` | `nvidia` → yalnız NVIDIA · `auto` → NVIDIA, xəta olsa OpenAI |
| `NVIDIA_IMAGE_MODEL` | `flux.1-schnell` | `sd3.5-large` — daha detallı, yavaş |
| `NVIDIA_ALLOW_NONCOMMERCIAL` | — | `1` → `flux.1-dev` kimi qeyri-kommersiya modellər (**yalnız sınaq**) |
| `NVIDIA_MIN_GAP_MS` | `1600` | pulsuz limit ~40 sorğu/dəq |

**Harada işləyir:** `poster.ts` (səhnə), `carousel.ts` (foto), `gen_assets.py` (Story obyektləri + fonları).

**Fərqlər (bil):**
- **Loqo:** FLUX loqonu dəqiq çəkə bilmir → NVIDIA rejimində poster səhnəsi loqosuz yaranır (düz narıncı formalar). Loqolu forma vacibdirsə `IMAGE_ENGINE=openai` saxla və ya `auto`.
- **İstinad şəkil (✏️ Dəyişiklik → şəkil):** NVIDIA-da dəstəklənmir. `auto`/`openai` rejimində OpenAI-yə gedir, `nvidia` rejimində yalnız mətn işlənir.
- **Şəffaf obyekt:** NVIDIA şəffaf fon vermir → ağ fonda yaradılır, kənardan flood-fill ilə şəffaf edilir (obyektin içindəki ağ qalır).
- **Lisenziya:** yuk.az kommersiyadır. ✅ `flux.1-schnell` (Apache 2.0), ✅ `sd3.5-large` (gəlir < 1 mln $). ⛔ `flux.1-dev`, `flux.1-kontext-dev` — kod bloklayır.

**Əl ilə (CLI):**

```bash
npx tsx pipeline/nvidia_cli.ts test                                   # açarı yoxla
npx tsx pipeline/nvidia_cli.ts models                                 # modellər, lisenziyalar, formatlar
npx tsx pipeline/nvidia_cli.ts formats "movers loading a truck in Baku"   # BÜTÜN formatlar: post, square, story, carousel, landscape, blog, og, cover
npx tsx pipeline/nvidia_cli.ts image "..." --format story             # tək format
npx tsx pipeline/nvidia_cli.ts object "orange moving truck"           # şəffaf PNG asset
npx tsx pipeline/nvidia_cli.ts video out/nvidia/x.jpg                 # şəkil → 2-4 san hərəkət (SVD, eksperimental, yalnız 16:9)
npx tsx pipeline/nvidia_cli.ts 3d "cardboard moving box"              # .glb (TRELLIS)
```

Nəticələr `out/nvidia/`-də.

## Vizual sistem

- Səhnələrarası keçidlər: slide / wipe / fade (`@remotion/transitions`), hər keçiddə whoosh
- Başlıqlar söz-söz spring ilə canlanır, son söz narıncı
- Hər bənd: Lucide ikonu (Iconify, açarsız) narıncı kvadratda "pop" edir + nömrə halqası
- Fon kamerası səhnədən-səhnəyə fərqli hərəkət edir (zoom-in/out, pan, drift)
- Yuxarıda seqmentli irəliləmə çubuğu, vinyet, açılışda diaqonal narıncı süpürmə
- CTA: kub loqo fırlanaraq gəlir, "yuk.az" hərf-hərf, pill, radial parıltı, hissəciklər, riser + pop
- Səs effektləri sintez olunur ([pipeline/sfx.py](pipeline/sfx.py)) — `public/sfx/`, telif riski yoxdur

### Səviyyələr (dəyişmə, ölçülüb)

Hər mənbə mix-dən əvvəl [pipeline/loudness.py](pipeline/loudness.py) ilə normallaşdırılır:

| Mənbə | Hədəf | Qeyd |
|---|---|---|
| Səsləndirmə | −18 dBFS RMS | edge-tts xam çıxışı ~−25-dir, sosial media üçün sakitdir |
| Musiqi | −20 dBFS RMS | trekin **ən dolğun** hissəsi videonun uzunluğunda kəsilir — sakit girişlər ötürülür |
| Musiqi, səsləndirmə altında | ×0.45 (≈−27) | `musicVolume` — TipList-də ducking |
| Musiqi, CTA-da | ×0.9 (≈−21) | səsləndirmə bitəndə qalxır, son 1.3 san sönür |

Nəticə: səsləndirmə pauzalarında musiqi −27…−31 dBFS, CTA-da ≈−23.
İlk versiyada `musicVolume: 0.1` və normallaşdırmasız mənbələr −47 dBFS verirdi — praktiki səssizlik.
