/**
 * NVIDIA API — əl ilə sınaq və toplu yaratma.
 *
 *   npx tsx pipeline/nvidia_cli.ts test                               → açarı yoxla (1 kiçik şəkil)
 *   npx tsx pipeline/nvidia_cli.ts image "prompt" --format story      → out/nvidia/<vaxt>-story.jpg
 *   npx tsx pipeline/nvidia_cli.ts formats "prompt"                   → eyni səhnə BÜTÜN formatlarda
 *   npx tsx pipeline/nvidia_cli.ts object "orange moving truck"       → şəffaf PNG (animasiya asseti)
 *   npx tsx pipeline/nvidia_cli.ts video out/nvidia/x.jpg             → şəkildən qısa hərəkətli klip (mp4)
 *   npx tsx pipeline/nvidia_cli.ts 3d "cardboard moving box"          → .glb
 *   npx tsx pipeline/nvidia_cli.ts models                             → modellər + lisenziyalar
 *
 * Seçimlər: --model flux.1-schnell|sd3.5-large  --seed 123  --out yol
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { FORMATS, IMAGE_MODELS, nvImage, nvImageToFile, nvImageToVideo, nvText3D, type FormatKey } from "./nvidia.ts";

const BRAND =
  "Brand colors: bright orange #FF6600 and dark graphite #1E2124 with white accents. No text, no letters, no logos, no watermarks.";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const [cmd, ...rest] = positional;
const text = rest.join(" ");
const model = flag("model");
const seed = flag("seed") ? Number(flag("seed")) : undefined;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = "out/nvidia";

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  switch (cmd) {
    case "models":
      for (const [id, m] of Object.entries(IMAGE_MODELS))
        console.log(`${m.commercial ? "✅" : "⛔"} ${id.padEnd(18)} ${m.license}`);
      console.log("\nFormatlar:");
      for (const [k, f] of Object.entries(FORMATS)) console.log(`  ${k.padEnd(10)} ${f.w}×${f.h}  ${f.label}`);
      return;

    case "test": {
      const buf = await nvImage("A cardboard moving box on a wooden floor, soft daylight. " + BRAND, { format: "square", model, seed: 1 });
      const dest = flag("out") ?? path.join(OUT, `test-${stamp}.jpg`);
      await fs.writeFile(dest, buf);
      console.log(`✓ Açar işləyir → ${dest} (${Math.round(buf.length / 1024)} KB)`);
      return;
    }

    case "image": {
      if (!text) throw new Error('Prompt yaz: image "..." --format post');
      const format = (flag("format") ?? "post") as FormatKey;
      if (!FORMATS[format]) throw new Error(`Format: ${Object.keys(FORMATS).join(", ")}`);
      const dest = flag("out") ?? path.join(OUT, `${stamp}-${format}.${format === "object" ? "png" : "jpg"}`);
      await nvImageToFile(`${text} ${BRAND}`, dest, { format, model, seed });
      console.log(`✓ ${dest}`);
      return;
    }

    case "formats": {
      if (!text) throw new Error('Prompt yaz: formats "..."');
      const s = seed ?? Math.floor(Math.random() * 2 ** 31); // eyni seed → formatlar arası oxşar səhnə
      for (const f of Object.keys(FORMATS) as FormatKey[]) {
        if (f === "object") continue;
        const dest = path.join(OUT, `${stamp}-${f}.jpg`);
        const composition = FORMATS[f].h === FORMATS[f].w
          ? " Centered composition, calm empty area at the bottom for typography."
          : FORMATS[f].h > FORMATS[f].w
          ? " Vertical composition, main subject in the middle, empty calm area in the lower third for typography."
          : " Wide composition, main subject on the right third, calm empty space on the left for typography.";
        await nvImageToFile(`${text}${composition} ${BRAND}`, dest, { format: f, model, seed: s });
        console.log(`✓ ${f.padEnd(10)} ${dest}`);
      }
      return;
    }

    case "object": {
      if (!text) throw new Error('Obyekt təsviri yaz: object "orange truck"');
      const dest = flag("out") ?? path.join(OUT, `${stamp}-object.png`);
      await nvImageToFile(
        `${text}. Vibrant polished 3D illustration, soft studio light, rounded friendly shapes, strict side view, centered. ${BRAND}`,
        dest, { format: "object", model, seed },
      );
      console.log(`✓ şəffaf PNG → ${dest}`);
      return;
    }

    case "video": {
      const src = rest[0];
      if (!src) throw new Error("Şəkil yolu ver: video out/nvidia/x.jpg");
      const dest = flag("out") ?? path.join(OUT, `${stamp}-motion.mp4`);
      await nvImageToVideo(await fs.readFile(src), dest, { seed });
      console.log(`✓ ${dest}`);
      return;
    }

    case "3d": {
      if (!text) throw new Error('Təsvir yaz (ingiliscə, ≤77 simvol): 3d "cardboard box"');
      const dest = flag("out") ?? path.join(OUT, `${stamp}.glb`);
      await nvText3D(text, dest, { seed });
      console.log(`✓ ${dest}`);
      return;
    }

    default:
      console.log(await fs.readFile(new URL(import.meta.url), "utf8").then((s) => s.split("*/")[0]));
  }
};

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
