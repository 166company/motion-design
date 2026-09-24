"""
Story şablonu üçün AI illüstrasiya assetləri — OpenAI gpt-image, brend paleti, 3D-yə yaxın üslub.

  python pipeline/gen_assets.py            → çatışmayan assetləri yaradır
  python pipeline/gen_assets.py --all      → hamısını yenidən yaradır
  python pipeline/gen_assets.py truck sofa → yalnız adı çəkilənləri

Nəticə: public/assets/*.png (şəffaf obyektlər, ≤900px) və *.jpg (9:16 fonlar),
src/assetBounds.json (obyektlərin real sərhədləri — yerə oturtmaq üçün).
Xərc: ~0.2 $/şəkil (high, OpenAI) · 0 $ (IMAGE_ENGINE=nvidia, NVIDIA_API_KEY).

Hər post üçün FƏRQLİ asset dəsti (story.ts):
  ASSET_DIR=public/render/<id>/assets  BOUNDS_PATH=public/render/<id>/bounds.json
  ASSET_STYLE="<ingiliscə üslub>"  ASSET_SETTING="<ingiliscə məkan/əhval>"  ASSET_OBJECTS='{"truck": "...", ...}'
"""
import base64, io, json, os, sys, time, urllib.error, urllib.request
from PIL import Image

# IMAGE_ENGINE=nvidia → NVIDIA build.nvidia.com (pulsuz, FLUX.1-schnell); default openai
ENGINE = os.environ.get("IMAGE_ENGINE", "openai").lower()
KEY = os.environ.get("OPENAI_API_KEY", "")
NV_KEY = os.environ.get("NVIDIA_API_KEY", "")
NV_MODEL = os.environ.get("NVIDIA_IMAGE_MODEL", "flux.1-schnell")
NV_PATHS = {  # yalnız kommersiya icazəli modellər (bax pipeline/nvidia.ts)
    "flux.1-schnell": ("black-forest-labs/flux.1-schnell", {"steps": 4, "cfg_scale": 0, "mode": "base"}),
    "sd3.5-large": ("stabilityai/stable-diffusion-3_5-large", {"steps": 40, "cfg_scale": 4.5, "mode": "base"}),
}
if ENGINE == "nvidia" and not NV_KEY:
    sys.exit("IMAGE_ENGINE=nvidia, amma NVIDIA_API_KEY yoxdur")
if ENGINE != "nvidia" and not KEY:
    sys.exit("OPENAI_API_KEY yoxdur (və ya IMAGE_ENGINE=nvidia + NVIDIA_API_KEY istifadə et)")
MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2.5-sunburst-2026-09-08")
OUT = os.environ.get("ASSET_DIR") or os.path.join("public", "assets")
BOUNDS_PATH = os.environ.get("BOUNDS_PATH") or os.path.join("src", "assetBounds.json")

PALETTE = "Brand palette dominant: bright orange #FF6600 and dark graphite #1E2124 with white and warm neutral accents. No text, no letters, no logos."
DEFAULT_STYLE = (
    "Vibrant, polished 3D-rendered illustration, modern Pixar-like look: soft warm studio lighting, rich gradients, "
    "subtle rim light, gentle ambient occlusion, rounded friendly shapes, high detail but clean silhouettes. "
)
# Post üçün fərqli üslub (story.ts verir) — bütün assetlər eyni üslubda olsun deyə hər prompta eyni cümlə gedir
STYLE = (os.environ.get("ASSET_STYLE", "").strip() or DEFAULT_STYLE).rstrip(".") + ". " + PALETTE
SETTING = os.environ.get("ASSET_SETTING", "").strip()
ISO = " Single isolated object, strict side view (orthographic), centered, fully TRANSPARENT background."

OBJECTS = {
    "truck":  "Modern box delivery truck facing right: cargo box dark graphite with soft edge highlights, cab bright orange with glossy window, chunky wheels with orange hubs, small headlight glow.",
    "boxes":  "A neat stack of three cardboard moving boxes with orange packing tape, warm cardboard texture, slightly playful proportions.",
    "mover":  "Friendly young mover character, full body, mid-stride walking to the right, carrying a cardboard box, orange t-shirt, dark graphite pants and cap, warm smile, expressive.",
    "phone":  "A smartphone standing upright showing an incoming call screen with a large orange phone icon and a green accept button, glossy screen reflection.",
    "sofa":   "A cozy modern sofa with plump orange cushions and dark graphite frame, soft fabric shading.",
    "plant":  "A potted indoor plant in an orange ceramic pot, lush green leaves.",
}
BACKGROUNDS = {
    "bg_street":   "Vertical 9:16 scene: a stylized sunny city street at golden hour with mid-rise apartment buildings in graphite and warm tones, orange awnings and balconies, trees, a clean asphalt road running across the bottom quarter of the frame (road surface occupies roughly the lowest 28% of the image), soft depth haze, no people, no vehicles, no text.",
    "bg_home":     "Vertical 9:16 scene: entrance of a modern welcoming residential building, warm evening light, glowing windows, small garden and trees, a clean paved road across the bottom quarter of the frame (lowest 28%), no people, no vehicles, no text.",
    "bg_interior": "Vertical 9:16 scene: a bright cozy apartment living room being packed for moving, cardboard boxes stacked along the walls, morning sunlight through a big window, wooden floor occupying the bottom third, empty center floor space, no people, no text.",
}


