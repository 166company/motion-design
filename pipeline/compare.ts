/**
 * Müqayisə aləti — eyni prompt və sxemi əvvəl OpenAI, sonra hər pulsuz modellə işlədir.
 * Heç nə yayımlanmır, asset/render yaradılmır, ideya yaddaşına (remember) yazılmır.
 *
 *   npx tsx pipeline/compare.ts carousel|poster|story|script     → out/compare-<şablon>-<tarix>.md
 *   npx tsx pipeline/compare.ts tts "mətn"                       → out/compare-tts/openai.mp3, edge-banu.mp3, edge-babek.mp3
 *
 * Seçimlər: COMPARE_LIMIT=6 (maks pulsuz model), COMPARE_TIMEOUT_MS=180000
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { candidates, chat, type ChatOpts } from "./llm.ts";
import { novelty } from "./ideas.ts";
import { listArticles, pickArticle } from "./wp.ts";
import { getTrends } from "./trends.ts";
import { posterRequest } from "./poster.ts";
import { carouselRequest } from "./carousel.ts";
import { storyRequest } from "./story.ts";
import { scriptRequest } from "./script.ts";

const LIMIT = Number(process.env.COMPARE_LIMIT ?? 6);
const TIMEOUT = Number(process.env.COMPARE_TIMEOUT_MS ?? 180_000);

/** Şablonun öz sorğusunu qur (məntiq təkrarlanmır — hər şablon öz qurucusunu export edir) */
const buildRequest = async (kind: string): Promise<ChatOpts> => {
  if (kind === "carousel") return carouselRequest(undefined, novelty("Carousel"));
  if (kind === "script") {
    const used: number[] = JSON.parse(await fs.readFile("content/data/used.json", "utf-8").catch(() => "[]"));
    const article = await pickArticle(used);
    console.log(`  məqalə: ${article.title}`);
    return scriptRequest(article, undefined, novelty("TipList"));
  }
  const az = (await listArticles()).filter((a) => a.lang === "az");
  if (kind === "poster") {
    const facts = az.slice(0, 3).map((a) => `• ${a.title}: ${a.text.slice(0, 700)}`).join("\n");
    return posterRequest(facts, await getTrends(), undefined, novelty("Poster", { idea: false }));
  }
  if (kind === "story") {
    const facts = az.slice(0, 3).map((a) => `• ${a.title}\n${a.headings.join(" | ")}\n${a.text.slice(0, 900)}`).join("\n\n");
    const trends = await getTrends();
    const trendText = trends.examples.map((e, i) => `${i + 1}. [${e.platform}] "${e.quote}" — ${e.context} (${e.whyFunny})`).join("\n");
    return storyRequest(facts, trendText, [], undefined, novelty("Story", { motion: true }));
  }
  throw new Error(`naməlum şablon: ${kind} (carousel|poster|story|script|tts)`);
};

