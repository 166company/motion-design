"""
OpenAI TTS (gpt-4o-mini-tts) + Whisper hizalama.

Niyə: edge-tts "robot" səslənir. OpenAI-nin yeni TTS modeli `instructions` ilə
təbii, canlı intonasiya verir. Amma söz vaxtı qaytarmır — onu Whisper-dən alırıq:
bizim yazdığımız mətni `prompt` kimi veririk, Whisper onu audio ilə hizalayır.
Sonra orijinal sözlər Whisper sözlərinə difflib ilə uyğunlaşdırılır.

Xərc: ~0.015 $/dəq TTS + ~0.006 $/dəq Whisper ≈ 1 sent/video.

stdin: [{"id": "s0", "text": "..."}], argv[1]: çıxış qovluğu
stdout: {"s0": {"words": [...], "duration": 4.2, "file": "..."}}
"""
import asyncio, difflib, io, json, os, re, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mutagen.mp3 import MP3
from az_numbers import normalize as az_normalize

KEY = os.environ["OPENAI_API_KEY"]
MODEL = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts-2025-12-15")
VOICE = os.environ.get("OPENAI_TTS_VOICE", "marin")
SPEED = float(os.environ.get("OPENAI_TTS_SPEED", "1.1"))  # reels ritmi — 1.0 çox yavaş idi (33 san)

# İngiliscə göstəriş: model fonetik təlimatı ingiliscə daha dəqiq izləyir.
# Ən vacib sətir: "NOT Turkish" — model azərbaycan mətnini türkcə kimi oxumağa meyllidir.
INSTRUCTIONS = (
    "Language: AZERBAIJANI (Azərbaycan dili), NOT Turkish. You are a native speaker from Baku. "
    "Pronounce every word with authentic Azerbaijani phonetics: 'ə' is an open e (as in 'ev'), "
    "'q' is a hard g, 'x' is a voiceless kh, 'ğ' is soft, 'c' is like English j. "
    "Tone: warm, energetic Instagram reels narrator; natural sentence intonation, rising on questions; "
    "slightly fast but every word clear. "
    "The brand name is read as three parts: 'Yük' - 'nöqtə' - 'az'. Read the text verbatim, do not translate."
)


def tts_chat_audio(text: str, out_path: str):
    """gpt-audio-* modelləri: chat completions üzərindən audio çıxışı (daha güclü model)"""
    import base64
    body = json.dumps({
        "model": MODEL, "modalities": ["text", "audio"], "audio": {"voice": VOICE, "format": "mp3"},
        "messages": [
            {"role": "system", "content": INSTRUCTIONS + " Output ONLY the spoken reading of the user's text, nothing else."},
            {"role": "user", "content": text},
        ],
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    open(out_path, "wb").write(base64.b64decode(d["choices"][0]["message"]["audio"]["data"]))


def tts(text: str, out_path: str):
    if MODEL.startswith("gpt-audio"):
        return tts_chat_audio(text, out_path)
    body = json.dumps({
        "model": MODEL, "voice": VOICE, "input": text,
        "instructions": INSTRUCTIONS, "response_format": "mp3", "speed": SPEED,
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech", data=body,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        open(out_path, "wb").write(r.read())


def whisper_words(path: str, prompt: str):
    audio = open(path, "rb").read()
    b = "----yk" + os.urandom(6).hex()
    def part(k, v):
        return f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body = (part("model", "whisper-1") + part("response_format", "verbose_json")
            + part("timestamp_granularities[]", "word") + part("language", "az") + part("prompt", prompt))
    body += (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\n"
             f"Content-Type: audio/mpeg\r\n\r\n").encode() + audio + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions", data=body,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": f"multipart/form-data; boundary={b}"},
    )
    return json.load(urllib.request.urlopen(req, timeout=120)).get("words", [])


def norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def align(original: list[str], heard: list[dict], duration: float):
    """
    Orijinal sözləri Whisper sözlərinə uyğunlaşdırır.
    Tapılmayan sözlərin vaxtı qonşulardan interpolyasiya olunur —
    beləliklə ekranda HƏMİŞƏ bizim yazdığımız söz görünür, Whisper-in eşitdiyi yox.
    """
    a = [norm(w) for w in original]
    b = [norm(h["word"]) for h in heard]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    start = [None] * len(original)
    end = [None] * len(original)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                start[i1 + k] = heard[j1 + k]["start"]
                end[i1 + k] = heard[j1 + k]["end"]
        elif tag == "replace" and (i2 - i1) == (j2 - j1):
            for k in range(i2 - i1):          # eyni sayda söz — mövqe ilə götür
                start[i1 + k] = heard[j1 + k]["start"]
                end[i1 + k] = heard[j1 + k]["end"]

    # boşluqları doldur: sol/sağ qonşu arasında bərabər böl
    n = len(original)
    i = 0
    while i < n:
        if start[i] is not None:
            i += 1
            continue
        j = i
        while j < n and start[j] is None:
            j += 1
        left = end[i - 1] if i > 0 else 0.0
        right = start[j] if j < n else duration
        gap = j - i
        for k in range(gap):
            start[i + k] = left + (right - left) * k / gap
            end[i + k] = left + (right - left) * (k + 1) / gap
        i = j

    return [{"w": original[k], "start": round(start[k], 3), "dur": round(max(0.08, end[k] - start[k]), 3)}
            for k in range(n)]


def main():
    jobs = json.load(sys.stdin)
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    result = {}
    for j in jobs:
        path = os.path.join(outdir, f"{j['id']}.mp3")
        # brend adı hər halda düzgün formada olsun
        j["text"] = re.sub(r"Y[uü]k\.?az", "Yük nöqtə az", j["text"], flags=re.I)
        # rəqəmlər azərbaycanca oxunsun ("3" → "üç", "4-cü" → "dördüncü")
        j["text"] = az_normalize(j["text"])
        tts(j["text"], path)
        duration = MP3(path).info.length
        heard = whisper_words(path, j["text"])
        words = align(j["text"].split(), heard, duration)
        result[j["id"]] = {"words": words, "duration": round(duration, 3), "file": path.replace("\\", "/")}
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
