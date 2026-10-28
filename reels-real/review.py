#!/usr/bin/env python3
"""Yoxlanmamış (pending) klipləri yükləyib kontakt vərəqləri çıxarır: review_sheet.png, review_sheet_2.png, ... (24 klip/vərəq).
Baxdıqdan sonra pis klipləri clip_review.json-a yaz: {"<id>": "bad"} (yaxşılar: "ok").

python3 review.py
"""
import json, os, subprocess
from PIL import Image, ImageDraw
from daily import library, fetch, A

pend = [c for c in library() if c["review"] == "pending"]
if not pend:
    print("yoxlanacaq klip yoxdur"); raise SystemExit
tiles = []
for c in pend:
    p = fetch(c); strip = A(".lib", f"s{c['id']}.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", p, "-vf", f"fps=3/{max(c['dur'], 1)},scale=120:213,tile=3x1", "-frames:v", "1", strip], check=True)
    tiles.append((c, Image.open(strip)))
cols = 4
for k in range(0, len(tiles), 24):
    part = tiles[k:k + 24]; name = "review_sheet.png" if k == 0 else f"review_sheet_{k // 24 + 1}.png"
    sheet = Image.new("RGB", (360 * cols, 233 * ((len(part) + cols - 1) // cols)), "black"); d = ImageDraw.Draw(sheet)
    for i, (c, im) in enumerate(part):
        x, y = (i % cols) * 360, (i // cols) * 233
        sheet.paste(im, (x, y + 20)); d.text((x + 4, y + 3), f"{c['id']} {c['role']} | {c['query'][:28]}", fill="white")
    sheet.save(A(name)); print(name + ":", [c["id"] for c, _ in part])
