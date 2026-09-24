/**
 * NVIDIA build.nvidia.com (NIM) pulsuz API — şəkil, qısa video, 3D.
 *
 * Açar: build.nvidia.com → istənilən model → "Get API Key" (nvapi-...). Kart tələb etmir.
 * Limit: pulsuz səviyyədə ~40 sorğu/dəqiqə — burada sorğular arası fasilə + 429/5xx retry var.
 *
 * Lisenziya (VACİB — yuk.az reklamı kommersiya işidir):
 *   flux.1-schnell   Apache 2.0              ✅ kommersiya
 *   sd3.5-large      Stability Community     ✅ illik gəlir < 1 mln $
 *   flux.1-dev       FLUX.1 [dev] Non-Commercial  ⛔ yalnız test (NVIDIA_ALLOW_NONCOMMERCIAL=1)
 *   flux.1-kontext   FLUX.1 [dev] Non-Commercial  ⛔ yalnız test
 *
 * Dəyişənlər:
 *   NVIDIA_API_KEY            məcburi
 *   NVIDIA_IMAGE_MODEL        flux.1-schnell (default) | sd3.5-large | flux.1-dev | flux.2-klein-4b
 *   NVIDIA_ALLOW_NONCOMMERCIAL=1   qeyri-kommersiya modellərə icazə (yalnız sınaq üçün)
 *   NVIDIA_MIN_GAP_MS         sorğular arası minimum fasilə (default 1600 ≈ 37/dəq)
 */
import fs from "node:fs/promises";
import sharp from "sharp";
import { assertPhotos } from "./photos.ts";

const BASE = "https://ai.api.nvidia.com/v1/genai";
const log = (m: string) => console.log(`  [nvidia] ${m}`);

// ---------------------------------------------------------------- formatlar
/** Bütün sosial/sayt formatları — son ölçü (sharp ilə dəqiq kəsilir) */
export const FORMATS = {
  post:      { w: 1080, h: 1350, label: "Instagram/Facebook post 4:5" },
  square:    { w: 1080, h: 1080, label: "Kvadrat post 1:1" },
  story:     { w: 1080, h: 1920, label: "Story / Reels fonu 9:16" },
  carousel:  { w: 1080, h: 1350, label: "Karusel slaydı 4:5" },
  landscape: { w: 1920, h: 1080, label: "Video fonu / YouTube 16:9" },
  blog:      { w: 1200, h: 675,  label: "Bloq featured image 16:9" },
  og:        { w: 1200, h: 630,  label: "Link önizləmə (OG) 1.91:1" },
  cover:     { w: 1640, h: 624,  label: "Facebook cover" },
  object:    { w: 1024, h: 1024, label: "Şəffaf obyekt (animasiya asseti)" },
} as const;
export type FormatKey = keyof typeof FORMATS;

// ---------------------------------------------------------------- modellər
type ImageModel = {
  path: string;
  commercial: boolean;
  license: string;
  sizes: number[];          // icazəli tərəf ölçüləri
  body: (p: { prompt: string; width: number; height: number; seed: number }) => Record<string, unknown>;
};

const FLUX_SIZES = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];

export const IMAGE_MODELS: Record<string, ImageModel> = {
  "flux.1-schnell": {
    path: "black-forest-labs/flux.1-schnell", commercial: true, license: "Apache 2.0", sizes: FLUX_SIZES,
    body: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed, steps: 4, cfg_scale: 0, mode: "base", samples: 1 }),
  },
  "sd3.5-large": {
    path: "stabilityai/stable-diffusion-3_5-large", commercial: true, license: "Stability Community (< 1 mln $ gəlir)", sizes: FLUX_SIZES,
    body: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed, steps: 40, cfg_scale: 4.5, mode: "base", samples: 1 }),
  },
  "flux.2-klein-4b": {
    path: "black-forest-labs/flux.2-klein-4b", commercial: false, license: "lisenziyanı model kartında yoxla", sizes: FLUX_SIZES,
    body: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed, steps: 4, samples: 1 }),
  },
  "flux.1-dev": {
    path: "black-forest-labs/flux.1-dev", commercial: false, license: "FLUX.1 [dev] Non-Commercial", sizes: FLUX_SIZES,
    body: ({ prompt, width, height, seed }) => ({ prompt, width, height, seed, steps: 30, cfg_scale: 3.5, mode: "base", samples: 1 }),
  },
};

// ---------------------------------------------------------------- HTTP
let lastCall = 0;
const MIN_GAP = Number(process.env.NVIDIA_MIN_GAP_MS ?? 1600);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NvidiaError extends Error {
  constructor(public status: number, public body: string) {
    super(`NVIDIA ${status}: ${body.slice(0, 300)}`);
  }
}

const key = () => {
  const k = process.env.NVIDIA_API_KEY?.trim();
  if (!k) throw new Error("NVIDIA_API_KEY yoxdur (.env və ya GitHub Secrets)");
  return k;
};

