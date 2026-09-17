"""
Audius kataloqundakı trekləri vokal üçün yoxlayır.

Metod: trekin ilk 60 saniyəsi OpenAI Whisper-ə verilir. Instrumental trekdə
Whisper ya heç nə tapmır, ya da yüksək `no_speech_prob` ilə bir-iki söz
"uydurur". Vokallı trekdə isə dəqiqədə onlarla söz çıxır.

Nəticə content/data/music-screen.json-a yazılır; audius.ts vokallı trekləri
seçimdən çıxarır. Artıq yoxlanmış treklər təkrar yoxlanmır (xərc: ~0.5 sent/trek).

İstifadə:  python pipeline/screen_music.py
"""
import io, json, os, re, subprocess, sys, tempfile, urllib.request

CATALOG = "content/data/audius-catalog.json"
SCREEN = "content/data/music-screen.json"
SAMPLE_SEC = 60
VOCAL_WPM = 10          # bu həddən çox söz/dəqiqə → vokal
REAL_WORDS_MIN = 6      # transkriptdə bu qədər real (latın) söz varsa → vokal, ehtimaldan asılı olmayaraq
SPEECH_PROB_MAX = 0.5   # seqment "danışıq"dır, əgər no_speech_prob bundan azdırsa


def ffmpeg_path():
    plat = f"{sys.platform}-{os.uname().machine if hasattr(os, 'uname') else 'x64'}"
    pkgs = {
        "win32-x64": "compositor-win32-x64-msvc",
        "linux-x86_64": "compositor-linux-x64-gnu",
        "darwin-arm64": "compositor-darwin-arm64",
        "darwin-x86_64": "compositor-darwin-x64",
    }
    name = pkgs.get(plat) or pkgs["win32-x64"]
    exe = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    return os.path.join("node_modules", "@remotion", name, exe)


def fresh_url(t):
    """İmzalı stream URL-lərinin vaxtı keçir — API-dən təzəsini al"""
    tok = os.environ.get("AUDIUS_API_TOKEN", "")
    req = urllib.request.Request(
        f"https://api.audius.co/v1/tracks/{t['id']}?app_name=yukaz-motion",
        headers={"User-Agent": "yukaz-motion", **({"Authorization": f"Bearer {tok}"} if tok else {})},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    return d["data"]["stream"]["url"]


def trim(src, dest, seconds):
    subprocess.run(
        [ffmpeg_path(), "-hide_banner", "-y", "-loglevel", "error",
         "-i", src, "-t", str(seconds), "-ac", "1", "-ar", "16000", "-b:a", "48k", dest],
        check=True,
    )


def _transcribe(path, url, key, model):
    boundary = "----yukaz" + os.urandom(8).hex()
    with open(path, "rb") as f:
        audio = f.read()
    fields = [("model", model), ("response_format", "verbose_json")]
    body = b""
    for k, v in fields:
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\n"
             f"Content-Type: audio/mpeg\r\n\r\n").encode() + audio + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def whisper(path):
    """ƏSAS: OpenAI whisper-1 (keyfiyyət) · EHTİYAT: Groq Whisper (GROQ_API_KEY, pulsuz)"""
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    groq = os.environ.get("GROQ_API_KEY", "").strip()
    if not openai_key and not groq:
        raise RuntimeError("OPENAI_API_KEY və ya GROQ_API_KEY lazımdır")
    if openai_key:
        try:
            return _transcribe(path, "https://api.openai.com/v1/audio/transcriptions", openai_key, "whisper-1")
        except Exception as e:
            if not groq:
                raise
            print(f"  OpenAI whisper alınmadı ({str(e)[:100]}) → ehtiyat: Groq", file=sys.stderr)
    return _transcribe(path, "https://api.groq.com/openai/v1/audio/transcriptions", groq,
                       os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo"))


def analyze(result, seconds):
    """Yalnız Whisper-in əmin olduğu seqmentləri sayırıq"""
    words = 0
    for seg in result.get("segments", []):
        if seg.get("no_speech_prob", 1.0) < SPEECH_PROB_MAX:
            words += len(seg.get("text", "").split())
    wpm = words / (seconds / 60)
    # Whisper instrumental trekdə tez-tez yad əlifbada mətn "uydurur" (sinhala, gürcü…).
    # Real vokal isə adətən latın hərfli, 3+ hərfli sözlərdən ibarətdir.
    text = result.get("text", "")
    real_words = len(re.findall(r"[A-Za-z']{3,}", text))
    vocal = wpm > VOCAL_WPM or real_words >= REAL_WORDS_MIN
    return {"words": words, "wpm": round(wpm, 1), "real_words": real_words,
            "vocal": vocal, "sample": text[:80]}


def main():
    catalog = json.load(io.open(CATALOG, encoding="utf-8"))["tracks"]
    screen = json.load(io.open(SCREEN, encoding="utf-8")) if os.path.exists(SCREEN) else {}
    todo = [t for t in catalog if t["id"] not in screen or screen[t["id"]].get("vocal") is None]
    if not todo:
        print("yeni trek yoxdur, hamısı yoxlanılıb")
        return

    tmp = tempfile.mkdtemp()
    for t in todo:
        raw = os.path.join(tmp, f"{t['id']}.mp3")
        cut = os.path.join(tmp, f"{t['id']}.cut.mp3")
        try:
            urllib.request.urlretrieve(fresh_url(t), raw)
            trim(raw, cut, SAMPLE_SEC)
            res = analyze(whisper(cut), SAMPLE_SEC)
        except Exception as e:
            res = {"error": str(e)[:120], "vocal": None}
        res["title"] = t["title"]
        screen[t["id"]] = res
        flag = "VOKAL " if res.get("vocal") else ("?     " if res.get("vocal") is None else "instr ")
        print(f"{flag} {t['title'][:34]:34} wpm={res.get('wpm','-'):>5}  {res.get('sample','')[:40]!r}")

    io.open(SCREEN, "w", encoding="utf-8").write(json.dumps(screen, ensure_ascii=False, indent=2))
    n_v = sum(1 for v in screen.values() if v.get("vocal"))
    print(f"\n{len(screen)} trek yoxlanıldı, {n_v} vokallı istisna edildi")


if __name__ == "__main__":
    main()
