#!/usr/bin/env python3
"""Reels cover (1080x1920 JPG), günün stilinə uyğun. Mətn 4:5 grid kəsimində görünən zonada qalır.

python3 cover.py <style> <clip.mp4> <saniyə> "<sətir1>" "<sətir2 (vurğulu)>" out.jpg
"""
import subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from engine import A, STYLES, GRADES, font, ORANGE, INK, CREAM, W, H, round_mask

def grab(clip, t, grade):
    vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,{GRADES[grade]}"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", A(clip), "-frames:v", "1", "-vf", vf,
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return Image.fromarray(np.frombuffer(raw, np.uint8).reshape(H, W, 3))

def fit(spec, text, max_w, size, track=0):
    while size > 40 and font(spec, size).getlength(text) + track * len(text) > max_w: size -= 4
    return size

def make(style, clip, t, line1, line2, out):
    st = STYLES[style]
    img = grab(clip, t, st["grade"]).convert("RGBA")
    if st["frame"] == "card":
        bg = Image.new("RGBA", (W, H), CREAM + (255,))
        card = img.convert("RGB").resize((936, 1100), Image.BILINEAR, box=(0, 300, W, 1600))
        bg.paste(card, (72, 300), round_mask(936, 1100, 44)); img = bg
    yy = np.linspace(0, 1, H)[:, None]
    if st["frame"] != "card":
        a = (np.clip((yy - 0.36) / 0.64, 0, 1) ** 1.3 * 0.8 * 255).astype(np.uint8)
        img.alpha_composite(Image.fromarray(np.dstack([np.zeros((H, W, 3), np.uint8), np.repeat(a, W, 1)]), "RGBA"))
    d = ImageDraw.Draw(img)
    logo = Image.open(A("assets/logo.png")).convert("RGBA")
    lh = 70; lw = int(logo.width * lh / logo.height); lg = logo.resize((lw, lh), Image.LANCZOS)
    cw, ch = lw + 64, lh + 40; cx = (W - cw) // 2; cy = 330 if st["frame"] != "card" else 150
    d.rounded_rectangle([cx, cy, cx + cw, cy + ch], ch // 2, fill=(255, 255, 255, 240)); img.alpha_composite(lg, (cx + 32, cy + 20))
    up = st["upper"]
    l1 = line1.upper() if up else line1; l2 = line2.upper() if up else line2
    spec = st["font_main"]; base = 128 if not up else 112
    if style == "condensed": base = 150
    if style == "card": base = 74
    s1 = fit(spec, l1, 940, base); s2 = fit(spec, l2, 880, base)
    f1, f2 = font(spec, s1), font(spec, s2)
    y = 1080 if st["frame"] != "card" else 1450
    col = (255, 255, 255) if st["frame"] != "card" else INK
    w1 = f1.getlength(l1)
    if st["frame"] != "card":
        sh = Image.new("RGBA", (W, H)); ImageDraw.Draw(sh).text(((W - w1) / 2, y + 6), l1, font=f1, fill=(0, 0, 0, 170))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12))); d = ImageDraw.Draw(img)
    d.text(((W - w1) / 2, y), l1, font=f1, fill=col + (255,))
    y2 = y + int(s1 * 1.22) + 12; w2 = f2.getlength(l2); pad = int(s2 * 0.22)
    hl = st["highlight"]
    if hl in ("bar", "box", "band"):
        d.rounded_rectangle([(W - w2) / 2 - pad, y2 + s2 * 0.04, (W + w2) / 2 + pad, y2 + s2 * 1.18], int(s2 * (0.16 if hl == "bar" else 0.04)), fill=ORANGE + (255,))
        d.text(((W - w2) / 2, y2), l2, font=f2, fill=(255, 255, 255, 255))
    else:
        d.text(((W - w2) / 2, y2), l2, font=f2, fill=ORANGE + (255,))
        if hl == "underline": d.rectangle([(W - w2) / 2, y2 + s2 * 1.25, (W + w2) / 2, y2 + s2 * 1.25 + 6], fill=ORANGE + (255,))
    fp = font(("Manrope.ttf", "ExtraBold"), 64); num = "050 209 62 99"; wn = fp.getlength(num)
    py = y2 + int(s2 * 1.2) + 70
    if py + 104 < H - 60:
        d.rounded_rectangle([(W - wn) / 2 - 40, py, (W + wn) / 2 + 40, py + 104], 52, fill=(255, 255, 255, 235) if st["frame"] != "card" else INK + (255,))
        d.text(((W - wn) / 2, py + 14), num, font=fp, fill=(INK if st["frame"] != "card" else (255, 255, 255)) + (255,))
    img.convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)

if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6])