/** Sürət limiti + retry (429, 5xx, şəbəkə xətası). 4xx (422 və s.) dərhal atılır. */
export const nvPost = async (modelPath: string, body: unknown, tries = 5): Promise<any> => {
  const url = `${process.env.NVIDIA_BASE_URL ?? BASE}/${modelPath}`;
  for (let attempt = 1; ; attempt++) {
    const wait = lastCall + MIN_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) {
      if (attempt >= tries) throw e;
      log(`şəbəkə xətası, ${attempt}/${tries} — yenidən`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return res.json();
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const ra = Number(res.headers.get("retry-after"));
      const ms = ra > 0 ? ra * 1000 : Math.min(60_000, 3000 * 2 ** (attempt - 1));
      log(`HTTP ${res.status}, ${Math.round(ms / 1000)} san gözləyirəm (${attempt}/${tries})`);
      await sleep(ms);
      continue;
    }
    throw new NvidiaError(res.status, text);
  }
};

/** NIM cavabları: {artifacts:[{base64}]} | {image} | {video} | {data:[{b64_json}]} — hamısını qəbul et */
const pickB64 = (j: any, field: "image" | "video" | "glb"): string => {
  const a = j?.artifacts?.[0];
  const b64 = a?.base64 ?? a?.b64 ?? j?.[field] ?? j?.data?.[0]?.b64_json ?? j?.b64_json;
  if (a?.finishReason && a.finishReason !== "SUCCESS") throw new Error(`NVIDIA finishReason=${a.finishReason} (məzmun filtri ola bilər — promptu dəyiş)`);
  if (typeof b64 !== "string") throw new Error(`NVIDIA cavabında ${field} tapılmadı: ${JSON.stringify(j).slice(0, 200)}`);
  return b64.replace(/^data:[^,]+,/, "");
};

// ---------------------------------------------------------------- şəkil
/** Hədəf nisbətinə ən yaxın icazəli ölçü (modelin qısa/uzun tərəf siyahısından) */
export const nearestSize = (w: number, h: number, sizes: number[]) => {
  const target = w / h;
  let best = { width: 1024, height: 1024, err: Infinity, area: 0 };
  for (const a of sizes)
    for (const b of sizes) {
      const err = Math.abs(Math.log(a / b / target));
      const area = a * b;
      if (err < best.err - 1e-3 || (Math.abs(err - best.err) < 1e-3 && area > best.area)) best = { width: a, height: b, err, area };
    }
  return { width: best.width, height: best.height };
};

export type ImageOpts = {
  format?: FormatKey;
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
  /** obyekt üçün: təmiz ağ fonda yarat, sonra fonu şəffaf et (PNG) */
  transparent?: boolean;
  output?: "jpeg" | "png";
};

const resolveModel = (name?: string) => {
  const id = name ?? process.env.NVIDIA_IMAGE_MODEL ?? "flux.1-schnell";
  const m = IMAGE_MODELS[id];
  if (!m) throw new Error(`Naməlum NVIDIA modeli "${id}". Mövcud: ${Object.keys(IMAGE_MODELS).join(", ")}`);
  if (!m.commercial && process.env.NVIDIA_ALLOW_NONCOMMERCIAL !== "1")
    throw new Error(`${id} lisenziyası kommersiya istifadəsinə icazə vermir (${m.license}). Reklam üçün flux.1-schnell və ya sd3.5-large seç. Yalnız sınaq üçün: NVIDIA_ALLOW_NONCOMMERCIAL=1`);
  return { id, m };
};

