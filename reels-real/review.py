#!/usr/bin/env python3
"""Yoxlanmamış (pending) klipləri yükləyib kontakt vərəqi çıxarır: review_sheet.png.
Baxdıqdan sonra pis klipləri clip_review.json-a yaz: {"<id>": "bad"} (yaxşılar: "ok").

python3 review.py
"""
import json, os, subprocess
from PIL import Image, ImageDraw
from daily import library, fetch, A

pend = [c for c in library() if c["review"] == "pending"][:24]
if not pend:
    print("yoxlanacaq klip yoxdur"); raise SystemExit
tiles = []
for c in pend:
    p = fetch(c); strip = A(".lib", f"s{c['id']}.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", p, "-vf", f"fps=3/{max(c['dur'], 1)},scale=120:213,tile=3x1", "-frames:v", "1", strip], check=True)
    tiles.append((c, Image.open(strip)))
cols = 4; sheet = Image.new("RGB", (360 * cols, 233 * ((len(tiles) + cols - 1) // cols)), "black"); d = ImageDraw.Draw(sheet)
for i, (c, im) in enumerate(tiles):
    x, y = (i % cols) * 360, (i // cols) * 233
    sheet.paste(im, (x, y + 20)); d.text((x + 4, y + 3), f"{c['id']} {c['role']} | {c['query'][:28]}", fill="white")
sheet.save(A("review_sheet.png")); print("review_sheet.png:", [c["id"] for c, _ in tiles])
