"""
Story şablonu üçün AI illüstrasiya assetləri — OpenAI gpt-image, brend paleti, 3D-yə yaxın üslub.

  python pipeline/gen_assets.py            → çatışmayan assetləri yaradır
  python pipeline/gen_assets.py --all      → hamısını yenidən yaradır
  python pipeline/gen_assets.py truck sofa → yalnız adı çəkilənləri

Nəticə: public/assets/*.png (şəffaf obyektlər, ≤900px) və *.jpg (9:16 fonlar),
src/assetBounds.json (obyektlərin real sərhədləri — yerə oturtmaq üçün).
Xərc: ~0.2 $/şəkil (high). Bir dəfəlik.
"""
import base64, io, json, os, sys, time, urllib.request
from PIL import Image

KEY = os.environ["OPENAI_API_KEY"]
MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2.5-sunburst-2026-09-08")
OUT = os.path.join("public", "assets")

STYLE = (
    "Vibrant, polished 3D-rendered illustration, modern Pixar-like look: soft warm studio lighting, rich gradients, "
    "subtle rim light, gentle ambient occlusion, rounded friendly shapes, high detail but clean silhouettes. "
    "Brand palette dominant: bright orange #FF6600 and dark graphite #1E2124 with white and warm neutral accents. "
    "No text, no letters, no logos."
)
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


def generate(prompt: str, size: str, transparent: bool) -> bytes:
    body = {"model": MODEL, "prompt": prompt, "size": size, "output_format": "png", "quality": "high", "n": 1}
    if transparent:
        body["background"] = "transparent"
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations", data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return base64.b64decode(json.load(r)["data"][0]["b64_json"])


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
    os.makedirs(OUT, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--all" in sys.argv
    bounds_path = os.path.join("src", "assetBounds.json")
    bounds = json.load(open(bounds_path)) if os.path.exists(bounds_path) else {}

    for name, desc in OBJECTS.items():
        path = os.path.join(OUT, f"{name}.png")
        if not force and not args and os.path.exists(path): continue
        if args and name not in args: continue
        t = time.time()
        im = Image.open(io.BytesIO(generate(desc + " " + STYLE + ISO, "1024x1024", True))).convert("RGBA")
        im = clean_transparent(im); im.thumbnail((900, 900)); im.save(path, optimize=True)
        bounds[name] = bbox(im)
        print(f"{name:12} ok  {time.time() - t:.0f}s  alt={bounds[name]['bottom']}")

    for name, desc in BACKGROUNDS.items():
        path = os.path.join(OUT, f"{name}.jpg")
        if not force and not args and os.path.exists(path): continue
        if args and name not in args: continue
        t = time.time()
        im = Image.open(io.BytesIO(generate(desc + " " + STYLE, "1024x1536", False))).convert("RGB")
        im.thumbnail((1080, 1620)); im.save(path, quality=88, optimize=True)
        print(f"{name:12} ok  {time.time() - t:.0f}s")

    json.dump(bounds, open(bounds_path, "w"), indent=1)


if __name__ == "__main__":
    main()
