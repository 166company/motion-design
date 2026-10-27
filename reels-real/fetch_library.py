#!/usr/bin/env python3
"""Pexels + Pixabay-dən yeni şaquli kliplər yükləyib kitabxananı genişləndirir (GitHub Actions-da işləyir).

Kitabxana `reels-library` branch-indədir: clips/*.mp4 + catalog.json.
İstifadə:  PEXELS_API_KEY=... PIXABAY_API_KEY=... python3 fetch_library.py <library_dir> [neçə_klip]
Pixabay klipləri "x<id>" id ilə saxlanır (Pexels id-ləri ilə toqquşmasın).
"""
import datetime, json, os, random, re, sys, urllib.error, urllib.parse, urllib.request

LIB = sys.argv[1]
WANT = int(sys.argv[2]) if len(sys.argv) > 2 else 6
MAX_CLIPS = 220
KEY = os.environ.get("PEXELS_API_KEY", "")
PXB = os.environ.get("PIXABAY_API_KEY", "")
CVR = os.environ.get("COVERR_API_KEY", "")
CVR_AUTH = []   # işləyən auth üsulu (header və ya query) yadda saxlanılır

# sorğu → rol (hook = açılış/qutulama, action = daşıma/yükləmə, ending = yeni ev)
QUERIES = {
    "hook": ["packing boxes", "taping cardboard box", "moving boxes stack", "wrapping furniture",
             "bubble wrap packing", "labeling moving boxes", "man holding cardboard box", "packing dishes box",
             "stretch film wrapping", "packing books box", "folding clothes box", "tape dispenser box",
             "messy room boxes", "woman packing boxes", "packing kitchen", "closing cardboard box"],
    "action": ["movers carrying boxes", "carrying sofa", "moving furniture", "loading van boxes",
               "delivery van boxes", "hand truck boxes", "moving truck loading", "men carrying couch",
               "carrying boxes stairs", "furniture delivery", "van driving city", "moving day",
               "office moving boxes", "carrying mattress", "loading truck", "workers carrying furniture",
               "carrying piano", "carrying wardrobe", "disassembling furniture", "assembling furniture",
               "truck highway", "cargo van road", "office chairs carrying", "carrying monitor office",
               "elevator boxes", "warehouse boxes worker", "city traffic night", "truck driving night",
               "carrying table", "dolly cart boxes"],
    "ending": ["family new home", "couple moving into new apartment", "unpacking boxes new home",
               "keys new house", "happy couple boxes", "new apartment empty room", "family carrying boxes home",
               "new office team", "couple relaxing new home", "opening door apartment", "family sofa new home"],
}
BAD_WORDS = ["fedex", "ups", "dhl", "amazon", "usps", "christmas", "halloween", "santa", "covid", "mask", "coronavirus"]

def api(url):
    req = urllib.request.Request(url, headers={"Authorization": KEY, "User-Agent": "yukaz-reels"})
    return json.load(urllib.request.urlopen(req, timeout=60))

def pixabay(q, page):
    """Pixabay video axtarışı → Pexels-ə bənzər sadə siyahı (yalnız şaquli fayllar)."""
    url = (f"https://pixabay.com/api/videos/?key={PXB}&q={urllib.parse.quote(q)}&per_page=50&page={page}"
           f"&safesearch=true&video_type=film")
    req = urllib.request.Request(url, headers={"User-Agent": "yukaz-reels"})
    res = json.load(urllib.request.urlopen(req, timeout=60))
    out = []
    for h in res.get("hits", []):
        fs = [f for f in (h.get("videos") or {}).values() if f.get("url") and f.get("height", 0) > f.get("width", 0) >= 720]
        if not fs: continue
        f = min(fs, key=lambda f: abs(f["width"] - 1080))
        out.append({"id": f"x{h['id']}", "duration": h.get("duration", 0), "url": h.get("pageURL", ""),
                    "tags": h.get("tags", ""), "user": {"name": h.get("user", "")}, "_file": f})
    return out

COVERR_Q = {"hook": ["boxes", "packing", "cardboard", "moving", "tape"],
            "action": ["moving", "truck", "van", "delivery", "furniture", "carrying", "warehouse", "highway", "city night"],
            "ending": ["new home", "family home", "couple apartment", "keys", "living room", "office team"]}

def coverr_req(path, method="GET"):
    """Coverr API (api.coverr.co). Auth üsulu sənəddə dəqiq deyil — Bearer header, sonra api_key query yoxlanır."""
    modes = CVR_AUTH or ["bearer", "query"]
    err = None
    for m in modes:
        url = f"https://api.coverr.co{path}"
        h = {"User-Agent": "yukaz-reels", "Accept": "application/json"}
        if m == "bearer": h["Authorization"] = f"Bearer {CVR}"
        else: url += ("&" if "?" in url else "?") + f"api_key={CVR}"
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=h, method=method), timeout=60)
            if not CVR_AUTH: CVR_AUTH.append(m); print("coverr auth:", m, flush=True)
            body = r.read()
            return json.loads(body) if body else None
        except urllib.error.HTTPError as e:
            err = e
            if e.code not in (401, 403): raise
    raise err

