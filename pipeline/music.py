"""
Fon musiqisi sintezatoru — tam orijinal, telif riski yoxdur, açar tələb etmir.

Səsləndirmənin ALTINDA işləyən yastıq (pad) yaradır: sakit akkordlar,
yumşaq nəbz, hava. Məqsəd diqqəti çəkmək yox, boşluğu doldurmaqdır.

public/music/ qovluğunda hazır trek varsa, bu skript işə düşmür —
run.ts əvvəlcə real trekləri yoxlayır.

İstifadə:  python pipeline/music.py <çıxış.wav> <toxum> [müddət]
"""
import sys, math, wave, struct
import numpy as np

SR = 32000  # 32 kHz mono — fon musiqisi üçün kifayətdir, fayl kiçik qalır

# Sakit, korporativ ovqat verən akkord ardıcıllıqları (yarımton nömrələri)
PROGRESSIONS = [
    [(0, 3, 7), (-4, 0, 5), (-7, -3, 2), (-5, -1, 4)],   # minor, düşünülmüş
    [(0, 4, 7), (-3, 2, 5), (-5, 0, 4), (-7, -3, 0)],    # major, nikbin
    [(0, 3, 7), (-2, 2, 5), (-5, 0, 3), (-4, 0, 5)],     # neytral
]
ROOTS = [146.83, 164.81, 130.81, 174.61, 155.56]  # D3, E3, C3, F3, Eb3


def adsr(n, attack, release):
    """Yumşaq zərf — kliksiz giriş/çıxış"""
    env = np.ones(n)
    a, r = int(n * attack), int(n * release)
    if a:
        env[:a] = np.linspace(0, 1, a) ** 1.6
    if r:
        env[-r:] = np.linspace(1, 0, r) ** 1.6
    return env


def voice(freq, n, rng):
    """Bir not: əsas ton + zəif obertonlar + minimal detune (canlılıq üçün)"""
    t = np.arange(n) / SR
    detune = 1 + rng.uniform(-0.0016, 0.0016)
    sig = (
        1.00 * np.sin(2 * math.pi * freq * detune * t)
        + 0.30 * np.sin(2 * math.pi * freq * 2 * t)
        + 0.12 * np.sin(2 * math.pi * freq * 3 * t)
        + 0.06 * np.sin(2 * math.pi * freq * 4 * t)
    )
    # yavaş tembr dəyişimi — "canlı" hiss
    sig *= 1 + 0.10 * np.sin(2 * math.pi * rng.uniform(0.05, 0.13) * t)
    return sig


def lowpass(x, cutoff):
    """Sadə birinci dərəcəli filtr — kəskin obertonları yumşaldır"""
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def build(seed: int, seconds: float):
    rng = np.random.default_rng(seed)
    prog = PROGRESSIONS[seed % len(PROGRESSIONS)]
    root = ROOTS[(seed // 3) % len(ROOTS)]
    bpm = 72 + (seed % 5) * 4
    bar = 4 * 60 / bpm  # bir akkordun uzunluğu

    n_total = int(seconds * SR)
    out = np.zeros(n_total)

    # --- akkord yastığı ---
    pos = 0
    ci = 0
    while pos < n_total:
        chord = prog[ci % len(prog)]
        n = min(int(bar * SR), n_total - pos)
        # akkordlar bir-birinin üstünə minsin — kəsik olmasın
        n_ext = min(int(n * 1.35), n_total - pos)
        env = adsr(n_ext, 0.28, 0.42)
        for st in chord:
            f = root * (2 ** (st / 12))
            out[pos:pos + n_ext] += 0.30 * voice(f, n_ext, rng) * env
        pos += n
        ci += 1

    # --- sub-bass nəbz: hər vurğuda yumşaq təkan ---
    beat = 60 / bpm
    for k in range(int(seconds / beat)):
        s = int(k * beat * SR)
        n = min(int(0.34 * SR), n_total - s)
        if n <= 0:
            break
        t = np.arange(n) / SR
        amp = 0.30 if k % 4 == 0 else 0.15
        out[s:s + n] += amp * np.sin(2 * math.pi * (root / 2) * t) * np.exp(-9 * t)

    # --- hava: çox zəif filtrlənmiş küy ---
    air = rng.normal(0, 1, n_total)
    air = lowpass(air, 900) * 0.05
    out += air

    out = lowpass(out, 2600)

    # --- səviyyə: səsləndirmənin altında qalmalıdır ---
    out /= (np.max(np.abs(out)) + 1e-9)
    rms = np.sqrt(np.mean(out ** 2))
    out *= (10 ** (-23 / 20)) / (rms + 1e-9)   # ~-23 dBFS RMS
    out = np.clip(out, -0.85, 0.85)

    # giriş/çıxış fade
    f = int(1.6 * SR)
    out[:f] *= np.linspace(0, 1, f)
    out[-f:] *= np.linspace(1, 0, f)
    return out


def write_wav(path, data):
    pcm = (data * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    out_path = sys.argv[1]
    seed = int(sys.argv[2])
    seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
    audio = build(seed, seconds)
    write_wav(out_path, audio)
    rms_db = 20 * math.log10(np.sqrt(np.mean(audio ** 2)) + 1e-9)
    print(f"{out_path} | {seconds:.0f}s | RMS {rms_db:.1f} dBFS")
