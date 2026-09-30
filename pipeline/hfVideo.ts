/**
 * Şəkildən video — Hugging Face ZeroGPU-da Wan 2.2 14B (FP8 + Lightning, 4-8 addım).
 * Pulsuzdur: hesab yalnız email ilə, gündə 5 dəqiqə GPU (bir klip ≈ 40-60 san). HF_TOKEN ilə
 * sorğular bizim hesabın kvotasından gedir.
 *
 * Kvota bitəndə QuotaError atılır — SMM agent bunu cəhd saymır, tapşırıq sabah davam edir.
 */
import fs from "node:fs/promises";
import { Client } from "@gradio/client";

const SPACE = process.env.HF_VIDEO_SPACE ?? "zerogpu-aoti/wan2-2-fp8da-aoti-faster";

export class QuotaError extends Error {}

/**
 * Kvota bitəndə nə qədər gözləmək olar (san). Actions dəqiqələri public repoda pulsuzdur — kvota
 * yenilənənə qədər iş dayanmır, gözləyib davam edir (29 Sep: 3 klip hazır idi, run yıxılıb onları itirdi,
 * növbəti planlı run isə 5 saat sonra gəldi). Job-un timeout-u bundan böyük olmalıdır (smm.yml).
 */
const MAX_WAIT_SEC = Number(process.env.HF_MAX_WAIT_SEC ?? 5 * 3600);
let waitedSec = 0;

/** "Try again in 4:42:24" → saniyə */
function retryAfterSec(msg: string): number | null {
  const m = /try again in (?:(\d+):)?(\d+):(\d+)/i.exec(msg);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const NEGATIVE =
  "static, frozen frame, blurry, low quality, jpeg artifacts, deformed, disfigured, extra limbs, fused fingers, " +
  "mutated paws, melting, morphing objects, flickering, text, subtitles, watermark, extra logos, crowd";

let client: Client | null = null;
async function connect(): Promise<Client> {
  if (client) return client;
  const token = process.env.HF_TOKEN;
  client = await Client.connect(SPACE, token ? { hf_token: token as `hf_${string}` } : {});
  return client;
}

/**
 * Bir klip: şəkil + hərəkət təsviri → mp4 (dest). Qaytarır: klipin müddəti (san).
 * Müvəqqəti xətada 2 dəfə yenidən cəhd; kvota xətasında dərhal QuotaError.
 */
export async function imageToVideo(imagePath: string, prompt: string, seconds: number, dest: string): Promise<void> {
  const image = new Blob([await fs.readFile(imagePath)], { type: imagePath.endsWith(".png") ? "image/png" : "image/jpeg" });
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const c = await connect();
      const r = await c.predict("/generate_video", {
        input_image: image,
        prompt,
        // Lightning LoRA 4 addım üçündür; Space GPU vaxtını addım × kadr ilə ayırır — 4 addım + ≤3.5 san ≈ 50 san
        steps: 4,
        negative_prompt: NEGATIVE,
        duration_seconds: Math.min(3.5, Math.max(1, seconds)),
      });
      const data = (r.data ?? []) as { url?: string; video?: { url?: string } }[];
      const url = data.map((d) => d?.url ?? d?.video?.url).find(Boolean);
      if (!url) throw new Error("Space video qaytarmadı");
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`klip yüklənmədi: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 20_000) throw new Error("klip boşdur");
      await fs.writeFile(dest, buf);
      return;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/quota|exceeded|ZeroGPU.*(limit|minutes)|GPU task aborted.*quota/i.test(msg)) {
        const wait = retryAfterSec(msg);
        if (wait !== null && waitedSec + wait + 60 <= MAX_WAIT_SEC) {
          console.log(`  ⏳ GPU kvotası bitdi — ${Math.ceil(wait / 60)} dəq gözləyib davam edirəm (klip itmir)`);
          waitedSec += wait + 60;
          await new Promise((r) => setTimeout(r, (wait + 60) * 1000));
          client = null;
          attempt--; // gözləmə cəhd sayılmır
          continue;
        }
        throw new QuotaError(`Hugging Face gündəlik GPU kvotası bitdi: ${msg.slice(0, 200)}`);
      }
      last = e;
      client = null;
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
