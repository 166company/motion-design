"""
Təsdiq Issue-sunun mətnini yaradır.

Niyə ayrıca skript: çoxsətirli mətni birbaşa YAML-ın `run:` blokunda saxlamaq
təhlükəlidir — 0-cı sütundan başlayan sətirlər workflow faylını sındırır.
"""
import json
import io
import sys

reel_id, repo = sys.argv[1], sys.argv[2]
meta = json.load(io.open(f"content/data/{reel_id}.meta.json", encoding="utf-8"))
base = f"https://github.com/{repo}/releases/download/reel-{reel_id}"
if meta.get("template") in ("Carousel", "Poster"):
    n = meta.get("slides", 3)
    video = f"{base}/{reel_id}-1.png" if n == 1 else " · ".join(f"[slayd {i+1}]({base}/{reel_id}-{i+1}.png)" for i in range(n))
else:
    video = f"{base}/{reel_id}.mp4"

out = sys.stdout
out.reconfigure(encoding="utf-8")

lines = [
    f"**Video:** {video}",
    "",
    "**Caption:**",
    "",
    meta["caption"],
    "",
    " ".join(meta["hashtags"]),
    "",
    f"**Mənbə məqalə:** {meta['link']}",
    "",
    f"**Musiqi:** {meta.get('attribution') or meta.get('music') or 'sintez'}",
    "",
    "---",
    "",
    "Yayımlamaq üçün bu Issue-ya şərh yaz: `/publish`",
    "",
    "İmtina üçün Issue-nu bağla.",
]
out.write("\n".join(lines) + "\n")
