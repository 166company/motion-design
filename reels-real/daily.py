#!/usr/bin/env python3
"""Gündəlik Yük.az Reels: video + cover + caption → GitHub `reels-drop` branch-i (YYYY-MM-DD/).

python3 daily.py day.json [--no-release]

day.json (gündəlik Claude yazır):
{
  "date": "2026-10-27",
  "style": "editorial",                       # bold_bar | editorial | condensed | card | mono | split (boşdursa avtomatik)
  "hook": "Köçürsən?",
  "lines": [["Ağır yükü", "bizə burax."], ["Ehtiyatla yükləyir,", "vaxtında çatdırırıq."], ["Sığortalı daşıma", "7/24 xidmət"]],
  "final": ["Yeni evin", "mübarək!"],
  "cover": ["Köçmək stress deyil!", "Biz daşıyaq"],
  "caption": "...",
  "prefer": ["office", "desk"]                # (istəyə görə) mövzuya uyğun klip sorğusu açar sözləri
}
Çıxış: out/<tarix>/ + out/<tarix>/meta.json (style, music, clips — history.json üçün).
"""
import datetime, json, os, random, shutil, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(HERE, *p)
REPO = "166company/motion-design"
RAW = f"https://raw.githubusercontent.com/{REPO}/reels-library/"
STYLES = ["bold_bar", "editorial", "condensed", "card", "mono", "split"]
MOODS = {"bold_bar": ["funk", "disco", "dance-pop", "upbeat"], "editorial": ["chill", "corporate", "deep-house", "cinematic"],
         "condensed": ["dance-pop", "funk", "deep-house", "hip-hop"], "card": ["corporate", "chill", "deep-house", "upbeat"],
         "mono": ["deep-house", "funk", "disco", "hip-hop"], "split": ["disco", "dance-pop", "funk", "upbeat"]}
CLIP_DAYS, MUSIC_DAYS = 10, 14   # bu qədər gün ərzində işlənmiş klip/musiqi təkrar seçilmir (çatmasa ehtiyat)

def load_json(p, default):
    try: return json.load(open(p))
    except Exception: return default

def library():
    try:
        cat = None
        for i in range(4):
            try:
                cat = json.load(urllib.request.urlopen(RAW + "catalog.json", timeout=60)); break
            except Exception as e:
                if i == 3: raise
    except Exception as e:
        print("kataloq alınmadı, lokal kliplər:", e); cat = []
    review = load_json(A("clip_review.json"), {})
    out = []
    for c in cat:
        r = review.get(str(c["id"]), c.get("review", "pending"))
        if r == "bad": continue
        c["review"] = r; out.append(c)
    return out

def lib_music():
    """reels-library/music.json — GitHub Actions hər gün yeni Mixkit trekləri əlavə edir."""
    try:
        cat = json.load(urllib.request.urlopen(RAW + "music.json", timeout=60))
    except Exception as e:
        print("musiqi kataloqu yoxdur:", e); return []
    return [dict(m, lib=True) for m in cat if m.get("starts")]

def fetch(c):
    cache = A(".lib"); os.makedirs(cache, exist_ok=True)
    p = os.path.join(cache, os.path.basename(c["file"]))
    for i in range(4):
        if os.path.exists(p) and os.path.getsize(p) > 10000: break
        try:
            urllib.request.urlretrieve(RAW + c["file"], p + ".part"); os.replace(p + ".part", p)
        except Exception as e:
            print("yükləmə təkrarı", c["file"], e)
            if i == 3: raise
    return p

def best_cover(clips):
    """Cover üçün ən kəskin və yaxşı işıqlı kadrı seçir (klip başına 4 nöqtə)."""
    import numpy as np
    best = (-1, clips[0], 1.0)
    for c in clips:
        p = fetch(c)
        for f in (0.2, 0.4, 0.6, 0.8):
            t = round(c["dur"] * f, 2)
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", p, "-frames:v", "1", "-vf", "scale=270:480,format=gray",
                                  "-f", "rawvideo", "-"], capture_output=True).stdout
            if len(raw) < 270 * 480: continue
            g = np.frombuffer(raw[:270 * 480], np.uint8).reshape(480, 270).astype(np.float32)
            lap = np.abs(4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]).var()
            light = 1.0 - abs(g.mean() - 120) / 160
            sc = lap * max(light, 0.2)
            if sc > best[0]: best = (sc, c, t)
    return best[1], best[2]