# Post üçün obyekt/fon dəsti (JSON, ingiliscə):
#   ASSET_OBJECTS='{"grandpa_piano": "...", "truck": "..."}'  — mövcud adı əvəz edir, YENİ ad əlavə edir
#   ASSET_BACKGROUNDS='{"bg_garage": "..."}'                  — eyni məntiq fonlar üçün
#   ASSET_ONLY=1                                              — YALNIZ verilənlər (default dəst istehsal olunmur)
_only = os.environ.get("ASSET_ONLY", "").strip() == "1"
def _merge(target: dict, env_name: str):
    raw = os.environ.get(env_name, "").strip()
    given = {}
    if raw:
        try:
            given = {k: v for k, v in json.loads(raw).items() if v}
        except Exception as e:
            print(f"{env_name} oxunmadı:", e)
    if _only and given:
        target.clear()
    target.update(given)

_merge(OBJECTS, "ASSET_OBJECTS")
_merge(BACKGROUNDS, "ASSET_BACKGROUNDS")

VISUAL = os.environ.get("VISUAL_NOTES", "").strip()
REFS = [u for u in os.environ.get("IMAGE_REFS", "").split(",") if u]


_last_nv = [0.0]


def nv_generate(prompt: str, size: str, transparent: bool) -> bytes:
    """NVIDIA NIM: şəffaf fon yoxdur → ağ fonda yaradıb flood-fill ilə şəffaf edirik (nv_cut_white)."""
    if NV_MODEL not in NV_PATHS:
        sys.exit(f"NVIDIA_IMAGE_MODEL={NV_MODEL} dəstəklənmir burada: {', '.join(NV_PATHS)}")
    path, extra = NV_PATHS[NV_MODEL]
    w, h = (1024, 1024) if size == "1024x1024" else (896, 1344)  # 2:3 fon
    if transparent:
        prompt = prompt.replace("fully TRANSPARENT background", "plain pure white (#FFFFFF) seamless background, no floor, no background shadow")
    body = {"prompt": prompt[:9500], "width": w, "height": h, "seed": int.from_bytes(os.urandom(3), "big"), "samples": 1, **extra}
    url = os.environ.get("NVIDIA_BASE_URL", "https://ai.api.nvidia.com/v1/genai") + "/" + path
    for attempt in range(1, 6):
        gap = float(os.environ.get("NVIDIA_MIN_GAP_MS", "1600")) / 1000 - (time.time() - _last_nv[0])
        if gap > 0: time.sleep(gap)
        _last_nv[0] = time.time()
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
            "Authorization": f"Bearer {NV_KEY}", "Accept": "application/json", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                j = json.load(r)
            break
        except urllib.error.HTTPError as e:
            txt = e.read().decode("utf-8", "replace")[:300]
            if e.code == 422 and (w, h) != (1024, 1024):
                print(f"  [nvidia] {w}x{h} qəbul olunmadı → 1024x1024"); w = h = 1024; body.update(width=1024, height=1024); continue
            if (e.code == 429 or e.code >= 500) and attempt < 5:
                wait = min(60, 3 * 2 ** (attempt - 1)); print(f"  [nvidia] HTTP {e.code}, {wait}s gözləyirəm"); time.sleep(wait); continue
            raise RuntimeError(f"NVIDIA {e.code}: {txt}")
        except urllib.error.URLError:
            if attempt >= 5: raise
            time.sleep(2 * attempt)
    a = (j.get("artifacts") or [{}])[0]
    if a.get("finishReason") not in (None, "SUCCESS"):
        raise RuntimeError(f"NVIDIA finishReason={a.get('finishReason')}")
    b64 = a.get("base64") or j.get("image") or (j.get("data") or [{}])[0].get("b64_json")
    if not b64:
        raise RuntimeError("NVIDIA cavabında şəkil yoxdur: " + json.dumps(j)[:200])
    raw = base64.b64decode(b64.split(",", 1)[-1])
    if not transparent:
        return raw
    out = io.BytesIO(); nv_cut_white(Image.open(io.BytesIO(raw)).convert("RGBA")).save(out, "PNG")
    return out.getvalue()


def nv_cut_white(im: Image.Image, tol: int = 38) -> Image.Image:
    """Kənarlardan flood-fill: yalnız fona BİRLƏŞƏN ağ piksellər şəffaf olur, obyektin içindəki ağ qalır."""
    px = im.load(); W, H = im.size
    seen = bytearray(W * H)
    stack = [(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)]
    while stack:
        x, y = stack.pop()
        i = y * W + x
        if seen[i]: continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        d = 765 - (r + g + b)
        if d > tol * 3: continue
        px[x, y] = (r, g, b, 0 if d < tol else round(255 * (d - tol) / (tol * 2)))
        if x > 0: stack.append((x - 1, y))
        if x < W - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < H - 1: stack.append((x, y + 1))
    return im


