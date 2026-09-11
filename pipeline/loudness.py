"""
Səs səviyyəsi normallaşdırıcısı.

Problem: edge-tts (~-25 dBFS), Audius (~-17), sintez (-23) — hamısı fərqli səviyyədədir.
Mix-də sabit nisbət almaq üçün hər mənbə ƏVVƏLCƏDƏN hədəf RMS-ə gətirilir.
Remotion-un öz ffmpeg-i dekod edir, gain numpy ilə hesablanır (loudnorm filtri
slim build-də yoxdur).

İstifadə:  python pipeline/loudness.py <giriş> <çıxış.wav> <hədəf dBFS> [mono|stereo] [pəncərə_san]

pəncərə_san verilərsə (musiqi üçün): trekin ən dolğun <pəncərə> saniyəlik hissəsi
seçilib kəsilir, normallaşdırma həmin parçaya tətbiq olunur. Sakit giriş problemi
bununla həll olunur — lofi/ambient treklərin ilk 10–20 saniyəsi adətən boşdur.
"""
import os, subprocess, sys, tempfile, wave
import numpy as np

PEAK_CEILING_DB = -1.0   # klipdən qorunmaq üçün pik tavanı


def ffmpeg_path():
    plat = f"{sys.platform}-{os.uname().machine if hasattr(os, 'uname') else 'x64'}"
    pkgs = {
        "win32-x64": "compositor-win32-x64-msvc",
        "linux-x86_64": "compositor-linux-x64-gnu",
        "darwin-arm64": "compositor-darwin-arm64",
        "darwin-x86_64": "compositor-darwin-x64",
    }
    name = pkgs.get(plat) or pkgs["win32-x64"]
    exe = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    return os.path.abspath(os.path.join("node_modules", "@remotion", name, exe))


def decode(src, channels):
    tmp = os.path.join(tempfile.mkdtemp(), "dec.wav")
    subprocess.run(
        [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y", "-i", src,
         "-vn", "-ac", str(channels), "-ar", "44100", "-c:a", "pcm_s16le", "-f", "wav", tmp],
        check=True,
    )
    with wave.open(tmp) as w:
        frames = w.readframes(w.getnframes())
    x = np.frombuffer(frames, dtype=np.int16).astype(np.float64) / 32768.0
    return x.reshape(-1, channels)


def normalize(x, target_db):
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9
    gain = 10 ** (target_db / 20) / rms
    peak = np.max(np.abs(x)) * gain
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    if peak > ceiling:            # hədəfə çatmaq klip verərdisə, piki tavanda saxla
        gain *= ceiling / peak
    return np.clip(x * gain, -1.0, 1.0), 20 * np.log10(rms), 20 * np.log10(rms * gain)


def best_window(x, seconds, sr=44100, step=1.0):
    """Ən yüksək RMS-li pəncərə — instrumental fonda bu, tam "groove" hissəsidir"""
    n = int(seconds * sr)
    if len(x) <= n:
        return x
    hop = int(step * sr)
    best, best_rms = 0, -1.0
    for start in range(0, len(x) - n, hop):
        r = np.sqrt(np.mean(x[start:start + n] ** 2))
        if r > best_rms:
            best, best_rms = start, r
    seg = x[best:best + n].copy()
    fade = int(0.8 * sr)                       # kəsik yerlərində klik olmasın
    seg[:fade] *= np.linspace(0, 1, fade)[:, None]
    seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return seg


def write(path, x):
    pcm = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    src, dest, target = sys.argv[1], sys.argv[2], float(sys.argv[3])
    channels = 2 if (len(sys.argv) > 4 and sys.argv[4] == "stereo") else 1
    x = decode(src, channels)
    if len(sys.argv) > 5:
        x = best_window(x, float(sys.argv[5]))
    y, before, after = normalize(x, target)
    write(dest, y)
    print(f"{os.path.basename(src)}: {before:.1f} -> {after:.1f} dBFS")