def plan(day, hist):
    rnd = random.Random(day["date"] + "x")
    recent = hist[-5:]
    style = day.get("style") or rnd.choice([s for s in STYLES if s not in [h.get("style") for h in recent[-4:]]] or STYLES)
    used = set(i for h in hist[-CLIP_DAYS:] for i in h.get("clips", []))
    used_short = set(i for h in hist[-3:] for i in h.get("clips", []))
    # YALNIZ əl ilə yoxlanmış ("ok") kliplər istifadə olunur — "pending" kliplər heç vaxt videoya düşmür.
    lib = [c for c in library() if c["review"] == "ok"]
    prefer = [w.lower() for w in day.get("prefer", [])]   # günün mövzusuna uyğun klip sorğusu açar sözləri
    taken = set()
    def pick(roles, n):
        cand = [c for c in lib if c["role"] in roles and c["id"] not in taken]
        def score(c):
            q = c.get("query", "").lower()
            return (0 if c["id"] not in used_short else 1,                 # son 3 gündə işlənməyənlər
                    0 if any(w in q for w in prefer) else 1,             # mövzuya uyğun olanlar əvvəl
                    0 if c["id"] not in used else 1, rnd.random())
        cand.sort(key=score); out = cand[:n]
        if len(out) < n: raise SystemExit(f"'ok' klip çatmır ({roles}): review.py ilə yeni klipləri yoxla")
        taken.update(c["id"] for c in out); return out
    hook = pick(("hook",), 1); acts = pick(("action", "hook"), 10 if style == "split" else 5); end = pick(("ending",), 1)
    rnd.shuffle(acts)
    beats = [4] + [rnd.choice([3, 4]) for _ in range(5)] + [5]
    clips = hook + acts[:5] + end
    segs = []
    for i, (c, b) in enumerate(zip(clips, beats)):
        span = max(0.0, c["dur"] - b * 0.5 - 0.5)
        t_in = round(rnd.uniform(0.2, min(span, 4.0)), 2) if span > 0.3 else 0.0
        c2 = acts[5 + (i % 5)] if style == "split" and len(acts) > 5 else (acts[(i + 1) % len(acts)] if style == "split" else None)
        segs.append([fetch(c), t_in, b, fetch(c2) if c2 else None])
    starts = []; acc = 0
    for s in segs: starts.append(acc); acc += s[2]
    L = day["lines"]
    caps = [[0.35, beats[0] - 0.35, [[day["hook"], "main"]]]]
    for (a, b), ln, k in zip([(1, 2), (3, 4), (5, 5)], L, range(3)):
        rows = [[ln[0], "accent"]] + ([[ln[1], "sub" if k == 2 else "main"]] if len(ln) > 1 else [])
        caps.append([starts[a] + 0.3, starts[b] + segs[b][2] - 0.4, rows])
    fi = len(segs) - 1
    caps.append([starts[fi] + 0.4, starts[fi] + segs[fi][2] - 0.4, [[day["final"][0], "main"], [day["final"][1], "accent"]]])
    music = load_json(A("music.json"), []) + lib_music()
    used_m = [h.get("music") for h in hist[-MUSIC_DAYS:]]
    cand = ([m for m in music if m["genre"] in MOODS[style] and m["file"] not in used_m]
            or [m for m in music if m["file"] not in used_m]
            or [m for m in music if m["file"] not in used_m[-4:]] or music)
    fresh = [m for m in cand if m.get("lib")]
    m = rnd.choice(fresh if fresh and rnd.random() < 0.6 else cand)   # yeni treklərə bir az üstünlük
    mfile = fetch(m) if m.get("lib") else m["file"]
    cfg = {"style": style, "music": {"file": mfile, "start": rnd.choice(m["starts"]), "beat": m["beat"]},
           "segments": segs, "captions": caps, "end_beats": 8, "phone": "050 209 62 99", "site": "yuk.az",
           "price_line": "Bakı daxili 20 AZN-dən", "tagline": "Yükdaşıma xidməti"}
    cov, ct = best_cover(hook + acts[:5])
    return cfg, (fetch(cov), ct), {"style": style, "music": m["file"], "clips": [c["id"] for c in clips]}

def main():
    day = json.load(open(sys.argv[1]))
    date = day.get("date") or datetime.date.today().isoformat()
    hist = [h for h in load_json(A("history.json"), []) if h.get("date") != date]   # eyni günün təkrar renderi özünü saymasın
    out = A("out", date); os.makedirs(out, exist_ok=True)
    cfg, cov, meta = plan(day, hist)
    cfgp = os.path.join(out, "plan.json"); json.dump(cfg, open(cfgp, "w"), ensure_ascii=False, indent=1)
    video = os.path.join(out, f"yukaz_reel_{date}.mp4")
    cover = os.path.join(out, f"yukaz_cover_{date}.jpg")
    capt = os.path.join(out, f"yukaz_caption_{date}.txt")
    subprocess.run([sys.executable, A("engine.py"), cfgp, video], check=True)
    subprocess.run([sys.executable, A("cover.py"), cfg["style"], cov[0], str(cov[1]), day["cover"][0], day["cover"][1], cover], check=True)
    open(capt, "w", encoding="utf-8").write(day["caption"].strip() + "\n")
    json.dump(meta, open(os.path.join(out, "meta.json"), "w"), ensure_ascii=False)
    print(f"stil: {meta['style']}, musiqi: {meta['music']}, video {os.path.getsize(video) / 1e6:.1f} MB -> {out}")
    if "--no-release" in sys.argv: return
    tmp = tempfile.mkdtemp()
    g = lambda *a: subprocess.run(["git", "-C", tmp, *a], check=True)
    g("init", "-q", "-b", "reels-drop"); g("remote", "add", "origin", f"https://github.com/{REPO}")
    os.makedirs(os.path.join(tmp, date))
    for f in (video, cover, capt): shutil.copy(f, os.path.join(tmp, date))
    open(os.path.join(tmp, "README.md"), "w").write("# Yük.az gündəlik Reels çıxışı\nHər gün yenidən yazılır. Drive-a Apps Script köçürür.\n")
    g("add", "."); g("-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", f"Reels {date}")
    g("push", "-q", "-f", "origin", "reels-drop")
    print("pushed: reels-drop/" + date)

if __name__ == "__main__":
    main()
