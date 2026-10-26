#!/usr/bin/env python3
"""Yük.az Reels montaj mühərriki — bir neçə premium stil.

python3 engine.py plan.json out.mp4
plan.json: {"style": "<ad>", "music": {...}, "segments": [[clip, t_in, beats, clip2|null], ...],
            "captions": [[beat_in, beat_out, [[mətn, rol], ...]], ...], "end_beats": 8, "phone":..., "site":..., "price_line":..., "tagline":...}
rol: "main" | "accent" (vurğulu) | "sub" (kiçik)
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: p[0] if os.path.isabs(p[0]) else os.path.join(HERE, *p)
W, H, FPS = 1080, 1920, 30
ORANGE, GREY, CREAM, INK = (255, 76, 0), (68, 68, 68), (246, 243, 238), (20, 20, 20)

# ------------------------------------------------------------------ STİLLƏR
STYLES = {
    # qalın sans + narıncı zolaq, isti kino tonu, zoom-punch kəsmələr
    "bold_bar": dict(font_main=("Manrope.ttf", "ExtraBold"), font_sub=("Manrope.ttf", "SemiBold"), upper=False,
                     size=118, align="center", y=1450, highlight="bar", anim="rise",
                     grade="warm", transition="punch", frame="full", end="cream", grain=5.0, flash_drop=True),
    # jurnal üslubu: kursiv serif + aralıqlı kiçik başlıq, kinematik zolaqlar, yumşaq keçidlər
    "editorial": dict(font_main=("PlayfairDisplay-Italic[wght].ttf", "SemiBold Italic"), font_sub=("Montserrat[wght].ttf", "SemiBold"),
                      upper=False, sub_upper=True, sub_track=10, size=124, align="center", y=1340, highlight="underline", anim="fade",
                      grade="film", transition="dissolve", frame="letterbox", end="dark", grain=7.0, flash_drop=False),
    # dar böyük hərflər, sol tərəfdə, narıncı qutu, teal-orange ton, whip keçidlər
    "condensed": dict(font_main=("Oswald[wght].ttf", "Bold"), font_sub=("Oswald[wght].ttf", "Medium"), upper=True,
                      size=170, align="left", y=560, highlight="box", anim="wipe",
                      grade="teal", transition="whip", frame="full", end="orange", grain=4.0, flash_drop=True),
    # geniş display şrift, kadr kart içində (krem fon), slide keçid
    "card": dict(font_main=("Unbounded[wght].ttf", "Black"), font_sub=("Unbounded[wght].ttf", "Medium"), upper=True,
                 size=84, align="center", y=1640, highlight="none_orange", anim="rise",
                 grade="clean", transition="slide", frame="card", end="cream", grain=3.0, flash_drop=False),
    # ağ-qara kadr + narıncı vurğu, nazik ağ çərçivə, flash kəsmələr
    "mono": dict(font_main=("Montserrat[wght].ttf", "ExtraBold"), font_sub=("Montserrat[wght].ttf", "Medium"), upper=True,
                 size=104, align="center", y=1480, highlight="color", anim="words",
                 grade="mono", transition="flash", frame="border", end="dark", grain=8.0, flash_drop=True),
    # iki kadr üst-üstə (split), ortada narıncı lent üzərində mətn
    "split": dict(font_main=("Archivo[wdth,wght].ttf", "Black"), font_sub=("Archivo[wdth,wght].ttf", "SemiBold"), upper=True,
                  size=96, align="center", y=960, highlight="band", anim="wipe",
                  grade="warm", transition="slide_h", frame="split", end="orange", grain=4.0, flash_drop=False),
}

GRADES = {
    "warm": "eq=contrast=1.06:saturation=0.92:gamma=0.98,colorbalance=rs=0.015:bs=-0.03:rm=0.02:bm=-0.02:rh=0.03:bh=-0.035,curves=master='0/0.035 0.25/0.23 0.75/0.78 1/0.97'",
    "film": "eq=contrast=1.02:saturation=0.8:gamma=0.97,colorbalance=rs=0.03:bs=-0.01:rh=0.04:bh=-0.05,curves=master='0/0.07 0.3/0.28 0.7/0.74 1/0.93'",
    "teal": "eq=contrast=1.12:saturation=1.05,colorbalance=rs=-0.06:gs=0.0:bs=0.07:rm=0.02:bm=-0.02:rh=0.07:gh=0.01:bh=-0.07",
    "clean": "eq=contrast=1.04:saturation=1.02:gamma=1.03:brightness=0.015,colorbalance=rh=0.01:bh=-0.01",
    "mono": "hue=s=0,eq=contrast=1.18:gamma=0.97,curves=master='0/0.04 0.5/0.5 1/0.96'",
}

# ------------------------------------------------------------------ köməkçilər
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def seg(t, a, b): return clamp((t - a) / (b - a)) if b != a else float(t >= b)
def ss(x): return x * x * x * (x * (x * 6 - 15) + 10)
def eo(x): return 1 - (1 - x) ** 3
def eio(x): return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2

_fc = {}
def font(spec, size):
    k = (spec, size)
    if k not in _fc:
        f = ImageFont.truetype(A("assets/fonts", spec[0]), size)
        if spec[1]:
            try: f.set_variation_by_name(spec[1])
            except Exception: pass
        _fc[k] = f
    return _fc[k]

def white_logo(logo):
    a = np.asarray(logo).copy()
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    grey = (abs(r - g) < 25) & (abs(g - b) < 25) & (r < 140)
    a[grey, 0:3] = 255
    return Image.fromarray(a, "RGBA")

def hblur(arr, k):
    if k < 2: return arr
    c = np.cumsum(np.pad(arr.astype(np.float32), ((0, 0), (k, k), (0, 0)), mode="edge"), axis=1)
    return ((c[:, 2 * k:] - c[:, :-2 * k]) / (2 * k))[:, :arr.shape[1]]

def read_clip(path, t_in, dur, grade):
    vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,{GRADES[grade]}"
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{t_in:.3f}", "-i", A(path), "-t", f"{dur + 0.3:.3f}", "-vf", vf,
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = W * H * 3; last = None
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        last = np.frombuffer(b, np.uint8).reshape(H, W, 3); yield last
    p.stdout.close(); p.wait()
    while last is not None: yield last  # klip qısadırsa son kadrı saxla

# ------------------------------------------------------------------ çərçivələr
def zoom(img, z):
    if abs(z - 1) < 1e-3: return img
    w, h = img.size; cw, ch = w / z, h / z; x0 = (w - cw) / 2; y0 = (h - ch) / 2
    return img.resize((w, h), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))

_mask_cache = {}
def round_mask(w, h, r):
    k = (w, h, r)
    if k not in _mask_cache:
        m = Image.new("L", (w * 2, h * 2), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w * 2 - 1, h * 2 - 1], r * 2, fill=255)
        _mask_cache[k] = m.resize((w, h), Image.LANCZOS)
    return _mask_cache[k]

def compose_frame(style, a, b, t, lt, dur, logo_chip):
    """a, b: RGB numpy kadrlar (b yalnız split üçün)."""
    st = STYLES[style]; fr = st["frame"]
    zbase = 1.0 + 0.045 * (lt / dur)
    if st["transition"] in ("punch", "flash"): zbase += 0.10 * (1 - ss(clamp(lt / 0.28)))
    img = zoom(Image.fromarray(a), zbase)
    if fr == "full":
        return img
    if fr == "border":
        d = ImageDraw.Draw(img); d.rectangle([22, 22, W - 23, H - 23], outline=(255, 255, 255), width=4); return img
    if fr == "letterbox":
        bar = int(230 * ss(seg(t, 0.0, 0.8)))
        d = ImageDraw.Draw(img); d.rectangle([0, 0, W, bar], fill=(8, 8, 8)); d.rectangle([0, H - bar, W, H], fill=(8, 8, 8)); return img
    if fr == "card":
        bg = Image.new("RGB", (W, H), CREAM)
        cw, ch = 936, 1430
        card = img.resize((cw, ch), Image.BILINEAR, box=((W - W * 0.866) / 2, (H - H * 0.745) / 2, (W + W * 0.866) / 2, (H + H * 0.745) / 2))
        sh = Image.new("RGBA", (W, H)); ImageDraw.Draw(sh).rounded_rectangle([72, 200, 72 + cw, 200 + ch], 44, fill=(0, 0, 0, 70))
        bg.paste(sh.filter(ImageFilter.GaussianBlur(22)).convert("RGB"), (0, 0), sh.filter(ImageFilter.GaussianBlur(22)))
        bg.paste(card, (72, 180), round_mask(cw, ch, 44))
        bg = bg.convert("RGBA"); bg.alpha_composite(logo_chip, ((W - logo_chip.width) // 2, 70)); return bg.convert("RGB")
    if fr == "split":
        top = Image.fromarray(a).resize((W, H // 2), Image.BILINEAR, box=(0, H * 0.25, W, H * 0.75))
        bot = Image.fromarray(b if b is not None else a).resize((W, H // 2), Image.BILINEAR, box=(0, H * 0.25, W, H * 0.75))
        out = Image.new("RGB", (W, H)); out.paste(zoom(top, zbase), (0, 0)); out.paste(zoom(bot, 1.09 - 0.045 * (lt / dur)), (0, H // 2)); return out
    return img

def transition(style, prev, cur, lt):
    tr = STYLES[style]["transition"]
    if prev is None: return cur
    if tr == "dissolve":
        p = ss(seg(lt, 0, 0.32)); return cur if p >= 1 else (prev * (1 - p) + cur * p)
    if tr == "whip":
        p = eio(seg(lt, 0, 0.22))
        if p >= 1: return cur
        sh = int(W * p); out = np.empty_like(cur, dtype=np.float32)
        out[:, :W - sh] = prev[:, sh:]; out[:, W - sh:] = cur[:, :sh]
        return hblur(out, int(70 * math.sin(p * math.pi)) + 1)
    if tr in ("slide", "slide_h"):
        p = eio(seg(lt, 0, 0.3))
        if p >= 1: return cur
        out = np.empty_like(cur, dtype=np.float32)
        if tr == "slide":
            s = int(H * p); out[:H - s] = prev[s:]; out[H - s:] = cur[:s]
        else:
            s = int(W * p); out[:, :W - s] = prev[:, s:]; out[:, W - s:] = cur[:, :s]
        return out
    return cur

# ------------------------------------------------------------------ mətn
def draw_caption(layer, shadow, style, t, t_in, t_out, lines):
    st = STYLES[style]; d = ImageDraw.Draw(layer); ds = ImageDraw.Draw(shadow)
    base = st["size"]
    rows = []
    for txt, role in lines:
        if role == "sub":
            spec, size = st["font_sub"], int(base * 0.46)
            txt = txt.upper() if st.get("sub_upper") or st["upper"] else txt
        else:
            spec, size = st["font_main"], base
            txt = txt.upper() if st["upper"] else txt
        f = font(spec, size)
        track = st.get("sub_track", 0) if role == "sub" else (4 if st["upper"] else 0)
        maxw = 940 if st["align"] == "center" else 900
        while f.getlength(txt) + track * len(txt) > maxw and size > 36:
            size -= 4; f = font(spec, size)
        rows.append((txt, role, f, size, track))
    gap = int(base * 0.16)
    heights = [int(s * (1.12 if st["upper"] else 1.2)) for _, _, _, s, _ in rows]
    total = sum(heights) + gap * (len(rows) - 1)
    y = st["y"] - total // 2 if st["align"] == "center" else st["y"]
    ci = 0
    for (txt, role, f, size, track), lh in zip(rows, heights):
        widths = [f.getlength(c) + track for c in txt]; tw = sum(widths) - track
        x = (W - tw) / 2 if st["align"] == "center" else 80
        hl = st["highlight"]; accent = role == "accent"
        p_in = seg(t, t_in, t_in + 0.5); q = ss(seg(t, t_out, t_out + 0.35))
        # vurğu fonları
        if accent and hl in ("bar", "box"):
            pb = eo(seg(t, t_in + 0.02, t_in + 0.4)); pad = int(size * (0.2 if hl == "bar" else 0.14))
            x0, x1 = x - pad, x + tw + pad
            xa = x0 + (x1 - x0) * q; xb = x0 + (x1 - x0) * pb
            if xb > xa:
                if hl == "bar": d.rounded_rectangle([xa, y + size * 0.02, xb, y + lh + size * 0.02], int(size * 0.14), fill=ORANGE + (255,))
                else: d.rectangle([xa, y - size * 0.02, xb, y + lh], fill=ORANGE + (255,))
        if hl == "band" and ci == 0:
            pb = eio(seg(t, t_in, t_in + 0.35)) * (1 - eio(seg(t, t_out, t_out + 0.3)))
            if pb > 0:
                bh = int((total + base * 0.7) * pb); cy = st["y"]
                d.rectangle([0, cy - bh // 2, W, cy + bh // 2], fill=ORANGE + (255,))
        col = (255, 255, 255)
        if accent and hl in ("color", "none_orange"): col = ORANGE
        if hl == "band": col = (255, 255, 255) if not accent else INK
        if st["frame"] == "card" and not accent: col = INK
        cx = x
        anim = st["anim"]
        # wipe: sətir soldan sağa açılır
        reveal = eio(seg(t, t_in + 0.08 + ci * 0.012, t_in + 0.55 + ci * 0.012)) if anim == "wipe" else 1.0
        for i, c in enumerate(txt):
            if anim == "rise":
                t0 = t_in + 0.1 + ci * 0.022; p = ss(seg(t, t0, t0 + 0.42)); dy = (1 - p) * size * 0.45
            elif anim == "fade":
                t0 = t_in + 0.1 + ci * 0.012; p = ss(seg(t, t0, t0 + 0.7)); dy = (1 - p) * size * 0.12
            elif anim == "words":
                wi = txt[:i + 1].count(" "); t0 = t_in + 0.1 + (wi + ci // 40) * 0.16; p = ss(seg(t, t0, t0 + 0.3)); dy = (1 - p) * size * 0.3
            else:
                p = 1.0 if (cx - x + widths[i]) <= tw * reveal + 1 else 0.0; dy = 0
            qo = ss(seg(t, t_out + ci * 0.008, t_out + ci * 0.008 + 0.3))
            a = p * (1 - qo); dy -= qo * size * 0.2
            if a > 0.01 and c != " ":
                d.text((cx, y + dy), c, font=f, fill=col + (int(255 * a),))
                if hl not in ("band",) and st["frame"] != "card" and not (accent and hl in ("bar", "box")):
                    ds.text((cx, y + dy + 4), c, font=f, fill=(0, 0, 0, int(160 * a)))
            cx += widths[i]; ci += 1
        if hl == "underline" and accent:
            pu = eo(seg(t, t_in + 0.45, t_in + 0.95)) * (1 - q)
            if pu > 0: d.rectangle([x + tw / 2 - tw / 2 * pu, y + lh + 6, x + tw / 2 + tw / 2 * pu, y + lh + 12], fill=ORANGE + (255,))
        y += lh + gap

# ------------------------------------------------------------------ son kadr
def end_card(style, t, t0, logo, logo_w, cfg):
    kind = STYLES[style]["end"]
    bgc = {"cream": CREAM, "dark": (16, 16, 16), "orange": ORANGE}[kind]
    fg = INK if kind == "cream" else (255, 255, 255)
    soft = (130, 124, 116) if kind == "cream" else (235, 230, 225)
    card = Image.new("RGBA", (W, H), bgc + (255,)); d = ImageDraw.Draw(card); u = t - t0
    def txt(s, f, col, y, a_in):
        pa = ss(seg(u, a_in, a_in + 0.45))
        if pa <= 0: return
        w = f.getlength(s); d.text(((W - w) / 2, y + (1 - pa) * 26), s, font=f, fill=col + (int(255 * pa),))
    pl = ss(seg(u, 0.35, 0.95))
    if pl > 0:
        lg_src = logo_w if kind == "dark" else logo
        lw = int(760 * (0.92 + 0.08 * pl)); lh = int(lg_src.height * lw / lg_src.width)
        lg = lg_src.resize((lw, lh), Image.LANCZOS)
        if pl < 1: lg.putalpha(lg.getchannel("A").point(lambda v: int(v * pl)))
        yy = int(640 - lh / 2 + (1 - pl) * 30)
        if kind == "orange":
            pw, ph = lw + 120, lh + 110
            d.rounded_rectangle([(W - pw) / 2, yy - 55, (W + pw) / 2, yy - 55 + ph], 40, fill=(255, 255, 255, int(255 * pl)))
        card.alpha_composite(lg, ((W - lw) // 2, yy))
    mf = lambda w, s: font(("Manrope.ttf", w), s)
    txt(cfg["tagline"], mf("SemiBold", 54), soft, 830, 0.75)
    pc = ss(seg(u, 0.95, 1.4))
    if pc > 0:
        f = mf("ExtraBold", 56); s = cfg["price_line"]; w = f.getlength(s)
        chip = ORANGE if kind != "orange" else (255, 255, 255); tc = (255, 255, 255) if kind != "orange" else ORANGE
        bx = (W - w) / 2 - 38; by = 965 + (1 - pc) * 26
        d.rounded_rectangle([bx, by, bx + w + 76, by + 100], 50, fill=chip + (int(255 * pc),))
        d.text(((W - w) / 2, by + 16), s, font=f, fill=tc + (int(255 * pc),))
    pp = ss(seg(u, 1.2, 1.7))
    if pp > 0:
        pw, ph = 760, 150; px = (W - pw) / 2; py = 1145 + (1 - pp) * 30; a = int(255 * pp)
        pill = INK if kind == "cream" else (255, 255, 255); ptxt = (255, 255, 255) if kind == "cream" else INK
        d.rounded_rectangle([px, py, px + pw, py + ph], ph // 2, fill=pill + (a,))
        cx, cy, r = px + ph / 2, py + ph / 2, ph / 2 - 18
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE + (a,))
        hs = Image.new("RGBA", (120, 120), (0, 0, 0, 0)); hd = ImageDraw.Draw(hs)
        hd.arc([30, 30, 90, 90], 120, 240, fill=(255, 255, 255, a), width=14)
        hd.ellipse([36, 22, 58, 42], fill=(255, 255, 255, a)); hd.ellipse([36, 78, 58, 98], fill=(255, 255, 255, a))
        card.alpha_composite(hs.rotate(40, resample=Image.BICUBIC), (int(cx - 60), int(cy - 60)))
        f = mf("ExtraBold", 76); s = cfg["phone"]; w = f.getlength(s)
        d.text((px + ph + (pw - ph - w) / 2 - 12, py + 30), s, font=f, fill=ptxt + (a,))
    txt(cfg["site"], mf("ExtraBold", 74), ORANGE if kind != "orange" else (255, 255, 255), 1355, 1.5)
    txt("Sığortalı daşıma  •  2020-dən bəri", mf("SemiBold", 44), soft, 1485, 1.75)
    return card

# ------------------------------------------------------------------ əsas
def main():
    cfg = json.load(open(sys.argv[1])); out = sys.argv[2]
    style = cfg["style"]; st = STYLES[style]; mus = cfg["music"]; B = mus["beat"]
    logo = Image.open(A("assets/logo.png")).convert("RGBA"); logo_w = white_logo(logo)
    lh = 54; lw = int(logo.width * lh / logo.height)
    chip = Image.new("RGBA", (lw + 52, lh + 34)); cd = ImageDraw.Draw(chip)
    cd.rounded_rectangle([0, 0, chip.width - 1, chip.height - 1], chip.height // 2, fill=(255, 255, 255, 236))
    chip.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), (26, 17))
    segs = cfg["segments"]; starts = []; acc = 0
    for s in segs: starts.append(acc); acc += s[2]
    T_END = acc * B; TOTAL = (acc + cfg.get("end_beats", 8)) * B; N = int(round(TOTAL * FPS))
    caps = [(a * B, b * B, l) for a, b, l in cfg["captions"]]
    yy = np.linspace(0, 1, H)[:, None]
    shade_lo = Image.fromarray(np.dstack([np.zeros((H, W, 3), np.uint8), np.repeat((np.clip((yy - 0.5) / 0.5, 0, 1) ** 1.6 * 0.6 * 255).astype(np.uint8), W, 1)]), "RGBA")
    shade_hi = Image.fromarray(np.dstack([np.zeros((H, W, 3), np.uint8), np.repeat((np.clip((0.5 - yy) / 0.5, 0, 1) ** 1.6 * 0.55 * 255).astype(np.uint8), W, 1)]), "RGBA")
    xx = np.linspace(-1, 1, W)[None, :]; y2 = np.linspace(-1, 1, H)[:, None]
    vig = (1 - np.clip((np.sqrt((xx * 0.95) ** 2 + (y2 * 0.75) ** 2) - 0.7) / 0.7, 0, 1) ** 2 * 0.36).astype(np.float32)[..., None]
    rng = np.random.default_rng(7)
    grains = [np.kron(rng.normal(0, st["grain"], (H // 2, W // 2)).astype(np.float32), np.ones((2, 2), np.float32))[..., None] for _ in range(5)]
    tmp = out + ".v.mp4"
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
    f_idx = 0; prev_last = None
    all_segs = segs + [[segs[-1][0], segs[-1][1] + segs[-1][2] * B, cfg.get("end_beats", 8), segs[-1][3] if len(segs[-1]) > 3 else None]]
    for si, s in enumerate(all_segs):
        path, t_in, nb = s[0], s[1], s[2]; path2 = s[3] if len(s) > 3 else None
        t0 = (starts[si] if si < len(starts) else acc) * B; dur = nb * B
        ga = read_clip(path, t_in, dur, st["grade"])
        gb = read_clip(path2, 1.0, dur, st["grade"]) if (st["frame"] == "split" and path2) else None
        cur_last = None
        while f_idx < N and f_idx / FPS < t0 + dur - 1e-6:
            t = f_idx / FPS; lt = t - t0
            a = next(ga); b = next(gb) if gb else None
            base = np.asarray(compose_frame(style, a, b, t, lt, dur, chip), dtype=np.float32)
            cur_last = base
            if 0 < si < len(segs):
                base = transition(style, prev_last, base, lt)
            img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
            active = [(x, y_, l) for x, y_, l in caps if x - 0.2 <= t <= y_ + 0.7]
            if active and st["frame"] not in ("card", "split"):
                vis = max(seg(t, x - 0.1, x + 0.3) * (1 - seg(t, y_, y_ + 0.4)) for x, y_, _ in active)
                sh = shade_hi if st["y"] < 900 else shade_lo
                img.alpha_composite(Image.fromarray(np.dstack([np.zeros((H, W, 3), np.uint8), (np.asarray(sh.getchannel("A"), np.float32) * vis).astype(np.uint8)]), "RGBA"))
            if st["frame"] not in ("card",):
                ca = seg(t, 1.5, 1.9) * (1 - seg(t, T_END - 0.2, T_END))
                if ca > 0 and st["frame"] != "split":
                    c2 = chip.copy(); c2.putalpha(chip.getchannel("A").point(lambda v, k=ca: int(v * k)))
                    img.alpha_composite(c2, ((W - chip.width) // 2, int((270 if st["frame"] == "letterbox" else 110) - (1 - ca) * 20)))
            if active:
                layer = Image.new("RGBA", (W, H)); shadow = Image.new("RGBA", (W, H))
                for x, y_, l in active: draw_caption(layer, shadow, style, t, x, y_, l)
                img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10))); img.alpha_composite(layer)
            if t >= T_END:
                card = end_card(style, t, T_END, logo, logo_w, cfg)
                p = eio(seg(t, T_END, T_END + 0.5)); yoff = int(H * (1 - p))
                if yoff < H: img.alpha_composite(card.crop((0, 0, W, H - yoff)), (0, yoff))
            arr = np.asarray(img.convert("RGB")).astype(np.float32)
            if st["transition"] == "flash" and si > 0 and t < T_END:
                arr += (255 - arr) * (0.35 * math.exp(-lt / 0.05))
            if st.get("flash_drop") and si == 1:
                arr += (255 - arr) * (0.26 * math.exp(-lt / 0.07))
            if t < T_END + 0.5: arr *= vig
            arr += grains[f_idx % len(grains)]
            if t < 0.2: arr *= ss(seg(t, 0, 0.2))
            fo = seg(t, TOTAL - 0.35, TOTAL)
            if fo > 0: arr *= (1 - fo)
            enc.stdin.write(np.clip(arr, 0, 255).astype(np.uint8).tobytes()); f_idx += 1
        prev_last = cur_last
        ga.close()
        if gb: gb.close()
    enc.stdin.close(); enc.wait()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-ss", str(mus["start"]), "-i", A(mus["file"]),
                    "-filter_complex", f"[1:a]atrim=0:{TOTAL:.3f},afade=t=in:d=0.04,afade=t=out:st={TOTAL - 1.3:.3f}:d=1.3,loudnorm=I=-14:TP=-1.5:LRA=11[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest",
                    "-movflags", "+faststart", out], check=True)
    os.remove(tmp)
    print("OK", out, f"{TOTAL:.2f}s", style)

if __name__ == "__main__":
    main()
