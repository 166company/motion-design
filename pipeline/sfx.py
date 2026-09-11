"""
Səs effektləri sintezatoru — public/sfx/ qovluğuna bir dəfə yazılır, repoda saxlanır.

  whoosh.wav  — səhnə keçidi (filtrlənmiş küy süpürməsi)
  pop.wav     — nömrə/ikon görünəndə (qısa sinus vuruşu)
  riser.wav   — CTA-dan əvvəl gərginlik (yüksələn ton + küy)
  tick.wav    — söz vurğusu / kiçik keçid

Hamısı orijinaldır, telif riski yoxdur.
İstifadə:  python pipeline/sfx.py
"""
import math, os, wave
import numpy as np

SR = 44100
OUT = os.path.join("public", "sfx")


def env(n, a, d, curve=1.0):
    e = np.ones(n)
    a, d = int(n * a), int(n * d)
    if a: e[:a] = np.linspace(0, 1, a) ** curve
    if d: e[-d:] = np.linspace(1, 0, d) ** curve
    return e


def lowpass_sweep(x, f_start, f_end):
    """Kəsmə tezliyi zamanla dəyişən birinci dərəcəli filtr"""
    n = len(x)
    fc = np.geomspace(f_start, f_end, n)
    a = np.exp(-2 * math.pi * fc / SR)
    y = np.empty(n); acc = 0.0
    for i in range(n):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def whoosh(seconds=0.55, seed=1):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    noise = rng.normal(0, 1, n)
    x = lowpass_sweep(noise, 300, 6000)        # aşağıdan yuxarı süpürmə
    x -= lowpass_sweep(x, 120, 120)            # dumanı çıxar
    x *= env(n, 0.35, 0.5, 1.4)
    return x


def pop(seconds=0.16, freq=520):
    n = int(seconds * SR); t = np.arange(n) / SR
    f = freq * np.exp(-14 * t) + freq * 0.5    # pitch aşağı düşür — "pop" hissi
    x = np.sin(2 * math.pi * np.cumsum(f) / SR)
    x += 0.35 * np.sin(2 * math.pi * np.cumsum(f * 2) / SR)
    x *= np.exp(-22 * t)
    return x


def riser(seconds=1.3, seed=2):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR); t = np.arange(n) / SR
    tone = np.sin(2 * math.pi * np.cumsum(np.geomspace(160, 640, n)) / SR)
    noise = lowpass_sweep(rng.normal(0, 1, n), 400, 8000)
    x = 0.55 * tone + 0.6 * noise
    x *= np.linspace(0.05, 1, n) ** 2.2 * env(n, 0.02, 0.06)
    return x


def tick(seconds=0.06, freq=1800):
    n = int(seconds * SR); t = np.arange(n) / SR
    return np.sin(2 * math.pi * freq * t) * np.exp(-60 * t)


def write(name, x, peak_db=-6.0):
    x = x / (np.max(np.abs(x)) + 1e-9) * (10 ** (peak_db / 20))
    pcm = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  {name:12} {len(x)/SR:.2f}s")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write("whoosh.wav", whoosh())
    write("pop.wav", pop())
    write("riser.wav", riser())
    write("tick.wav", tick(), peak_db=-12)
