"""
edge-tts ilə səsləndirmə — açar yoxdur, kart yoxdur.
Hər səhnə üçün ayrıca mp3 + söz vaxtları. Səhnə uzunluğu birbaşa səsdən gəlir.
"""
import asyncio, json, sys, os, io
import edge_tts
from mutagen.mp3 import MP3

VOICE = os.environ.get("TTS_VOICE", "az-AZ-BanuNeural")
RATE = os.environ.get("TTS_RATE", "+8%")   # bir az sürətli — reels ritmi

async def synth(text: str, out_mp3: str):
    c = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    words = []
    buf = io.BytesIO()
    async for ch in c.stream():
        if ch["type"] == "audio":
            buf.write(ch["data"])
        elif ch["type"] == "WordBoundary":
            words.append({
                "w": ch["text"],
                "start": round(ch["offset"] / 1e7, 3),
                "dur": round(ch["duration"] / 1e7, 3),
            })
    data = buf.getvalue()
    with open(out_mp3, "wb") as f:
        f.write(data)

    # Həqiqi audio uzunluğu — son sözün bitməsi deyil, faylın özü
    dur = MP3(out_mp3).info.length
    return {"words": words, "duration": round(dur, 3)}

async def main():
    # stdin: [{"id": "s0", "text": "..."}], argv[1]: çıxış qovluğu
    jobs = json.load(sys.stdin)
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    result = {}
    for j in jobs:
        path = os.path.join(outdir, f"{j['id']}.mp3")
        result[j["id"]] = await synth(j["text"], path)
        result[j["id"]]["file"] = path.replace("\\", "/")
    sys.stdout.write(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
