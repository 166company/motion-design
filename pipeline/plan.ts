/**
 * "Dəyişiklik" planını (interpret.ts-in nəticəsi) mühit dəyişənlərinə çevirir.
 * Pipeline-lar bunu import edir: `import "./plan.ts"` — sonra process.env-dən oxuyurlar.
 *
 *   FEEDBACK        → ssenari/mətn modelinə qeyd
 *   VISUAL_NOTES    → foto/illüstrasiya promptlarına (ingiliscə)
 *   IMAGE_REFS      → istinad şəkil URL-ləri (vergüllə)
 *   MUSIC_MOOD      → energetic | calm | none
 *   OPENAI_TTS_VOICE, EXPLAINER_SILENT, STORY_VOICE, ASSET_HINTS
 */
import fs from "node:fs";

const path = process.env.FEEDBACK_PLAN ?? "feedback-plan.json";
if (fs.existsSync(path)) {
  const p = JSON.parse(fs.readFileSync(path, "utf-8"));
  const set = (k: string, v: string | null | undefined) => { if (v !== null && v !== undefined && v !== "") process.env[k] = v; };
  set("FEEDBACK", p.contentNotes);
  set("VISUAL_NOTES", p.visualNotes);
  set("IMAGE_REFS", (p.imageRefs ?? []).join(","));
  set("MUSIC_MOOD", p.musicMood);
  set("OPENAI_TTS_VOICE", p.voice);
  set("ASSET_HINTS", (p.assetHints ?? []).join(","));
  if (p.silent === true) { process.env.EXPLAINER_SILENT = "1"; process.env.STORY_VOICE = "0"; }
  if (p.silent === false) { process.env.EXPLAINER_SILENT = ""; process.env.STORY_VOICE = "1"; }
  console.log(`  plan: ${p.summary ?? ""}`);
}
