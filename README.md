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

| Xidmət | Aylıq |
|---|---|
| OpenAI — ssenari + səs + Whisper | ~2–3 $ |
| Pexels, Audius, Iconify, GitHub, Meta | 0 $ |
| **Cəmi** | **~2–3 $** |

Heç bir xidmət bank kartı tələb etmir (OpenAI istisna — o, artıq mövcuddur).

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
| **✏️ Dəyişiklik** | Hazır Issue açır; nə dəyişməli olduğunu sərbəst yaz. Qeyd ssenari modelinə ötürülür, video **yenidən istehsal olunur**, Release əvəz olunur, panel yenilənir. Son qeyd kartda görünür. |
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

## Səs

**Default: OpenAI `gpt-4o-mini-tts`** ([pipeline/tts_openai.py](pipeline/tts_openai.py)) —
`instructions` ilə təbii, canlı intonasiya. Söz vaxtı vermir, ona görə Whisper
bizim mətni `prompt` kimi alıb audio ilə hizalayır; sözlər difflib ilə uyğunlaşdırılır.
Xərc ≈ 1 sent/video.

| Dəyişən | Default | Qeyd |
|---|---|---|
| `TTS_ENGINE` | `openai` | `edge` → pulsuz edge-tts (robotvari, amma 0 $) |
| `OPENAI_TTS_VOICE` | `marin` | `coral`, `cedar`, `ash` da yoxlanıb |
| `OPENAI_TTS_SPEED` | `1.1` | 1.0-da video 33 saniyə çıxırdı |
| `TTS_VOICE` | `az-AZ-BanuNeural` | yalnız edge rejimi üçün |

GitHub-da `Variables` bölməsindən, lokal `.env`-dən dəyişilir.

## İki şablon

| Şablon | Nə | Mənbə | Nə vaxt |
|---|---|---|---|
| **TipList** | Məqalə əsaslı nömrələnmiş məsləhətlər, stok video fonlu | yuk.az məqaləsi | default |
| **Explainer** | "4 addımda daşınma" — **tam kodla çəkilmiş** animasiya: kub loqo düşür, telefon çalır, çat baloncuqları, yük maşınına qutular hoppanır, xəritədə marşrut cızılır | yuk.az faktları | növbədə hər 4-cü |
| **Story** | "Köç günü" — **AI ilə yaradılmış illüstrasiyalar** (`public/assets/`: yük maşını, qutular, daşıyıcı, telefon, bina, divan) + kod animasiyası: yeriş, parallaks, əşyaların maşına uçması, toz, kamera panı | yuk.az faktları | növbədə hər 4-cü |

Növbə: tiplist → story → tiplist → explainer → … Əl ilə: `Actions → Reels yarat → template:` `tiplist` / `explainer` / `story` (`-silent` şəkilçisi ilə səssiz — yalnız musiqi + SFX).

Assetlər [pipeline/gen_assets.py](pipeline/gen_assets.py) ilə yaranır: OpenAI `gpt-image-2.5`, "high",
3D-yə yaxın Pixar üslubu, brend paleti. 6 şəffaf obyekt (yük maşını, qutular, daşıyıcı, telefon, divan, bitki)
+ 3 fon (küçə, yeni ev, interyer, 9:16). Sərhədlər `src/assetBounds.json`-da ölçülür ki, personaj yerə otursun.
Yeni obyekt lazımdırsa: `OBJECTS`-ə bir sətir əlavə et, `python pipeline/gen_assets.py <ad>` (~0.2 $/şəkil).

Explainer-in bütün assetləri [src/components/explainer/assets.tsx](src/components/explainer/assets.tsx)-də SVG/CSS ilə çəkilib — stok yoxdur, telif yoxdur, brendin kub loqosu birbaşa "qutu"dur.

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