def generate(prompt: str, size: str, transparent: bool) -> bytes:
    if VISUAL:
        prompt += f" Additional style guidance: {VISUAL}."
    if ENGINE == "nvidia":
        if REFS: print("  [nvidia] IMAGE_REFS istinad şəkli NVIDIA-da dəstəklənmir — yalnız prompt işlədilir")
        return nv_generate(prompt, size, transparent)
    if REFS:
        # istinad şəkil → edits API (multipart)
        ref = urllib.request.urlopen(REFS[0], timeout=60).read()
        b = "----ya" + os.urandom(6).hex()
        def part(k, v):
            return f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        body = part("model", MODEL) + part("prompt", "Create a NEW object in the style, lighting and rendering of the reference image. " + prompt) + part("size", size) + part("quality", "high")
        if transparent:
            body += part("background", "transparent")
        body += (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"ref.png\"\r\nContent-Type: image/png\r\n\r\n").encode() + ref + f"\r\n--{b}--\r\n".encode()
        req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body,
                                     headers={"Authorization": f"Bearer {KEY}", "Content-Type": f"multipart/form-data; boundary={b}"})
        return _open_b64(req)
    body = {"model": MODEL, "prompt": prompt, "size": size, "output_format": "png", "quality": "high", "n": 1}
    if transparent:
        body["background"] = "transparent"
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations", data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    return _open_b64(req)


def _open_b64(req, tries: int = 4):
    """429 / 5xx → gözlə və yenidən cəhd et (şəkil API-si tez-tez limitə düşür)"""
    delay = 20
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return base64.b64decode(json.load(r)["data"][0]["b64_json"])
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                raise
            print(f"  şəkil API {e.code} — {delay} san gözlənilir ({i + 1}/{tries - 1})", flush=True)
            time.sleep(delay); delay = int(delay * 2.2)
        except Exception as e:
            if i == tries - 1:
                raise
            print(f"  şəkil xətası ({e}) — {delay} san", flush=True)
            time.sleep(delay); delay = int(delay * 2.2)


def clean_transparent(im: Image.Image) -> Image.Image:
    """Model bəzən zəif fon qalığı buraxır — künc rənginə yaxın pikselləri şəffaf et"""
    px = im.load(); W, H = im.size; bg = px[2, 2]
    if bg[3] > 0:
        for y in range(H):
            for x in range(W):
                r, g, b, a = px[x, y]
                if a < 60 or (abs(r - bg[0]) < 14 and abs(g - bg[1]) < 14 and abs(b - bg[2]) < 14):
                    px[x, y] = (r, g, b, 0)
    return im


def bbox(im: Image.Image):
    a = im.split()[3]; l, t, r, b = a.point(lambda v: 255 if v > 40 else 0).getbbox(); W, H = im.size
    return {"w": W, "h": H, "left": round(l / W, 3), "top": round(t / H, 3), "right": round(r / W, 3), "bottom": round(b / H, 3)}


def main():
    # Fotoları SMM agent hazırlayır; bu agent yalnız motion edir (pipeline/photos.ts ilə eyni açar)
    if os.environ.get("PHOTOS", "off").strip().lower() != "on":
        sys.exit("⏸ gen_assets: foto istehsalı söndürülüb (PHOTOS=off). Açmaq üçün repo Variables → PHOTOS=on.")
    os.makedirs(OUT, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--all" in sys.argv
    bounds_path = BOUNDS_PATH
    bounds = json.load(open(bounds_path)) if os.path.exists(bounds_path) else {}

    for name, desc in OBJECTS.items():
        path = os.path.join(OUT, f"{name}.png")
        if not force and not args and os.path.exists(path): continue
        if args and name not in args: continue
        t = time.time()
        im = Image.open(io.BytesIO(generate(desc + " " + STYLE + ISO + " No text, letters or logos on the object.", "1024x1024", True))).convert("RGBA")
        im = clean_transparent(im); im.thumbnail((900, 900)); im.save(path, optimize=True)
        bounds[name] = bbox(im)
        print(f"{name:12} ok  {time.time() - t:.0f}s  alt={bounds[name]['bottom']}")

    for name, desc in BACKGROUNDS.items():
        path = os.path.join(OUT, f"{name}.jpg")
        if not force and not args and os.path.exists(path): continue
        if args and name not in args: continue
        t = time.time()
        strict = " STRICT: empty background plate for animation — absolutely NO people, NO characters, NO faces in windows, NO vehicles, NO furniture, NO boxes, NO text, letters, signs or logos anywhere."
        im = Image.open(io.BytesIO(generate(desc + ((" Mood, weather, season and time of day: " + SETTING + ".") if SETTING else "") + " " + STYLE + strict, "1024x1536", False))).convert("RGB")
        im.thumbnail((1080, 1620)); im.save(path, quality=88, optimize=True)
        print(f"{name:12} ok  {time.time() - t:.0f}s")

    json.dump(bounds, open(bounds_path, "w"), indent=1)


if __name__ == "__main__":
    main()