def coverr(q, page):
    res = coverr_req(f"/videos?query={urllib.parse.quote(q)}&page={page}&page_size=40&urls=true")
    out = []; hits = res.get("hits", [])
    print(f"  coverr '{q}': {len(hits)} hit, {sum(1 for h in hits if h.get('is_vertical'))} şaquli, nümunə:",
          {k: hits[0].get(k) for k in ("is_vertical", "aspect_ratio", "max_width", "max_height")} if hits else None,
          "urls:", list((hits[0].get("urls") or {}).keys()) if hits else None, flush=True)
    for h in hits:
        u = (h.get("urls") or {})
        link = u.get("mp4_download") or u.get("mp4")
        if not h.get("is_vertical") or not link or (h.get("max_width") or 0) < 720: continue
        out.append({"id": f"c{h['id']}", "duration": float(h.get("duration") or 0), "url": f"https://coverr.co/videos/{h['id']}",
                    "tags": h.get("tags") or "", "user": {"name": "Coverr"}, "_file": {"url": link}, "_cid": h["id"]})
    return out

def best_file(v):
    files = [f for f in v.get("video_files", []) if f.get("height") and f.get("width") and f["height"] > f["width"]]
    exact = [f for f in files if f["width"] == 1080 and f["height"] == 1920]
    return exact[0] if exact else None

def download(url, path, limit=80_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": "yukaz-reels"})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        n = 0
        while True:
            b = r.read(1 << 20)
            if not b: break
            n += len(b); f.write(b)
            if n > limit: raise RuntimeError("fayl çox böyükdür")

def main():
    cat_path = os.path.join(LIB, "catalog.json")
    cat = json.load(open(cat_path)) if os.path.exists(cat_path) else []
    have = {c["id"] for c in cat}
    os.makedirs(os.path.join(LIB, "clips"), exist_ok=True)
    today = datetime.date.today().isoformat()
    rnd = random.Random(today)
    # rol balansı: azı olan rola üstünlük
    counts = {r: sum(1 for c in cat if c["role"] == r) for r in QUERIES}
    plan = sorted(QUERIES, key=lambda r: counts[r] / {"hook": 0.25, "action": 0.55, "ending": 0.2}[r])
    added = []
    tries = 0
    sources = [s for s, k in (("pexels", KEY), ("pixabay", PXB), ("coverr", CVR)) if k]
    if not sources: sys.exit("API açarı yoxdur (PEXELS_API_KEY / PIXABAY_API_KEY / COVERR_API_KEY)")
    while len(added) < WANT and tries < 30:
        tries += 1
        role = plan[(tries - 1) % len(plan)] if tries <= 3 else rnd.choice(["action", "action", "hook", "ending"])
        q = rnd.choice(QUERIES[role])
        src = sources[tries % len(sources)]
        try:
            if src == "pexels":
                res = api(f"https://api.pexels.com/videos/search?query={urllib.parse.quote(q)}&orientation=portrait&size=large&per_page=20&page={rnd.randint(1, 5)}")
                vids = res.get("videos", [])
            elif src == "pixabay":
                vids = pixabay(q, rnd.randint(1, 2))
            else:   # Coverr kitabxanası kiçikdir — sadə sözlər daha çox nəticə verir
                q = rnd.choice(COVERR_Q[role]); vids = coverr(q, 0)
        except Exception as e:
            print("api error", src, q, e); continue
        print(src, q, len(vids), "nəticə", flush=True)
        rnd.shuffle(vids)
        per_q = 0
        for v in vids:
            if len(added) >= WANT or per_q >= 2: break
            if v["id"] in have or not (5 <= v.get("duration", 0) <= 20): continue
            tags = v.get("tags") or ""
            tags = " ".join(map(str, tags)) if isinstance(tags, list) else str(tags)
            url = ((v.get("url") or "") + " " + tags).lower()
            if re.search(r"\b(" + "|".join(BAD_WORDS) + r")\b", url): continue
            f = v.get("_file") or best_file(v)
            if not f: continue
            fname = f"{v['id']}.mp4" if str(v["id"])[0] in "xc" else f"p{v['id']}.mp4"
            out = os.path.join(LIB, "clips", fname)
            try:
                download(f.get("link") or f["url"], out, limit=30_000_000 if v.get("_cid") else 18_000_000)
            except Exception as e:
                print("skip", v["id"], e, flush=True)
                if os.path.exists(out): os.remove(out)
                continue
            if v.get("_cid"):   # Coverr qaydası: hər yükləmə qeyd olunmalıdır
                try: coverr_req(f"/videos/{v['_cid']}/stats/downloads", method="PATCH")
                except Exception as e: print("coverr stats", e, flush=True)
            dur = float(v["duration"])
            cat.append({"id": v["id"], "file": f"clips/{fname}", "src": src, "role": role, "query": q, "dur": round(dur, 2),
                        "author": (v.get("user") or {}).get("name", ""), "url": v.get("url", ""), "added": today, "review": "pending"})
            have.add(v["id"]); added.append(v["id"]); per_q += 1; print("added", src, v["id"], role, q, flush=True)
    # limit: ən köhnə (orijinal olmayan) klipləri çıxar
    while len(cat) > MAX_CLIPS:
        old = next((c for c in cat if not c.get("keep")), None)
        if not old: break
        cat.remove(old)
        p = os.path.join(LIB, old["file"])
        if os.path.exists(p): os.remove(p)
    json.dump(cat, open(cat_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(added)} yeni klip; kitabxanada {len(cat)} klip")

if __name__ == "__main__":
    import urllib.parse
    main()
