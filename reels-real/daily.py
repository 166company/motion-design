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
  "caption": "..."
}
Çıxış: out/<tarix>/ + out/<tarix>/meta.json (style, music, clips — history.json üçün).
"""
import datetime, json, os, random, shutil, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(HERE, *p)
REPO = "166company/motion-design"
RAW = f"https://raw.githubusercontent.com/{REPO}/reels-library/"
STYLES = ["bold_bar", "editorial", "condensed", "card", "mono", "split"]
MOODS = {"bold_bar": ["funk", "disco", "dance-pop"], "editorial": ["chill", "corporate", "deep-house"],
         "condensed": ["dance-pop", "funk", "deep-house"], "card": ["corporate", "chill", "deep-house"],
         "mono": ["deep-house", "funk", "disco"], "split": ["disco", "dance-pop", "funk"]}

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

def plan(day, hist):
    rnd = random.Random(day["date"] + "x")
    recent = hist[-5:]
    style = day.get("style") or rnd.choice([s for s in STYLES if s not in [h.get("style") for h in recent[-4:]]] or STYLES)
    used = set(i for h in hist[-3:] for i in h.get("clips", []))
    lib = library()
    def pick(role, n):
        pool = [c for c in lib if c["role"] == role and c["id"] not in used and c["review"] == "ok"]
        pool += [c for c in lib if c["role"] == role and c["id"] not in used and c["review"] != "ok"]
        if len(pool) < n: pool += [c for c in lib if c["role"] == role and c not in pool]
        rnd.shuffle(pool); return pool[:n]
    hook = pick("hook", 1); acts = pick("action", 10 if style == "split" else 5); end = pick("ending", 1)
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
    music = load_json(A("music.json"), [])
    used_m = [h.get("music") for h in hist[-4:]]
    cand = [m for m in music if m["genre"] in MOODS[style] and m["file"] not in used_m] or [m for m in music if m["file"] not in used_m] or music
    m = rnd.choice(cand)
    cfg = {"style": style, "music": {"file": m["file"], "start": rnd.choice(m["starts"]), "beat": m["beat"]},
           "segments": segs, "captions": caps, "end_beats": 8, "phone": "050 209 62 99", "site": "yuk.az",
           "price_line": "Bakı daxili 20 AZN-dən", "tagline": "Yükdaşıma xidməti"}
    cov = rnd.choice(hook + acts[:5])
    return cfg, (fetch(cov), min(1.5, cov["dur"] / 2)), {"style": style, "music": m["file"], "clips": [c["id"] for c in clips]}

def main():
    day = json.load(open(sys.argv[1]))
    date = day.get("date") or datetime.date.today().isoformat()
    hist = load_json(A("history.json"), [])
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
