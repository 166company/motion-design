# Yuk.az — Motion Design Agent

Həftədə 3 dəfə Instagram Reels + Facebook Reels istehsal edən avtomatik sistem.
Kontent **yuk.az saytının öz məqalələrindən** gəlir — heç nə uydurulmur.

```
yuk.az məqaləsi  →  ssenari (OpenAI)  →  səsləndirmə (edge-tts, az-AZ)
      →  stok video (Pexels)  →  render (Remotion)  →  QA
      →  GitHub Release  →  təsdiq  →  Instagram + Facebook
```

Server yoxdur. Hər şey GitHub Actions-da işləyir.

---

## Xərc

| Xidmət | Aylıq |
|---|---|
| OpenAI (ssenari) | ~1–2 $ |
| edge-tts, Pexels, GitHub, Meta | 0 $ |
| **Cəmi** | **~1–2 $** |

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

İstəyə görə `Variables` bölməsində:
`OPENAI_MODEL` (default `gpt-5.4-mini`), `TTS_VOICE` (default `az-AZ-BanuNeural`).

### 3. GitHub Pages (panel)

`Settings → Pages → Source: Deploy from a branch → main → /docs`

Panel: `https://166company.github.io/motion-design/`

### 4. Musiqi

`assets/music/` qovluğuna 10–15 trek at.
Mənbə: Instagram-ın **Sound Collection**-u (biznes hesab üçün rəsmi pulsuzdur,
telif iddiası riski yoxdur) və ya Pixabay Music.
Agent hər video üçün ordan birini seçir. Bir dəfəlik işdir.

---

## Gündəlik iş

Sistem Bazar ertəsi / Çərşənbə / Cümə saat **18:30**-da (Bakı vaxtı) özü işə düşür:

1. Növbəti məqaləni seçir, ssenari yazır, səsləndirir, render edir
2. QA-dan keçirir (müddət, həcm, altyazı zonası, azərbaycan hərfləri)
3. Videonu GitHub Release-ə yükləyir
4. **Təsdiq Issue-su açır** — sənə bildiriş gedir

Təsdiq üçün Issue-ya şərh yaz:

- `/publish` → Instagram + Facebook-a gedir
- `/skip` → yayımlanmır

Telefondan GitHub tətbiqi ilə də edə bilərsən.

Etibar yaranandan sonra `create.yml`-dəki Issue addımını silib
`publish.yml`-i birbaşa çağırmaqla tam avtomatik rejimə keçmək olar.

---

## Lokal işlətmə

```bash
npm install
pip install edge-tts mutagen

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
  components/           Caption, BackgroundMedia, NumberBadge, CtaScene, LogoBug
  compositions/         TipList — nömrələnmiş siyahı şablonu
pipeline/
  wp.ts                 yuk.az WordPress REST API
  script.ts             OpenAI → strukturlu ssenari
  tts.py                edge-tts → mp3 + söz vaxtları
  assets.ts             Pexels portret video
  run.ts                bütün zənciri birləşdirir
  qa.ts                 render sonrası yoxlamalar
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

**Şrift subset-i.** `latin-ext` olmasa `ə ğ ı ş` hərfləri kvadrat kimi görünür.

**Təhlükəsiz zonalar.** Instagram UI yuxarıdan 220px, aşağıdan 380px örtür.
`theme.ts`-dəki `safeArea` bunu idarə edir, QA yoxlayır.

**Remotion lisenziyası.** 3 nəfərdən böyük şirkətlər üçün company license tələb olunur.

---

## Səs

`az-AZ-BanuNeural` (qadın) və `az-AZ-BabekNeural` (kişi).
Dəyişmək üçün: GitHub `Variables → TTS_VOICE`, lokal üçün `.env`.
Sürət `TTS_RATE` ilə (default `+8%` — reels ritmi üçün).
