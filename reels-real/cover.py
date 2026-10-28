#!/usr/bin/env python3
"""Reels cover (1080x1920 JPG), premium tərtibat, günün stilinə uyğun şrift/ton.
Bütün mətn 4:5 grid kəsimində (y 285–1635) görünən zonada qalır.

python3 cover.py <style> <clip.mp4> <saniyə> "<sətir1>" "<sətir2 (vurğulu)>" out.jpg
"""
import subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from engine import az_upper, A, STYLES, GRADES, font, ORANGE, INK, CREAM, W, H, round_mask, white_logo

SAFE_TOP, SAFE_BOT = 285, 1635

def grab(clip, t, grade):
    vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,{GRADES[grade]}"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", A(clip), "-frames:v", "1", "-vf", vf,
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return Image.fromarray(np.frombuffer(raw, np.uint8).reshape(H, W, 3))

def tw(text, f, track): return sum(f.getlength(c) for c in text) + track * max(len(text) - 1, 0)

def fit(spec, text, max_w, size, track=0):
    while size > 40 and tw(text, font(spec, size), track) > max_w: size -= 2
    return size

def tracked(d, xy, text, f, fill, track):
    x, y = xy
    for c in text:
        d.text((x, y), c, font=f, fill=fill); x += f.getlength(c) + track

def alpha_grad(top_a, bot_a, y0, y1, power=1.4):
    yy = np.linspace(0, 1, H)[:, None]
    g = np.clip((yy - y0) / max(y1 - y0, 1e-3), 0, 1) ** power
    a = (top_a + (bot_a - top_a) * g) * 255
    return Image.fromarray(np.dstack([np.zeros((H, W, 3), np.uint8), np.repeat(a.astype(np.uint8), W, 1)]), "RGBA")

