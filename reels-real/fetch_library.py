#!/usr/bin/env python3
"""Pexels-dən yeni şaquli kliplər yükləyib kitabxananı genişləndirir (GitHub Actions-da işləyir).

Kitabxana `reels-library` branch-indədir: clips/*.mp4 + catalog.json.
İstifadə:  PEXELS_API_KEY=... python3 fetch_library.py <library_dir> [neçə_klip]
"""
import datetime, json, os, random, subprocess, sys, urllib.request

LIB = sys.argv[1]
WANT = int(sys.argv[2]) if len(sys.argv) > 2 else 6
MAX_CLIPS = 220
KEY = os.environ["PEXELS_API_KEY"]

# sorğu → rol (hook = açılış/qutulama, action = daşıma/yükləmə, ending = yeni ev)
QUERIES = {
    "hook": ["packing boxes", "taping cardboard box", "moving boxes stack", "wrapping furniture",
             "bubble wrap packing", "labeling moving boxes", "man holding cardboard box", "packing dishes box"],
    "action": ["movers carrying boxes", "carrying sofa", "moving furniture", "loading van boxes",
               "delivery van boxes", "hand truck boxes", "moving truck loading", "men carrying couch",
               "carrying boxes stairs", "furniture delivery", "van driving city", "moving day",
               "office moving boxes", "carrying mattress", "loading truck", "workers carrying furniture"],
    "ending": ["family new home", "couple moving into new apartment", "unpacking boxes new home",
               "keys new house", "happy couple boxes", "new apartment empty room", "family carrying boxes home"],
}
BAD_WORDS = ["fedex", "ups", "dhl", "amazon", "usps", "christmas", "halloween"]

def api(url):
    req = urllib.request.Request(url, headers={"Authorization": KEY, "User-Agent": "yukaz-reels"})
    return json.load(urllib.request.urlopen(req, timeout=60))

def best_file(v):
    files = [f for f in v.get("video_files", []) if f.get("height") and f.get("width") and f["height"] > f["width"]]
    exact = [f for f in files if f["width"] == 1080 and f["height"] == 1920]
    if exact: return exact[0]
    ok = sorted([f for f in files if 1280 <= f["height"] <= 2560], key=lambda f: -f["height"])
    return ok[0] if ok else None

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
    while len(added) < WANT and tries < 12:
        tries += 1
        role = plan[(tries - 1) % len(plan)] if tries <= 3 else rnd.choice(list(QUERIES))
        q = rnd.choice(QUERIES[role])
        page = rnd.randint(1, 4)
        try:
            res = api(f"https://api.pexels.com/videos/search?query={urllib.parse.quote(q)}&orientation=portrait&size=large&per_page=20&page={page}")
        except Exception as e:
            print("api error", q, e); continue
        vids = res.get("videos", []); rnd.shuffle(vids)
        for v in vids:
            if len(added) >= WANT: break
            if v["id"] in have or not (5 <= v.get("duration", 0) <= 40): continue
            url = (v.get("url") or "").lower()
            if any(b in url for b in BAD_WORDS): continue
            f = best_file(v)
            if not f: continue
            out = os.path.join(LIB, "clips", f"p{v['id']}.mp4")
            tmp = out + ".src.mp4"
            try:
                download(f["link"], tmp)
                ss = 0.5 if v["duration"] > 9 else 0.0
                subprocess.run(["timeout", "180", "ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-i", tmp, "-t", "10", "-an",
                                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
                                "-c:v", "libx264", "-crf", "24", "-preset", "medium", "-pix_fmt", "yuv420p", out], check=True)
            except Exception as e:
                print("skip", v["id"], e); continue
            finally:
                if os.path.exists(tmp): os.remove(tmp)
            dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                                       capture_output=True, text=True).stdout.strip() or 0)
            cat.append({"id": v["id"], "file": f"clips/p{v['id']}.mp4", "role": role, "query": q, "dur": round(dur, 2),
                        "author": (v.get("user") or {}).get("name", ""), "url": v.get("url", ""), "added": today, "review": "pending"})
            have.add(v["id"]); added.append(v["id"]); print("added", v["id"], role, q, flush=True)
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
