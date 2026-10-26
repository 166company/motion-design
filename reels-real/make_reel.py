#!/usr/bin/env python3
"""Yük.az Reels montajı: real stok kadrlar + brend overlay-ləri + musiqi.
Yalnız python3, Pillow, numpy və ffmpeg tələb edir (bulud sessiyasında işləyir).

İstifadə:  python3 make_reel.py [config.json] [out.mp4]
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(HERE, *p)
W, H, FPS = 1080, 1920, 30
ORANGE, GREY, CREAM, INK = (255, 76, 0), (68, 68, 68), (246, 243, 238), (28, 28, 28)

DEFAULT = {
    "music": "assets/music/mixkit-dance-like-theres-no-tomorrow-1095.mp3",
    "music_start": 13.37, "beat": 0.4763,
    # clip, giriş saniyəsi, neçə bit
    "segments": [
        ["clips/c01.mp4", 0.3, 4], ["clips/c02.mp4", 2.2, 3], ["clips/c04.mp4", 4.0, 4],
        ["clips/c03.mp4", 0.6, 3], ["clips/c05.mp4", 1.0, 3], ["clips/c06.mp4", 1.5, 4],
        ["clips/c12.mp4", 1.5, 3], ["clips/c10.mp4", 3.0, 5],
    ],
    "end_beats": 8,
    # mətnlər: [başlanğıc biti, son biti, sətirlər]  sətir = [mətn, ölçü, "white"|"orange"|"bar"]
    "captions": [
        [0.4, 3.6, [["Köçürsən?", 150, "white"]]],
        [7.3, 13.6, [["Ağır yükü", 108, "bar"], ["bizə burax.", 108, "white"]]],
        [14.3, 20.6, [["Ehtiyatla yükləyir,", 84, "white"], ["vaxtında çatdırırıq.", 84, "white"]]],
        [21.3, 23.7, [["Sığortalı daşıma", 96, "bar"], ["2020-dən bəri", 58, "white"]]],
        [24.4, 28.6, [["Yeni evin", 118, "white"], ["mübarək!", 118, "bar"]]],
    ],
    "phone": "050 209 62 99", "site": "yuk.az",
    "price_line": "Bakı daxili 20 AZN-dən",
    "tagline": "Yükdaşıma xidməti",
}

# ---------------------------------------------------------------- helpers
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def seg(t, a, b): return clamp((t - a) / (b - a)) if b != a else float(t >= b)
def ss(x): return x * x * x * (x * (x * 6 - 15) + 10)
def eo(x): return 1 - (1 - x) ** 3
def eio(x): return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2

_fonts = {}
def font(size, weight="ExtraBold"):
    k = (size, weight)
    if k not in _fonts:
        if weight == "Poppins":
            _fonts[k] = ImageFont.truetype(A("assets/fonts/Poppins-Bold.ttf"), size)
        else:
            f = ImageFont.truetype(A("assets/fonts/Manrope.ttf"), size); f.set_variation_by_name(weight); _fonts[k] = f
    return _fonts[k]

def rounded(draw, box, r, fill): draw.rounded_rectangle(box, r, fill=fill)

# ---------------------------------------------------------------- caption renderer
def draw_caption(layer, shadow, t, t_in, t_out, lines, y_center):
    d = ImageDraw.Draw(layer); ds = ImageDraw.Draw(shadow)
    gap = 18
    heights = [int(s * 1.08) for _, s, _ in lines]
    total = sum(heights) + gap * (len(lines) - 1)
    y = y_center - total // 2
    ci = 0
    for (txt, size, style), lh in zip(lines, heights):
        f = font(size)
        widths = [f.getlength(c) for c in txt]
        tw = sum(widths); x = (W - tw) / 2
        # orange highlight bar behind the line
        if style == "bar":
            pb = eo(seg(t, t_in + 0.05, t_in + 0.42)); qb = eio(seg(t, t_out - 0.05, t_out + 0.3))
            if pb > 0 and qb < 1:
                pad = int(size * 0.22); bx0 = x - pad; bx1 = x + tw + pad
                x0 = bx0 + (bx1 - bx0) * qb; x1 = bx0 + (bx1 - bx0) * pb
                rounded(d, [x0, y + size * 0.02, x1, y + lh + size * 0.04], int(size * 0.14), ORANGE + (255,))
        col = (255, 255, 255)
        cx = x
        for i, c in enumerate(txt):
            t0 = t_in + 0.12 + ci * 0.022
            p = ss(seg(t, t0, t0 + 0.42)); q = ss(seg(t, t_out + ci * 0.01, t_out + ci * 0.01 + 0.3))
            a = p * (1 - q)
            if a > 0.01 and c != " ":
                dy = (1 - p) * size * 0.45 - q * size * 0.25
                d.text((cx, y + dy), c, font=f, fill=col + (int(255 * a),))
                if style != "bar":
                    ds.text((cx, y + dy + 4), c, font=f, fill=(0, 0, 0, int(150 * a)))
            cx += widths[i]; ci += 1
        y += lh + gap

# ---------------------------------------------------------------- static layers
def make_static():
    yy = np.linspace(0, 1, H)[:, None]
    grad = np.clip((yy - 0.48) / 0.52, 0, 1) ** 1.6 * 0.62
    bottom = np.zeros((H, W, 4), np.uint8); bottom[..., 3] = (np.repeat(grad, W, 1) * 255).astype(np.uint8)
    top = np.zeros((H, W, 4), np.uint8); tg = np.clip((0.16 - yy) / 0.16, 0, 1) ** 1.5 * 0.35
    top[..., 3] = (np.repeat(tg, W, 1) * 255).astype(np.uint8)
    xx = np.linspace(-1, 1, W)[None, :]; y2 = np.linspace(-1, 1, H)[:, None]
    r = np.sqrt((xx * 0.95) ** 2 + (y2 * 0.75) ** 2)
    vig = (1 - np.clip((r - 0.7) / 0.7, 0, 1) ** 2 * 0.38).astype(np.float32)[..., None]
    rng = np.random.default_rng(166)
    grains = [rng.normal(0, 5.0, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]
    grains = [np.kron(g, np.ones((2, 2), np.float32))[..., None] for g in grains]
    return Image.fromarray(bottom, "RGBA"), Image.fromarray(top, "RGBA"), vig, grains

def logo_chip(logo):
    lh = 54; lw = int(logo.width * lh / logo.height)
    lg = logo.resize((lw, lh), Image.LANCZOS)
    chip = Image.new("RGBA", (lw + 52, lh + 34), (0, 0, 0, 0)); d = ImageDraw.Draw(chip)
    d.rounded_rectangle([0, 0, chip.width - 1, chip.height - 1], chip.height // 2, fill=(255, 255, 255, 236))
    chip.alpha_composite(lg, (26, 17)); return chip

def end_card(t, t0, logo, cfg):
    """Cream card sliding up over the last shot."""
    p = eio(seg(t, t0, t0 + 0.5))
    card = Image.new("RGBA", (W, H), CREAM + (255,)); d = ImageDraw.Draw(card)
    u = t - t0
    # logo
    pl = ss(seg(u, 0.35, 0.95))
    if pl > 0:
        lw = int(800 * (0.92 + 0.08 * pl)); lh = int(logo.height * lw / logo.width)
        lg = logo.resize((lw, lh), Image.LANCZOS)
        if pl < 1: lg.putalpha(lg.getchannel("A").point(lambda v: int(v * pl)))
        card.alpha_composite(lg, ((W - lw) // 2, int(640 - lh / 2 + (1 - pl) * 30)))
    def txt(s, f, col, y, a_in):
        pa = ss(seg(u, a_in, a_in + 0.45))
        if pa <= 0: return
        w = f.getlength(s); d.text(((W - w) / 2, y + (1 - pa) * 26), s, font=f, fill=col + (int(255 * pa),))
    txt(cfg["tagline"], font(54, "SemiBold"), (130, 124, 116), 820, 0.75)
    # price chip
    pc = ss(seg(u, 0.95, 1.4))
    if pc > 0:
        f = font(56, "ExtraBold"); s = cfg["price_line"]; w = f.getlength(s)
        bx = (W - w) / 2 - 38; by = 960 + (1 - pc) * 26
        d.rounded_rectangle([bx, by, bx + w + 76, by + 100], 50, fill=ORANGE + (int(255 * pc),))
        d.text(((W - w) / 2, by + 16), s, font=f, fill=(255, 255, 255, int(255 * pc)))
    # phone pill
    pp = ss(seg(u, 1.2, 1.7))
    if pp > 0:
        pw, ph = 760, 150; px = (W - pw) / 2; py = 1140 + (1 - pp) * 30; a = int(255 * pp)
        d.rounded_rectangle([px, py, px + pw, py + ph], ph // 2, fill=INK + (a,))
        cx, cy, r = px + ph / 2, py + ph / 2, ph / 2 - 18
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE + (a,))
        # handset glyph
        hs = Image.new("RGBA", (120, 120), (0, 0, 0, 0)); hd = ImageDraw.Draw(hs)
        hd.arc([30, 30, 90, 90], 120, 240, fill=(255, 255, 255, a), width=14)
        hd.ellipse([36, 22, 58, 42], fill=(255, 255, 255, a)); hd.ellipse([36, 78, 58, 98], fill=(255, 255, 255, a))
        hs = hs.rotate(40, resample=Image.BICUBIC); card.alpha_composite(hs, (int(cx - 60), int(cy - 60)))
        f = font(76, "ExtraBold"); s = cfg["phone"]; w = f.getlength(s)
        d.text((px + ph + (pw - ph - w) / 2 - 12, py + 30), s, font=f, fill=(255, 255, 255, a))
    txt(cfg["site"], font(74, "ExtraBold"), ORANGE, 1350, 1.5)
    txt("Sığortalı daşıma  •  2020-dən bəri", font(44, "SemiBold"), (140, 134, 126), 1480, 1.75)
    return card, p

# ---------------------------------------------------------------- video io
def read_segment(path, t_in, dur):
    vf = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,"
          "eq=contrast=1.06:saturation=0.9:gamma=0.98,"
          "colorbalance=rs=0.015:bs=-0.03:rm=0.02:bm=-0.02:rh=0.03:bh=-0.035,"
          "curves=master='0/0.035 0.25/0.23 0.75/0.78 1/0.97'")
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{t_in:.3f}", "-i", A(path), "-t", f"{dur + 0.2:.3f}", "-vf", vf,
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = W * H * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    p.wait()

def main():
    cfg = dict(DEFAULT)
    if len(sys.argv) > 1 and sys.argv[1].endswith(".json"):
        cfg.update(json.load(open(sys.argv[1])))
    out = sys.argv[2] if len(sys.argv) > 2 else A("yukaz_reel.mp4")
    B = cfg["beat"]
    bottom, top, vig, grains = make_static()
    logo = Image.open(A("assets/logo.png")).convert("RGBA")
    chip = logo_chip(logo)
    starts = []; acc = 0
    for s in cfg["segments"]: starts.append(acc); acc += s[2]
    T_END = acc * B; TOTAL = (acc + cfg["end_beats"]) * B
    nframes = int(round(TOTAL * FPS))
    tmp_video = out + ".video.mp4"
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                            "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", tmp_video],
                           stdin=subprocess.PIPE)
    caps = [(a * B, b * B, lines) for a, b, lines in cfg["captions"]]
    f_idx = 0
    last_frame = None
    seg_list = cfg["segments"] + [[cfg["segments"][-1][0], None, cfg["end_beats"]]]
    for si, (path, t_in, nb) in enumerate(seg_list):
        seg_t0 = (starts[si] if si < len(starts) else acc) * B
        dur = nb * B
        if t_in is None:  # end card: hold the last shot (continue reading it)
            path, t_in = cfg["segments"][-1][0], cfg["segments"][-1][1] + cfg["segments"][-1][2] * B
        gen = read_segment(path, t_in, dur)
        while f_idx < nframes and f_idx / FPS < seg_t0 + dur - 1e-6:
            t = f_idx / FPS; lt = t - seg_t0
            try: fr = next(gen); last_frame = fr
            except StopIteration: fr = last_frame
            img = Image.fromarray(fr)
            # slow push-in + punch on the cut
            z = 1.0 + 0.045 * (lt / dur) + 0.10 * (1 - ss(clamp(lt / 0.28)))
            cw, ch = W / z, H / z; x0 = (W - cw) / 2; y0 = (H - ch) / 2
            img = img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch)).convert("RGBA")
            # overlays
            vis = 0.0
            for a, b, _ in caps: vis = max(vis, seg(t, a - 0.1, a + 0.3) * (1 - seg(t, b, b + 0.4)))
            if vis > 0:
                bl = bottom.copy(); bl.putalpha(bottom.getchannel("A").point(lambda v, k=vis: int(v * k)))
                img.alpha_composite(bl)
            img.alpha_composite(top)
            ca = seg(t, 4 * B - 0.05, 4 * B + 0.35) * (1 - seg(t, T_END - 0.2, T_END))
            if ca > 0:
                c2 = chip.copy(); c2.putalpha(chip.getchannel("A").point(lambda v, k=ca: int(v * k)))
                img.alpha_composite(c2, ((W - chip.width) // 2, int(110 - (1 - ca) * 20)))
            active = [(a, b, l) for a, b, l in caps if a - 0.2 <= t <= b + 0.8]
            if active:
                layer = Image.new("RGBA", (W, H)); shadow = Image.new("RGBA", (W, H))
                for a, b, lines in active: draw_caption(layer, shadow, t, a, b, lines, 1450)
                img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))
                img.alpha_composite(layer)
            if t >= T_END:
                card, p = end_card(t, T_END, logo, cfg)
                yoff = int(H * (1 - p))
                if yoff < H:
                    img.alpha_composite(card.crop((0, 0, W, H - yoff)), (0, yoff))
            arr = np.asarray(img.convert("RGB")).astype(np.float32)
            # flash on the drop + film look
            fl = math.exp(-max(0.0, t - 4 * B) / 0.07) * 0.28 if t >= 4 * B else 0.0
            if fl > 0.01: arr = arr + (255 - arr) * fl
            if t < T_END + 0.5: arr *= vig
            arr += grains[f_idx % len(grains)]
            fo = seg(t, TOTAL - 0.35, TOTAL)
            if t < 0.25: arr *= ss(seg(t, 0, 0.25))
            if fo > 0: arr *= (1 - fo)
            enc.stdin.write(np.clip(arr, 0, 255).astype(np.uint8).tobytes())
            f_idx += 1
        gen.close()
    enc.stdin.close(); enc.wait()
    # music
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp_video, "-ss", str(cfg["music_start"]), "-i", A(cfg["music"]),
                    "-filter_complex", f"[1:a]atrim=0:{TOTAL:.3f},afade=t=in:d=0.04,afade=t=out:st={TOTAL - 1.3:.3f}:d=1.3,loudnorm=I=-14:TP=-1.5:LRA=11[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest",
                    "-movflags", "+faststart", out], check=True)
    os.remove(tmp_video)
    print("OK", out, f"{TOTAL:.2f}s")

if __name__ == "__main__":
    main()
