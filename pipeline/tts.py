"""
Pulsuz AZƏRBAYCANCA səsləndirmə — edge-tts (Microsoft Neural), açar və kart yoxdur.

Səslər: az-AZ-BanuNeural (qadın), az-AZ-BabekNeural (kişi).
  TTS_VOICE=az-AZ-BanuNeural | az-AZ-BabekNeural | rotate (default: hər video növbə ilə)
  TTS_RATE=+8%   TTS_PITCH=+0Hz   (reels ritmi; Babek üçün avtomatik bir az aşağı ton)

Söz vaxtları edge-tts-in öz WordBoundary hadisələrindən gəlir — Whisper lazım deyil (pulsuz).
Ekranda HƏMİŞƏ bizim yazdığımız söz görünür: eşidilən sözlər orijinala difflib ilə uyğunlaşdırılır.
Söz vaxtı gəlməsə (şəbəkə/versiya) — hecalara görə təxmin edilir.

Bu skript TTS_ENGINE=edge | auto olanda işləyir (default openai-first → tts_openai.py).
TTS_ENGINE=auto və OPENAI_API_KEY varsa: edge 3 cəhddən sonra alınmasa həmin səhnə OpenAI TTS ilə səslənir.

stdin: [{"id": "s0", "text": "..."}], argv[1]: çıxış qovluğu
stdout: {"s0": {"words": [{"w","start","dur"}], "duration": 4.2, "file": "...", "voice": "..."}}
"""
import asyncio, difflib, io, json, os, re, sys, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edge_tts
from mutagen.mp3 import MP3
from az_numbers import normalize as az_normalize

VOICES = ["az-AZ-BanuNeural", "az-AZ-BabekNeural"]
RATE = os.environ.get("TTS_RATE", "+8%")
PITCH = os.environ.get("TTS_PITCH", "").strip()
ENGINE = os.environ.get("TTS_ENGINE", "auto").lower()


def pick_voice(outdir: str) -> str:
    v = os.environ.get("TTS_VOICE", "").strip()
    if v and v != "rotate" and v.startswith("az-"):
        return v
    # eyni video → eyni səs; fərqli video → növbə
    return VOICES[zlib.crc32(os.path.abspath(outdir).encode()) % len(VOICES)]


def prepare(text: str) -> str:
    text = re.sub(r"Y[uü]k\.?az", "Yük nöqtə az", text, flags=re.I)  # brend adı düzgün oxunsun
    text = az_normalize(text)                                        # 3 → üç, 050… → sıfır əlli…
    return re.sub(r"\s+", " ", text).strip()


def norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


VOWELS = set("aeıioöuüəAEIİOÖUÜƏ")


def estimate(words: list[str], duration: float, lead: float = 0.05):
    """Söz vaxtı yoxdursa: hər sözə heca sayına mütənasib vaxt + durğu işarəsində kiçik fasilə"""
    weights = [max(1, sum(ch in VOWELS for ch in w)) + (0.8 if re.search(r"[.,!?;:]$", w) else 0) for w in words]
    total = sum(weights) or 1
    t, out = lead, []
    span = max(0.1, duration - lead - 0.1)
    for w, k in zip(words, weights):
        d = span * k / total
        out.append({"w": w, "start": round(t, 3), "dur": round(max(0.08, d * 0.92), 3)})
        t += d
    return out


def align(original: list[str], heard: list[dict], duration: float):
    """Orijinal sözlərə edge-in eşitdiyi vaxtları köçür; boşluqları interpolyasiya et"""
    if not heard:
        return estimate(original, duration)
    a = [norm(w) for w in original]
    b = [norm(h["w"]) for h in heard]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    start, end = [None] * len(original), [None] * len(original)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                start[i1 + k] = heard[j1 + k]["start"]
                end[i1 + k] = heard[j1 + k]["start"] + heard[j1 + k]["dur"]
        elif tag == "replace" and i2 - i1 >= 1 and j2 > j1:
            s, e = heard[j1]["start"], heard[j2 - 1]["start"] + heard[j2 - 1]["dur"]
            n = i2 - i1
            for k in range(n):
                start[i1 + k] = s + (e - s) * k / n
                end[i1 + k] = s + (e - s) * (k + 1) / n
    n, i = len(original), 0
    while i < n:
        if start[i] is not None:
            i += 1
            continue
        j = i
        while j < n and start[j] is None:
            j += 1
        left = end[i - 1] if i > 0 else 0.0
        right = start[j] if j < n else duration
        for k in range(j - i):
            start[i + k] = left + (right - left) * k / (j - i)
            end[i + k] = left + (right - left) * (k + 1) / (j - i)
        i = j
    return [{"w": original[k], "start": round(start[k], 3), "dur": round(max(0.08, end[k] - start[k]), 3)} for k in range(n)]


async def edge_synth(text: str, out_mp3: str, voice: str):
    pitch = PITCH or ("-4Hz" if "Babek" in voice else "+0Hz")
    try:
        c = edge_tts.Communicate(text, voice, rate=RATE, pitch=pitch, boundary="WordBoundary")
    except TypeError:  # köhnə edge-tts (boundary parametri yoxdur)
        c = edge_tts.Communicate(text, voice, rate=RATE, pitch=pitch)
    words, buf = [], io.BytesIO()
    async for ch in c.stream():
        if ch["type"] == "audio":
            buf.write(ch["data"])
        elif ch["type"] == "WordBoundary":
            words.append({"w": ch["text"], "start": round(ch["offset"] / 1e7, 3), "dur": round(ch["duration"] / 1e7, 3)})
    data = buf.getvalue()
    if len(data) < 1000:
        raise RuntimeError("edge-tts boş audio qaytardı")
    with open(out_mp3, "wb") as f:
        f.write(data)
    return words


async def synth(job: dict, outdir: str, voice: str):
    path = os.path.join(outdir, f"{job['id']}.mp3")
    text = prepare(job["text"])
    last = None
    for attempt in range(3):
        try:
            heard = await edge_synth(text, path, voice)
            duration = MP3(path).info.length
            return {"words": align(text.split(), heard, duration), "duration": round(duration, 3),
                    "file": path.replace("\\", "/"), "voice": voice}
        except Exception as e:  # şəbəkə / 403 / boş cavab
            last = e
            print(f"  edge-tts {job['id']} cəhd {attempt + 1}/3: {e}", file=sys.stderr)
            await asyncio.sleep(2 * (attempt + 1))
    if ENGINE == "auto" and os.environ.get("OPENAI_API_KEY"):
        print(f"  edge-tts alınmadı → OpenAI TTS ({job['id']})", file=sys.stderr)
        import tts_openai  # yalnız lazım olanda (açar tələb edir)
        tts_openai.tts(text, path)
        duration = MP3(path).info.length
        words = tts_openai.align(text.split(), tts_openai.whisper_words(path, text), duration)
        return {"words": words, "duration": round(duration, 3), "file": path.replace("\\", "/"), "voice": "openai"}
    raise RuntimeError(f"edge-tts alınmadı: {last}")


def synth_sync(job: dict, outdir: str, voice: str | None = None) -> dict:
    """Bir səhnəni edge-tts ilə səsləndir (sinxron) — tts_openai.py ehtiyat yolu bunu çağırır."""
    return asyncio.run(synth(job, outdir, voice or pick_voice(outdir)))


async def main():
    jobs = json.load(sys.stdin)
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    voice = pick_voice(outdir)
    print(f"  səs: {voice} (edge-tts, pulsuz)", file=sys.stderr)
    result = {}
    for j in jobs:
        result[j["id"]] = await synth(j, outdir, voice)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