const run = async (kind: string) => {
  console.log(`\nSorğu qurulur (${kind})…`);
  const req = await buildRequest(kind);
  const rows: string[] = [];
  const date = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const out = path.join("out", `compare-${kind}-${date}.md`);

  const one = async (label: string, fn: () => Promise<{ text: string; model: string }>) => {
    const t0 = Date.now();
    process.stdout.write(`  ${label.padEnd(38)} `);
    try {
      const r = await fn();
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`✓ ${sec}s`);
      rows.push(`## ${label}\n\n\`${r.model}\` · ${sec} san\n\n\`\`\`json\n${r.text.trim().slice(0, 6000)}\n\`\`\`\n`);
    } catch (e) {
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      const msg = (e as Error).message;
      console.log(`✗ ${msg.slice(0, 100)}`);
      rows.push(`## ${label}\n\nXƏTA (${sec} san): \`${msg.slice(0, 400)}\`\n`);
    }
  };

  // 1) OpenAI (əsas)
  await one("openai (əsas)", async () => {
    const r = await chat({ ...req, timeoutMs: TIMEOUT });
    return { text: r.text, model: `${r.provider}/${r.model}` };
  });

  // 2) Pulsuz namizədlər — hər biri ayrıca, yalnız o provayder/model
  const list = (await candidates("creative")).slice(0, LIMIT);
  for (const c of list) {
    await one(`${c.provider.id}/${c.model}`, async () => {
      const prev = { engine: process.env.LLM_ENGINE, provs: process.env.LLM_PROVIDERS, model: process.env[`LLM_MODEL_${c.provider.id.toUpperCase()}_CREATIVE`] };
      process.env.LLM_ENGINE = "free";
      process.env.LLM_PROVIDERS = c.provider.id;
      process.env[`LLM_MODEL_${c.provider.id.toUpperCase()}_CREATIVE`] = c.model;
      try {
        const r = await chat({ ...req, timeoutMs: TIMEOUT });
        return { text: r.text, model: `${r.provider}/${r.model}` };
      } finally {
        prev.engine === undefined ? delete process.env.LLM_ENGINE : (process.env.LLM_ENGINE = prev.engine);
        prev.provs === undefined ? delete process.env.LLM_PROVIDERS : (process.env.LLM_PROVIDERS = prev.provs);
        const k = `LLM_MODEL_${c.provider.id.toUpperCase()}_CREATIVE`;
        prev.model === undefined ? delete process.env[k] : (process.env[k] = prev.model);
      }
    });
  }

  await fs.mkdir("out", { recursive: true });
  await fs.writeFile(out, `# Müqayisə — ${kind} (${new Date().toISOString()})\n\nEyni prompt və eyni JSON sxem. Yayım/asset/yaddaş YOXDUR.\n\n${rows.join("\n")}`, "utf-8");
  console.log(`\n✓ ${out}\n`);
};

/** Səs müqayisəsi: OpenAI (əsas) + edge-tts Banu/Babek */
const compareTts = async (text: string) => {
  const dir = path.join("out", "compare-tts");
  await fs.mkdir(dir, { recursive: true });
  const py = (script: string, env: Record<string, string>, id: string) =>
    new Promise<void>((res, rej) => {
      const p = spawn("python", [script, dir], { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...env } });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.stdout.on("data", () => {});
      // python stack-inin sonundakı əsl xəta sətrini götür (yalnız son 200 simvol mənasız olur)
      const lastError = () => err.trim().split("\n").reverse().find((l) => /Error|Exception/.test(l))?.trim() ?? err.slice(-300);
      p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${script}: ${lastError()}`))));
      p.stdin.write(JSON.stringify([{ id, text }]));
      p.stdin.end();
    });

  const jobs: [string, string, Record<string, string>, string][] = [
    ["openai (əsas)", "pipeline/tts_openai.py", { TTS_ENGINE: "openai" }, "openai"],
    ["edge Banu", "pipeline/tts.py", { TTS_ENGINE: "edge", TTS_VOICE: "az-AZ-BanuNeural" }, "edge-banu"],
    ["edge Babek", "pipeline/tts.py", { TTS_ENGINE: "edge", TTS_VOICE: "az-AZ-BabekNeural" }, "edge-babek"],
  ];
  for (const [label, script, env, id] of jobs) {
    process.stdout.write(`  ${label.padEnd(16)} `);
    try { await py(script, env, id); console.log(`✓ ${path.join(dir, id)}.mp3`); }
    catch (e) { console.log(`✗ ${(e as Error).message.slice(0, 120)}`); }
  }
};

const kind = (process.argv[2] ?? "").toLowerCase();
if (kind === "tts") await compareTts(process.argv[3] || "Köç günü dramına son. Bir zəng, qalanını Yük.az həll edir. Zəng et: 050 209 62 99");
else if (kind) await run(kind);
else console.log("İstifadə: npx tsx pipeline/compare.ts carousel|poster|story|script  ·  npx tsx pipeline/compare.ts tts \"mətn\"");