/** Mətn → şəkil. Buffer qaytarır (dəqiq hədəf ölçüdə). */
export const nvImage = async (prompt: string, o: ImageOpts = {}): Promise<Buffer> => {
  assertPhotos("NVIDIA şəkli");
  const { id, m } = resolveModel(o.model);
  const fmt = FORMATS[o.format ?? "post"];
  const W = o.width ?? fmt.w, H = o.height ?? fmt.h;
  const transparent = o.transparent ?? o.format === "object";
  const fullPrompt = transparent
    ? `${prompt} Isolated on a plain pure white (#FFFFFF) seamless background, no shadow on the background, no floor, nothing else in frame.`
    : prompt;
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);

  let size = nearestSize(W, H, m.sizes);
  let json: any;
  const t = Date.now();
  try {
    json = await nvPost(m.path, m.body({ prompt: fullPrompt.slice(0, 9500), ...size, seed }));
  } catch (e) {
    // bəzi hosted versiyalar yalnız 1024×1024 qəbul edir → kvadrat yaradıb kəsirik
    if (e instanceof NvidiaError && e.status === 422 && (size.width !== 1024 || size.height !== 1024)) {
      log(`${size.width}×${size.height} qəbul olunmadı → 1024×1024 + kəsmə`);
      size = { width: 1024, height: 1024 };
      json = await nvPost(m.path, m.body({ prompt: fullPrompt.slice(0, 9500), ...size, seed }));
    } else throw e;
  }
  let img = sharp(Buffer.from(pickB64(json, "image"), "base64"));
  log(`${id} ${size.width}×${size.height} → ${W}×${H}  ${((Date.now() - t) / 1000).toFixed(0)}s`);

  if (transparent) {
    const png = await removeWhiteBg(await img.png().toBuffer());
    return sharp(png).resize(W, H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  img = img.resize(W, H, { fit: "cover", position: "attention", kernel: "lanczos3" });
  return (o.output === "png" ? img.png() : img.jpeg({ quality: 90, mozjpeg: true })).toBuffer();
};

/** Şəkli fayla yaz (formatı uzantıdan) */
export const nvImageToFile = async (prompt: string, dest: string, o: ImageOpts = {}) => {
  const buf = await nvImage(prompt, { ...o, output: o.output ?? (dest.endsWith(".png") ? "png" : "jpeg") });
  await fs.writeFile(dest, buf);
  return dest;
};

/**
 * Ağ fonu şəffaf et — kənarlardan flood-fill, ona görə obyektin İÇİNDƏKİ ağ hissələr qalır.
 * Yumşaq kənar: fona yaxınlığa görə alfa azalır.
 */
export const removeWhiteBg = async (input: Buffer, tol = 38): Promise<Buffer> => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = data; // RGBA
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const dist = (i: number) => 765 - (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]); // 0 = tam ağ
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const d = dist(i);
    if (d > tol * 3) continue;
    px[i * 4 + 3] = d < tol ? 0 : Math.round((255 * (d - tol)) / (tol * 2));
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
  return sharp(px, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
};

// ---------------------------------------------------------------- video (motion)
/**
 * Şəkil → ~2-4 san hərəkətli klip (Stable Video Diffusion). Giriş 1024×576-ya salınır.
 * Qeyd: SVD yalnız üfüqi 16:9 (1024×576) verir. 9:16 Reels üçün Remotion-da BackgroundMedia ilə
 * kəsilir (keyfiyyət itir) — ona görə bu, əsas video mənbəyi deyil, fon/B-roll üçün eksperimentdir.
 */
export const nvImageToVideo = async (image: Buffer, dest: string, o: { seed?: number; cfg?: number } = {}) => {
  const jpg = await sharp(image).resize(1024, 576, { fit: "cover", position: "attention" }).jpeg({ quality: 70 }).toBuffer();
  if (jpg.length > 200_000) log(`giriş ${Math.round(jpg.length / 1024)} KB — 200 KB-dan böyükdür, keyfiyyət azaldılır`);
  const small = jpg.length > 200_000 ? await sharp(jpg).jpeg({ quality: 45 }).toBuffer() : jpg;
  const t = Date.now();
  const json = await nvPost("stabilityai/stable-video-diffusion", {
    image: `data:image/jpeg;base64,${small.toString("base64")}`,
    seed: o.seed ?? 0, cfg_scale: o.cfg ?? 1.8, motion_bucket_id: 127,
  });
  await fs.writeFile(dest, Buffer.from(pickB64(json, "video"), "base64"));
  log(`video → ${dest}  ${((Date.now() - t) / 1000).toFixed(0)}s`);
  return dest;
};

// ---------------------------------------------------------------- 3D
/** Mətn → 3D model (.glb). Prompt ≤ 77 simvol (ingiliscə). */
export const nvText3D = async (prompt: string, dest: string, o: { seed?: number } = {}) => {
  if (prompt.length > 77) log(`prompt 77 simvola qısaldıldı`);
  const t = Date.now();
  const json = await nvPost("microsoft/trellis", {
    mode: "text", prompt: prompt.slice(0, 77), output_format: "glb", seed: o.seed ?? 0, samples: 1,
  });
  await fs.writeFile(dest, Buffer.from(pickB64(json, "glb"), "base64"));
  log(`3D → ${dest}  ${((Date.now() - t) / 1000).toFixed(0)}s`);
  return dest;
};

// ---------------------------------------------------------------- mühərrik seçimi
/** IMAGE_ENGINE=nvidia → NVIDIA; openai (default) → köhnə yol; auto → NVIDIA, xəta olsa OpenAI */
export const imageEngine = (): "openai" | "nvidia" | "auto" => {
  const e = (process.env.IMAGE_ENGINE ?? "openai").toLowerCase();
  return e === "nvidia" || e === "auto" ? e : "openai";
};

/** NVIDIA-nı sına, auto rejimdə xəta olsa fallback çağır */
export const withNvidia = async <T>(nv: () => Promise<T>, openai: () => Promise<T>): Promise<T> => {
  const eng = imageEngine();
  if (eng === "openai") return openai();
  try {
    return await nv();
  } catch (e) {
    if (eng === "auto" && process.env.OPENAI_API_KEY) {
      log(`xəta → OpenAI-yə keçirəm: ${(e as Error).message.slice(0, 160)}`);
      return openai();
    }
    throw e;
  }
};
