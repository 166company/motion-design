#!/usr/bin/env python3
"""Gündəlik Yük.az Reels: video + cover + caption → GitHub `reels-drop` branch-i (YYYY-MM-DD/).

python3 daily.py day.json [--no-release]

day.json (gündəlik Claude tərəfindən yazılır):
{
  "date": "2026-10-27",
  "hook": "Köçürsən?",                       # ilk kadr, böyük
  "lines": [["Ağır yükü", "bizə burax."],    # 3 orta mətn (hər biri 1-2 sətir; 1-ci sətir narıncı zolaqlı)
            ["Ehtiyatla yükləyir,", "vaxtında çatdırırıq."],
            ["Sığortalı daşıma", "2020-dən bəri"]],
  "final": ["Yeni evin", "mübarək!"],        # son kadr (2-ci sətir narıncı zolaqlı)
  "cover": ["Köçmək stress deyil!", "Biz daşıyaq"],
  "caption": "....tam caption mətni...."
}
"""
import datetime, json, os, random, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(HERE, *p)
REPO = "166company/motion-design"

# Klip kataloqu: [fayl, rol, mümkün giriş saniyələri]
CLIPS = [
    ["clips/c01.mp4", "hook",   [0.3, 3.0]],   # qutunu skotçla bağlayır
    ["clips/c12.mp4", "hook",   [0.8, 2.0]],   # qutu ilə kameraya baxır
    ["clips/c02.mp4", "action", [0.4, 2.2, 4.6]],  # qutular daşınır
    ["clips/c03.mp4", "action", [0.6, 3.5]],   # divan qapıdan çıxır
    ["clips/c04.mp4", "action", [1.0, 4.0]],   # divan qaldırılır
    ["clips/c05.mp4", "action", [1.0, 6.0]],   # araba ilə qutular furqona
    ["clips/c06.mp4", "action", [1.5, 6.0]],   # qutular furqona yüklənir
    ["clips/c10.mp4", "ending", [3.0, 7.0]],   # ailə yeni evə girir
    ["clips/c11.mp4", "ending", [1.0, 4.5]],   # ailə qutularla
]
MUSIC = [
    {"music": "assets/music/mixkit-dance-like-theres-no-tomorrow-1095.mp3", "music_start": 13.37, "beat": 0.4763},
    {"music": "assets/music/mixkit-dance-like-theres-no-tomorrow-1095.mp3", "music_start": 29.09, "beat": 0.4763},
    {"music": "assets/music/mixkit-sounds-good-1077.mp3", "music_start": 44.05, "beat": 0.5031},
    {"music": "assets/music/mixkit-sounds-good-1077.mp3", "music_start": 52.06, "beat": 0.5031},
]

def plan(day):
    rnd = random.Random(day["date"])
    hook = rnd.choice([c for c in CLIPS if c[1] == "hook"])
    acts = [c for c in CLIPS if c[1] == "action"]; rnd.shuffle(acts); acts = acts[:5]
    end = rnd.choice([c for c in CLIPS if c[1] == "ending"])
    beats = [4] + [rnd.choice([3, 4]) for _ in acts] + [5]
    segs = [[hook[0], rnd.choice(hook[2]), beats[0]]] + \
           [[c[0], rnd.choice(c[2]), b] for c, b in zip(acts, beats[1:-1])] + \
           [[end[0], rnd.choice(end[2]), beats[-1]]]
    starts = []; acc = 0
    for s in segs: starts.append(acc); acc += s[2]
    caps = [[0.4, beats[0] - 0.4, [[day["hook"], 150, "white"]]]]
    # 3 orta mətn: action seqmentlərini cüt-cüt paylaşır
    groups = [(1, 2), (3, 4), (5, 5)]
    for (a, b), ln in zip(groups, day["lines"]):
        st = starts[a] + 0.3; en = starts[b] + segs[b][2] - 0.4
        big = 108 if max(len(x) for x in ln) <= 14 else 84
        rows = [[ln[0], big, "bar"]] + ([[ln[1], int(big * (0.62 if len(ln[1]) < 16 and a == 5 else 1.0)), "white"]] if len(ln) > 1 else [])
        caps.append([st, en, rows])
    fi = len(segs) - 1
    caps.append([starts[fi] + 0.4, starts[fi] + segs[fi][2] - 0.4, [[day["final"][0], 118, "white"], [day["final"][1], 118, "bar"]]])
    cfg = dict(rnd.choice(MUSIC)); cfg.update({"segments": segs, "captions": caps, "end_beats": 8})
    cover_clip = rnd.choice([c for c in CLIPS if c[1] in ("hook", "action")])
    return cfg, cover_clip

def main():
    day = json.load(open(sys.argv[1]))
    date = day.get("date") or datetime.date.today().isoformat()
    out = A("out", date); os.makedirs(out, exist_ok=True)
    cfg, cc = plan(day)
    cfgp = os.path.join(out, "config.json"); json.dump(cfg, open(cfgp, "w"), ensure_ascii=False, indent=1)
    video = os.path.join(out, f"yukaz_reel_{date}.mp4")
    cover = os.path.join(out, f"yukaz_cover_{date}.jpg")
    capt = os.path.join(out, f"yukaz_caption_{date}.txt")
    subprocess.run([sys.executable, A("make_reel.py"), cfgp, video], check=True)
    subprocess.run([sys.executable, A("cover.py"), A(cc[0]), str(cc[2][0] + 1.0), day["cover"][0], day["cover"][1], cover], check=True)
    open(capt, "w", encoding="utf-8").write(day["caption"].strip() + "\n")
    size = os.path.getsize(video) / 1e6
    print(f"video {size:.1f} MB, cover, caption -> {out}")
    if "--no-release" in sys.argv: return
    # GitHub-da "reels-drop" branch-i: hər gün yalnız son günün faylları (tək commit, force-push)
    import shutil, tempfile
    tmp = tempfile.mkdtemp()
    g = lambda *a: subprocess.run(["git", "-C", tmp, *a], check=True)
    g("init", "-q", "-b", "reels-drop"); g("remote", "add", "origin", f"https://github.com/{REPO}")
    os.makedirs(os.path.join(tmp, date))
    for f in (video, cover, capt): shutil.copy(f, os.path.join(tmp, date))
    open(os.path.join(tmp, "README.md"), "w").write("# Yük.az gündəlik Reels çıxışı\nHər gün yenidən yazılır. Drive-a Apps Script köçürür.\n")
    g("add", "."); g("-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", f"Reels {date}")
    g("push", "-f", "origin", "reels-drop")
    print("pushed: reels-drop/" + date)

if __name__ == "__main__":
    main()
