#!/usr/bin/env python3
"""Reels cover (1080x1920 JPG). Mətn 4:5 və 3:4 grid kəsimində görünən mərkəzi zonada qalır.

python3 cover.py <clip.mp4> <saniyə> "<sətir1>" "<sətir2 (narıncı zolaqlı)>" out.jpg
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(HERE, *p)
W, H = 1080, 1920
ORANGE, INK = (255, 76, 0), (28, 28, 28)

def font(size, weight="ExtraBold"):
    f = ImageFont.truetype(A("assets/fonts/Manrope.ttf"), size); f.set_variation_by_name(weight); return f

def grab(clip, t):
    vf = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
          "eq=contrast=1.08:saturation=0.92:gamma=0.97,colorbalance=rm=0.02:bm=-0.02:rh=0.03:bh=-0.035")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", clip, "-frames:v", "1", "-vf", vf,
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return Image.fromarray(np.frombuffer(raw, np.uint8).reshape(H, W, 3))

def fit(text, max_w, size):
    while size > 40 and font(size).getlength(text) > max_w: size -= 4
    return size

def make(clip, t, line1, line2, out):
    img = grab(clip, t).convert("RGBA")
    # darken lower half for text
    yy = np.linspace(0, 1, H)[:, None]
    a = (np.clip((yy - 0.38) / 0.62, 0, 1) ** 1.3 * 0.78 * 255).astype(np.uint8)
    shade = np.zeros((H, W, 4), np.uint8); shade[..., 3] = np.repeat(a, W, 1)
    img.alpha_composite(Image.fromarray(shade, "RGBA"))
    top = np.zeros((H, W, 4), np.uint8); top[..., 3] = (np.clip((0.2 - yy) / 0.2, 0, 1) * 0.4 * 255).astype(np.uint8).repeat(W, 1)
    img.alpha_composite(Image.fromarray(top, "RGBA"))
    d = ImageDraw.Draw(img)
    # logo chip (inside 4:5 safe area: y >= 285)
    logo = Image.open(A("assets/logo.png")).convert("RGBA")
    lh = 70; lw = int(logo.width * lh / logo.height); lg = logo.resize((lw, lh), Image.LANCZOS)
    cw, ch = lw + 64, lh + 40; cx = (W - cw) // 2; cy = 330
    d.rounded_rectangle([cx, cy, cx + cw, cy + ch], ch // 2, fill=(255, 255, 255, 240))
    img.alpha_composite(lg, (cx + 32, cy + 20))
    # headline
    s1 = fit(line1, 940, 132); s2 = fit(line2, 880, 132)
    f1, f2 = font(s1), font(s2)
    y = 1080
    w1 = f1.getlength(line1)
    sh = Image.new("RGBA", (W, H)); ImageDraw.Draw(sh).text(((W - w1) / 2, y + 6), line1, font=f1, fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(img)
    d.text(((W - w1) / 2, y), line1, font=f1, fill=(255, 255, 255, 255))
    y2 = y + int(s1 * 1.2) + 14
    w2 = f2.getlength(line2); pad = int(s2 * 0.24)
    d.rounded_rectangle([(W - w2) / 2 - pad, y2 + s2 * 0.04, (W + w2) / 2 + pad, y2 + s2 * 1.16], int(s2 * 0.16), fill=ORANGE + (255,))
    d.text(((W - w2) / 2, y2), line2, font=f2, fill=(255, 255, 255, 255))
    # phone
    fp = font(64); ph = "📞 050 209 62 99"
    num = "050 209 62 99"; wn = fp.getlength(num)
    py = y2 + int(s2 * 1.16) + 70
    d.rounded_rectangle([(W - wn) / 2 - 40, py, (W + wn) / 2 + 40, py + 104], 52, fill=(255, 255, 255, 235))
    d.text(((W - wn) / 2, py + 14), num, font=fp, fill=INK + (255,))
    img.convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)

if __name__ == "__main__":
    make(sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5])