def make(style, clip, t, line1, line2, out):
    st = STYLES[style]; card = st["frame"] == "card"
    img = grab(clip, t, st["grade"]).convert("RGBA")
    up = st["upper"]
    l1 = az_upper(line1) if up else line1; l2 = az_upper(line2) if up else line2
    spec = st["font_main"]
    left = st["align"] == "left"
    margin = 96

    if card:
        bg = Image.new("RGBA", (W, H), CREAM + (255,))
        cw, ch = 936, 900
        ph = img.convert("RGB").resize((cw, ch), Image.LANCZOS, box=(0, 360, W, 360 + W * ch / cw))
        sh = Image.new("RGBA", (W, H)); ImageDraw.Draw(sh).rounded_rectangle([72, 330, 72 + cw, 330 + ch], 40, fill=(0, 0, 0, 60))
        bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26)))
        bg.paste(ph, (72, 310), round_mask(cw, ch, 40)); img = bg
        col1, col2, soft = INK, ORANGE, (120, 114, 106)
    else:
        img.alpha_composite(alpha_grad(0.0, 0.93, 0.36, 0.80, 1.1))     # aşağı yumşaq qaralma
        lum = np.asarray(img.convert("L").crop((0, 1080, W, 1650)), np.float32).mean()
        if lum > 70:                                                       # açıq kadrda əlavə qaralma
            img.alpha_composite(alpha_grad(0.0, min(0.5, (lum - 70) / 120), 0.45, 0.72, 1.0))
        img.alpha_composite(alpha_grad(0.45, 0.0, 0.0, 0.26, 1.0))      # yuxarı loqo üçün
        col1, col2, soft = (255, 255, 255), ORANGE, (225, 220, 214)
    d = ImageDraw.Draw(img)

    # loqo: kiçik, təmiz (pill yoxdur), 4:5 zonasının yuxarısında
    logo = Image.open(A("assets/logo.png")).convert("RGBA")
    lg_src = logo if card else white_logo(logo)
    lh = 58; lw = int(lg_src.width * lh / lg_src.height); lg = lg_src.resize((lw, lh), Image.LANCZOS)
    ly = 330 if not card else 200
    img.alpha_composite(lg, (margin if left else (W - lw) // 2, ly))

    # başlıq ölçüləri
    base = {"condensed": 150, "card": 78, "editorial": 120, "mono": 104, "split": 104, "bold_bar": 112}.get(style, 112)
    tr1 = 3 if up else 0
    maxw = W - 2 * margin
    s1 = fit(spec, l1, maxw, base, tr1); s2 = fit(spec, l2, maxw, base, tr1)
    if abs(s1 - s2) < base * 0.25: s1 = s2 = min(s1, s2)
    f1, f2 = font(spec, s1), font(spec, s2)
    lh1, lh2 = int(s1 * (1.08 if up else 1.18)), int(s2 * (1.08 if up else 1.18))

    # eyebrow: narıncı xətt + aralıqlı kiçik yazı
    ef = font(("Montserrat[wght].ttf", "SemiBold"), 30); etr = 7
    eb = "YÜK.AZ  ·  YÜKDAŞIMA"
    total = 64 + lh1 + 6 + lh2
    y = (SAFE_BOT - 190 - total) if not card else 1270
    ew = tw(eb, ef, etr)
    x0 = margin if left else (W - (ew + 76)) / 2
    if not card:
        esh = Image.new("RGBA", (W, H)); tracked(ImageDraw.Draw(esh), (x0 + 76, y + 3), eb, ef, (0, 0, 0, 200), etr)
        img.alpha_composite(esh.filter(ImageFilter.GaussianBlur(8))); d = ImageDraw.Draw(img); soft = (245, 242, 238)
    d.rectangle([x0, y + 14, x0 + 56, y + 18], fill=ORANGE + (255,)); tracked(d, (x0 + 76, y), eb, ef, soft + (255,), etr)
    y += 64

    def put(text, f, yy, col, trk):
        w = tw(text, f, trk); x = margin if left else (W - w) / 2
        if not card:
            sh = Image.new("RGBA", (W, H)); tracked(ImageDraw.Draw(sh), (x, yy + 5), text, f, (0, 0, 0, 120), trk)
            img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
        tracked(ImageDraw.Draw(img), (x, yy), text, f, col + (255,), trk)
        return x, w
    put(l1, f1, y, col1, tr1); y += lh1 + 6
    x2, w2 = put(l2, f2, y, col2, tr1); y += lh2
    d = ImageDraw.Draw(img)
    if st["highlight"] == "underline":
        d.rectangle([x2, y + 8, x2 + w2, y + 12], fill=ORANGE + (255,))

    # telefon: nazik çərçivəli "şüşə" pill
    fp = font(("Manrope.ttf", "Bold"), 44); num = "050 209 62 99"; wn = fp.getlength(num)
    pw, ph = int(wn + 150), 92; py = (SAFE_BOT - 130) if not card else 1520
    px = margin if left else (W - pw) // 2
    if not card:
        reg = img.crop((px, py, px + pw, py + ph)).filter(ImageFilter.GaussianBlur(18))
        img.paste(reg, (px, py), round_mask(pw, ph, ph // 2))
        ov = Image.new("RGBA", (W, H))
        ImageDraw.Draw(ov).rounded_rectangle([px, py, px + pw, py + ph], ph // 2, fill=(0, 0, 0, 70), outline=(255, 255, 255, 170), width=2)
        img.alpha_composite(ov); d = ImageDraw.Draw(img)
    else:
        d.rounded_rectangle([px, py, px + pw, py + ph], ph // 2, fill=INK + (255,))
    cx, cy = px + 48, py + ph / 2
    d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=ORANGE + (255,))
    d.text((px + 84, py + (ph - 44) / 2 - 6), num, font=fp, fill=(255, 255, 255, 255))
    img.convert("RGB").save(out, "JPEG", quality=93, optimize=True, progressive=True)

if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6])
