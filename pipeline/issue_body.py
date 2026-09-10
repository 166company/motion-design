"""Təsdiq Issue-sunun mətnini yaradır. YAML-da çoxsətirli mətn saxlamamaq üçün ayrıca skript."""
import json, io, sys

reel_id, repo = sys.argv[1], sys.argv[2]
meta = json.load(io.open(f"content/data/{reel_id}.meta.json", encoding="utf-8"))
video = f"https://github.com/{repo}/releases/download/reel-{reel_id}/{reel_id}.mp4"

out = sys.stdout
out.reconfigure(encoding="utf-8")
out.write(f"**Video:** {video}

")
out.write("**Caption:**

")
out.write(meta["caption"] + "

")
out.write(" ".join(meta["hashtags"]) + "

")
out.write(f"**Mənbə məqalə:** {meta['link']}

")
out.write("---

")
out.write("Yayımlamaq üçün bu Issue-ya şərh yaz: `/publish`

")
out.write("İmtina üçün Issue-nu bağla.
")
