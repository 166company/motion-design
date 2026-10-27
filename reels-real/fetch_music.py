#!/usr/bin/env python3
"""Mixkit-dən (Mixkit License — kommersiya üçün pulsuz) yeni musiqi trekləri götürüb kitabxananı genişləndirir.

GitHub Actions-da işləyir. Kitabxana: reels-library branch → music/*.mp3 + music.json
İstifadə:  python3 fetch_music.py <library_dir> [neçə_trek]
Hər trek üçün bpm, beat (san) və 3 yaxşı başlanğıc nöqtəsi (enerjili hissələr) hesablanır.
"""
import datetime, json, os, random, re, sys, urllib.request

LIB = sys.argv[1]
WANT = int(sys.argv[2]) if len(sys.argv) > 2 else 4
MAX_TRACKS = 120
# Mixkit səhifəsi → bizim janr adı (daily.py MOODS ilə uyğun)
PAGES = {
    "corporate": ["corporate", "tag/corporate", "tag/business", "tag/motivational"],
    "chill": ["chill", "lo-fi", "tag/chill", "tag/lofi", "tag/relaxing"],
    "deep-house": ["house", "deep-house", "tag/house", "tag/deep-house"],
    "dance-pop": ["pop", "dance", "tag/pop", "tag/dance", "tag/happy"],
    "funk": ["funk", "tag/funk", "tag/groovy"],
    "disco": ["disco", "tag/disco", "tag/retro"],
    "hip-hop": ["hip-hop", "tag/hip-hop", "tag/beats"],
    "cinematic": ["cinematic", "tag/cinematic", "tag/inspiring"],
    "upbeat": ["tag/upbeat", "tag/energetic", "tag/positive"],
}
UA = {"User-Agent": "Mozilla/5.0 (yukaz-reels)"}

def get(url, binary=False, limit=15_000_000):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        data = r.read(limit + 1)
    if len(data) > limit: raise RuntimeError("çox böyük")
    return data if binary else data.decode("utf-8", "ignore")

def track_ids(html):
    ids = set(re.findall(r"assets\.mixkit\.co/music/(\d+)/\d+\.mp3", html))
    ids |= set(re.findall(r"music/preview/mixkit-[a-z0-9-]*?-(\d+)\.mp3", html))
    ids |= set(re.findall(r'data-[a-z-]*id="(\d+)"[^>]*audio', html))
    return ids

def analyze(path):
    import numpy as np, librosa
    y, sr = librosa.load(path, sr=22050, mono=True)
    dur = len(y) / sr
    if dur < 40: return None
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])
    if not (70 <= bpm <= 170): return None
    bt = librosa.frames_to_time(beats, sr=sr)
    rms = librosa.feature.rms(y=y)[0]; rt = librosa.frames_to_time(range(len(rms)), sr=sr)
    # 20 san pəncərələr: ortalama enerji ən yüksək olanlar, başlanğıc beat-ə yapışdırılır
    cands = []
    for t0 in bt[::8]:
        if t0 < 2 or t0 > dur - 22: continue
        m = (rt >= t0) & (rt < t0 + 20)
        cands.append((float(rms[m].mean()), float(t0)))
    cands.sort(reverse=True)
    starts = []
    for _, t in cands:
        if all(abs(t - s) > 15 for s in starts): starts.append(round(t, 2))
        if len(starts) == 3: break
    if not starts: return None
    return {"bpm": round(bpm, 1), "beat": round(60 / bpm, 4), "starts": starts, "dur": round(dur, 1)}

def main():
    cat_path = os.path.join(LIB, "music.json")
    cat = json.load(open(cat_path)) if os.path.exists(cat_path) else []
    have = {str(c["id"]) for c in cat} | set(json.load(open(sys.argv[3])) if len(sys.argv) > 3 else [])
    os.makedirs(os.path.join(LIB, "music"), exist_ok=True)
    today = datetime.date.today().isoformat(); rnd = random.Random(today + "m")
    counts = {g: sum(1 for c in cat if c["genre"] == g) for g in PAGES}
    genres = sorted(PAGES, key=lambda g: (counts[g], rnd.random()))
    added = []
    for g in genres * 2:
        if len(added) >= WANT: break
        page = rnd.choice(PAGES[g])
        url = f"https://mixkit.co/free-stock-music/{page}/"
        try: ids = track_ids(get(url))
        except Exception as e: print("səhifə alınmadı", url, e, flush=True); continue
        new = [i for i in ids if i not in have]; rnd.shuffle(new)
        print(url, len(ids), "trek,", len(new), "yeni", flush=True)
        for tid in new[:3]:
            out = os.path.join(LIB, "music", f"mixkit-{tid}.mp3")
            try:
                open(out, "wb").write(get(f"https://assets.mixkit.co/music/{tid}/{tid}.mp3", binary=True))
                info = analyze(out)
            except Exception as e:
                print("skip", tid, e, flush=True); info = None
            have.add(tid)
            if not info:
                if os.path.exists(out): os.remove(out)
                continue
            cat.append({"id": tid, "file": f"music/mixkit-{tid}.mp3", "genre": g, **info,
                        "source": f"https://mixkit.co (Mixkit License)", "added": today})
            added.append(tid); print("added", tid, g, info, flush=True)
            break   # hər janrdan bir dəfədə bir trek — müxtəliflik
    while len(cat) > MAX_TRACKS:
        old = cat.pop(0); p = os.path.join(LIB, old["file"])
        if os.path.exists(p): os.remove(p)
    json.dump(cat, open(cat_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(added)} yeni trek; kitabxanada {len(cat)} trek")

if __name__ == "__main__":
    main()
