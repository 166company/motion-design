/** Render sonrası avtomatik yoxlama — səhv video heç vaxt yayımlanmasın. */
import fs from "node:fs/promises";

export type QaResult = { ok: boolean; checks: { name: string; ok: boolean; note: string }[] };

const FPS = 30;

export const qa = async (videoPath: string, propsPath: string): Promise<QaResult> => {
  const checks: QaResult["checks"] = [];
  const add = (name: string, ok: boolean, note: string) => checks.push({ name, ok, note });

  const stat = await fs.stat(videoPath).catch(() => null);
  add("fayl mövcuddur", !!stat, stat ? "OK" : "video tapılmadı");
  if (!stat) return { ok: false, checks };

  const mb = stat.size / 1024 / 1024;
  add("həcm < 100 MB", mb < 100, `${mb.toFixed(1)} MB`);
  add("həcm > 1 MB", mb > 1, `${mb.toFixed(1)} MB`);

  const reel = JSON.parse(await fs.readFile(propsPath, "utf-8"));
  // Keçidlər üst-üstə düşür: hər keçid 12 kadr qısaldır (TipList.TRANSITION)
  const TRANSITION = 12;
  const sec = (reel.scenes.reduce((a: number, b: any) => a + b.durationInFrames, 0) - (reel.scenes.length - 1) * TRANSITION) / FPS;
  add("müddət 15–60 san", sec >= 15 && sec <= 60, `${sec.toFixed(1)} san`);
  // Explainer şablonunda stok media yoxdur (hər şey kodla çəkilir) — yalnız TipList üçün yoxla
  const isTipList = reel.scenes.some((s: any) => "media" in s);
  if (isTipList) {
    const noMedia = reel.scenes.filter((s: any) => s.kind !== "cta" && !s.media).length;
    add("bütün səhnələrdə fon var", noMedia === 0, noMedia ? `${noMedia} səhnə boş` : "OK");
  }

  // TipList-də hook 6 san; Explainer-in girişi vizual səhnədir (kub düşür) — 8 san icazəlidir
  const hookMax = isTipList ? 7 : 8;
  add(`hook ≤ ${hookMax} san`, reel.scenes[0].durationInFrames / FPS <= hookMax,
      `${(reel.scenes[0].durationInFrames / FPS).toFixed(1)} san`);


  const noWords = reel.scenes.filter((s: any) => s.audio && s.words.length === 0).length;
  add("altyazı vaxtları var", noWords === 0, noWords ? `${noWords} səhnədə söz yoxdur` : "OK");

  // azərbaycan hərfləri mətndə qorunubmu
  const allText = JSON.stringify(reel);
  add("azərbaycan hərfləri", /[əğışçöü]/i.test(allText), "ə/ğ/ı/ş yoxlanıldı");

  return { ok: checks.every((c) => c.ok), checks };
};

if (process.argv[1]?.endsWith("qa.ts")) {
  const [, , v, p] = process.argv;
  const r = await qa(v, p);
  for (const c of r.checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name.padEnd(28)} ${c.note}`);
  console.log(r.ok ? "\nQA: keçdi" : "\nQA: KEÇMƏDİ");
  process.exit(r.ok ? 0 : 1);
}
