/**
 * LLM qatı — bütün pipeline-ın mətn/JSON işləri buradan keçir. Keyfiyyət birinci: ƏSAS provayder OpenAI.
 *
 *   LLM_ENGINE=openai-first (DEFAULT) əvvəl OpenAI (eyni model, eyni strict json_schema, temperature YOX);
 *                           yalnız 429 / 5xx / insufficient_quota / şəbəkə xətası / açar yoxdursa pulsuza keçir.
 *                           OpenAI 400 (sxem/prompt xətası) → pulsuza KEÇMİR, xəta atılır (kod xətasıdır).
 *   LLM_ENGINE=openai       yalnız OpenAI (ehtiyat yoxdur)
 *   LLM_ENGINE=auto         əvvəl pulsuzlar → hamısı alınmasa OpenAI (əl ilə seçim)
 *   LLM_ENGINE=free         yalnız pulsuz provayderlər (əl ilə seçim)
 *
 * Provayderlər (açarı olan avtomatik qoşulur, sıra LLM_PROVIDERS ilə dəyişir):
 *   NVIDIA_API_KEY      build.nvidia.com           — nemotron-3-ultra, deepseek-v4, glm-5.3, kimi-k3 …
 *   GEMINI_API_KEY      aistudio.google.com        — gemini flash/pro (+ Google Search ilə trend axtarışı)
 *   GROQ_API_KEY        console.groq.com           — çox sürətli (gpt-oss, llama, kimi) + pulsuz Whisper
 *   CEREBRAS_API_KEY    cloud.cerebras.ai          — çox sürətli
 *   OPENROUTER_API_KEY  openrouter.ai              — ":free" modellər
 *   GH_MODELS_TOKEN github.com/settings/tokens — GitHub Models (Actions-da GITHUB_TOKEN da olur)
 *   MISTRAL_API_KEY     console.mistral.ai         — pulsuz "Experiment" planı
 *   SAMBANOVA_API_KEY   cloud.sambanova.ai
 *
 * Model adları dəyişir → hər provayderin /models siyahısı oxunur və üstünlük siyahısına görə seçilir.
 * Əl ilə: LLM_MODEL_<PROVAYDER>_<TASK>=model-id   (məs. LLM_MODEL_NVIDIA_CREATIVE=deepseek-ai/deepseek-v4-flash)
 *
 * Tapşırıq növləri:
 *   creative → kreativ konsept; hər dəfə FƏRQLİ model (rotasiya) → fərqli "zövq", fərqli ideyalar
 *   smart    → plan, analitika, ssenari strukturu; ən güclü model əvvəl
 *   fast     → şərh cavabı, caption; sürətli model
 *   vision   → şəkil görən model (mesajda şəkil varsa avtomatik)
 */
import sharp from "sharp";

export type Task = "creative" | "smart" | "fast" | "vision";
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } };
export type Msg = { role: "system" | "user" | "assistant"; content: string | Part[] };

type Provider = {
  id: string;
  base: string;
  key: () => string | undefined;
  list?: (key: string) => Promise<string[]>;
  prefer: Record<Task, RegExp[]>;
  avoid?: RegExp;
};

const env = (k: string) => process.env[k]?.trim() || undefined;
const log = (m: string) => console.log(`  [llm] ${m}`);

const STRONG = [/nemotron-3-ultra/i, /deepseek-v4(?!.*flash)/i, /kimi-k3/i, /glm-5[.-]3(?!-flash)/i, /gemini-[\d.]+-pro/i, /gpt-oss-120b/i, /qwen3[.-]?\d*-(235|480|max)/i, /llama-4-maverick/i];
const MID = [/deepseek-v4.*flash/i, /nemotron-3-super/i, /gemini-[\d.]+-flash(?!-lite)/i, /mistral-(large|medium)/i, /gemma-4-31b/i, /llama-3\.3-70b/i, /mistral-nemotron/i, /qwen3/i];
const FAST = [/gemini-[\d.]+-flash-lite/i, /gpt-oss-20b/i, /nemotron-3\.5-lightning/i, /llama-3\.1-8b/i, /mistral-small/i, /gemma/i];
const VISION = [/glm-5[.-]3-flash/i, /kimi-k3/i, /gemini-[\d.]+-(pro|flash)/i, /nemotron-3-nano-omni/i, /muse-glimmer/i, /llama-4/i, /llama-3\.2-90b-vision/i, /pixtral|mistral-medium/i, /gpt-4\.1|gpt-4o/i, /vision|vl\b|-vl-/i];
const NOT_CHAT = /embed|rerank|guard|safety|whisper|tts|asr|parakeet|canary|ocr|parse|translate|calibration|cosmos|detector|bevformer|sparsedrive|streampetr|kumo|image|flux|diffusion(?!gemma)|clip|reward/i;

const openaiList = (base: string, filter: (id: string, raw: any) => boolean = () => true) => async (key: string) => {
  const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`models ${r.status}`);
  const j = (await r.json()) as any;
  return ((j.data ?? j) as any[]).filter((m) => filter(String(m.id), m)).map((m) => String(m.id).replace(/^models\//, ""));
};

const pref = (creative: RegExp[], smart = creative, fast = FAST, vision = VISION): Record<Task, RegExp[]> => ({ creative, smart, fast, vision });

export const PROVIDERS: Provider[] = [
  { id: "nvidia", base: "https://integrate.api.nvidia.com/v1", key: () => env("NVIDIA_API_KEY"), prefer: pref([...STRONG, ...MID], [...STRONG, ...MID], [...FAST, ...MID]) },
  { id: "gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: () => env("GEMINI_API_KEY"), prefer: pref([/gemini-[\d.]+-pro/i, /gemini-[\d.]+-flash(?!-lite)/i], [/gemini-[\d.]+-pro/i, /gemini-[\d.]+-flash/i], [/gemini-[\d.]+-flash-lite/i, /gemini-[\d.]+-flash/i]), avoid: /tts|image|live|embedding|aqa|preview-\d\d-\d\d-exp|learnlm/i },
  { id: "groq", base: "https://api.groq.com/openai/v1", key: () => env("GROQ_API_KEY"), prefer: pref([/kimi-k/i, /gpt-oss-120b/i, /llama-4-maverick/i, /qwen3/i, /llama-3\.3-70b/i]) },
  { id: "cerebras", base: "https://api.cerebras.ai/v1", key: () => env("CEREBRAS_API_KEY"), prefer: pref([/qwen-?3.*(235|480)/i, /gpt-oss-120b/i, /glm/i, /llama-4/i, /llama-3\.3-70b/i]) },
  { id: "openrouter", base: "https://openrouter.ai/api/v1", key: () => env("OPENROUTER_API_KEY"), list: openaiList("https://openrouter.ai/api/v1", (id) => id.endsWith(":free")), prefer: pref([/deepseek/i, /kimi/i, /glm/i, /qwen3/i, /llama-4/i, /gemma/i]) },
  {
    id: "github", base: "https://models.github.ai/inference", key: () => env("GH_MODELS_TOKEN") ?? (env("USE_GITHUB_MODELS") === "1" ? env("GITHUB_TOKEN") : undefined),
    list: async (key) => {
      const r = await fetch("https://models.github.ai/catalog/models", { headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`catalog ${r.status}`);
      return ((await r.json()) as any[]).map((m) => String(m.id));
    },
    prefer: pref([/deepseek/i, /gpt-4\.1(?!-nano)/i, /grok/i, /llama-4/i, /mistral-medium/i], [/gpt-4\.1(?!-nano)/i, /deepseek/i], [/gpt-4\.1-mini|gpt-4o-mini/i], [/gpt-4\.1|gpt-4o/i, /llama-4/i]),
  },
  { id: "mistral", base: "https://api.mistral.ai/v1", key: () => env("MISTRAL_API_KEY"), prefer: pref([/mistral-large-latest/i, /mistral-medium-latest/i, /magistral-medium/i], [/mistral-large-latest/i, /mistral-medium-latest/i], [/mistral-small-latest/i], [/mistral-medium-latest/i, /pixtral-large/i]) },
  { id: "sambanova", base: "https://api.sambanova.ai/v1", key: () => env("SAMBANOVA_API_KEY"), prefer: pref([/deepseek-v/i, /llama-4-maverick/i, /qwen3/i, /llama-3\.3-70b/i]) },
];

// ---------------------------------------------------------------- model kəşfi
/** LLM_BASE_<PROVAYDER>=url — proksi və ya test üçün */
const baseOf = (p: Provider) => env(`LLM_BASE_${p.id.toUpperCase()}`) ?? p.base;
const modelCache = new Map<string, Promise<string[]>>();
const modelsOf = (p: Provider, key: string) => {
  if (!modelCache.has(p.id))
    modelCache.set(p.id, (env(`LLM_BASE_${p.id.toUpperCase()}`) ? openaiList(baseOf(p)) : p.list ?? openaiList(p.base))(key).catch((e) => { log(`${p.id}: model siyahısı alınmadı (${e.message})`); return []; }));
  return modelCache.get(p.id)!;
};

const pickModels = (p: Provider, ids: string[], task: Task, max = 3): string[] => {
  const manual = env(`LLM_MODEL_${p.id.toUpperCase()}_${task.toUpperCase()}`);
  if (manual) return manual.split(",").map((s) => s.trim());
  const usable = ids.filter((id) => !NOT_CHAT.test(id) && !(p.avoid?.test(id)));
  const out: string[] = [];
  for (const re of p.prefer[task]) {
    const hit = usable.filter((id) => re.test(id)).sort((a, b) => b.length - a.length)[0];
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length >= max) break;
  }
  return out;
};

export type Candidate = { provider: Provider; model: string; key: string; base: string };

/** Tapşırıq üçün namizədlər (provayder × model). */
export const candidates = async (task: Task): Promise<Candidate[]> => {
  const order = (env("LLM_PROVIDERS") ?? "nvidia,gemini,groq,cerebras,github,openrouter,mistral,sambanova").split(",").map((s) => s.trim());
  const provs = order.map((id) => PROVIDERS.find((p) => p.id === id)).filter((p): p is Provider => !!p && !!p.key());
  const lists = await Promise.all(provs.map(async (p) => ({ p, key: p.key()!, ids: await modelsOf(p, p.key()!) })));
  const perProv = lists.map(({ p, key, ids }) => pickModels(p, ids, task, task === "creative" ? 3 : 2).map((model) => ({ provider: p, model, key, base: baseOf(p) })));
  // provayderləri növbə ilə qarışdır: nvidia#1, gemini#1, groq#1, nvidia#2, …
  const out: Candidate[] = [];
  for (let i = 0; i < 3; i++) for (const l of perProv) if (l[i]) out.push(l[i]);
  return out;
};

// ---------------------------------------------------------------- JSON sxem köməkçiləri
const schemaHint = (schema: unknown) =>
  `\n\nÇIXIŞ FORMATI: YALNIZ etibarlı JSON qaytar (markdown yox, izah yox, \`\`\` yox). JSON bu JSON Schema-ya tam uyğun olmalıdır — bütün "required" sahələr, "enum" dəyərləri, "minItems"/"maxItems" limitləri:\n${JSON.stringify(schema)}`;

export const extractJSON = (text: string): unknown => {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try { return JSON.parse(t); } catch { /* aşağıda */ }
  const s = t.search(/[{[]/);
  const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (s < 0 || e <= s) throw new Error("cavabda JSON yoxdur");
  return JSON.parse(t.slice(s, e + 1));
};

/** Yüngül sxem yoxlaması; maxItems aşılsa kəsir (düzəldir), qalan uyğunsuzluqları qaytarır */
export const validate = (schema: any, v: any, path = "$"): string[] => {
  if (!schema || typeof schema !== "object") return [];
  const errs: string[] = [];
  const type = schema.type;
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${path}: ${JSON.stringify(v)} enum-da yoxdur (${schema.enum.join("|")})`);
  if (type === "object") {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return [`${path}: obyekt olmalıdır`];
    for (const r of schema.required ?? []) if (!(r in v)) errs.push(`${path}.${r}: yoxdur`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in v) errs.push(...validate(sub, v[k], `${path}.${k}`));
  } else if (type === "array") {
    if (!Array.isArray(v)) return [`${path}: massiv olmalıdır`];
    if (schema.maxItems != null && v.length > schema.maxItems) v.splice(schema.maxItems);
    if (schema.minItems != null && v.length < schema.minItems) errs.push(`${path}: ən azı ${schema.minItems} element lazımdır (${v.length} var)`);
    v.forEach((x: any, i: number) => errs.push(...validate(schema.items, x, `${path}[${i}]`)));
  } else if (type === "string" && typeof v !== "string") errs.push(`${path}: mətn olmalıdır`);
  else if ((type === "number" || type === "integer") && typeof v !== "number") errs.push(`${path}: rəqəm olmalıdır`);
  else if (type === "boolean" && typeof v !== "boolean") errs.push(`${path}: boolean olmalıdır`);
  return errs;
};

// ---------------------------------------------------------------- şəkillər (pulsuz provayderlər http URL-i həmişə qəbul etmir)
const imgCache = new Map<string, string>();
const inlineImages = async (messages: Msg[]): Promise<Msg[]> =>
  Promise.all(messages.map(async (m) => {
    if (typeof m.content === "string") return m;
    const parts = await Promise.all(m.content.map(async (p) => {
      if (p.type !== "image_url" || p.image_url.url.startsWith("data:")) return p;
      const url = p.image_url.url;
      if (!imgCache.has(url)) {
        try {
          const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
          const jpg = await sharp(buf).resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
          imgCache.set(url, `data:image/jpeg;base64,${jpg.toString("base64")}`);
        } catch { imgCache.set(url, ""); }
      }
      const data = imgCache.get(url)!;
      return data ? { ...p, image_url: { url: data } } : { type: "text" as const, text: `(şəkil yüklənmədi: ${url})` };
    }));
    return { ...m, content: parts };
  }));

const hasImages = (messages: Msg[]) => messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));

// ---------------------------------------------------------------- HTTP
class HttpError extends Error {
  constructor(public status: number, body: string) { super(`HTTP ${status}: ${body.slice(0, 240)}`); }
}

const post = async (base: string, key: string, body: unknown, timeoutMs: number) => {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://yuk.az", "X-Title": "Yuk.az Motion Agent" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new HttpError(r.status, await r.text());
  const j = (await r.json()) as any;
  const content = j.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((c: any) => c.text ?? "").join("") : content;
  if (!text) throw new Error("boş cavab");
  return String(text);
};

/** Bir namizəd üçün: json_schema → json_object → sərbəst (400/422-də növbəti formata keç) */
const tryCandidate = async (c: Candidate, messages: Msg[], schema: any, name: string, temperature: number | undefined, timeoutMs: number) => {
  const formats = schema
    ? [{ type: "json_schema", json_schema: { name, strict: true, schema } }, { type: "json_object" }, undefined]
    : [undefined];
  const msgs = schema
    ? messages.map((m, i) => (i === 0 && m.role === "system" && typeof m.content === "string" ? { ...m, content: m.content + schemaHint(schema) } : m))
    : messages;
  if (schema && msgs[0]?.role !== "system") msgs.unshift({ role: "system", content: schemaHint(schema).trim() });
  let last: unknown;
  for (const fmt of formats) {
    try {
      return await post(c.base, c.key, {
        model: c.model, messages: msgs, ...(fmt ? { response_format: fmt } : {}),
        ...(temperature != null ? { temperature } : {}), max_tokens: 8192,
      }, timeoutMs);
    } catch (e) {
      last = e;
      if (e instanceof HttpError && (e.status === 400 || e.status === 422)) continue; // format dəstəklənmir
      throw e;
    }
  }
  throw last;
};

// ---------------------------------------------------------------- OpenAI (ƏSAS yol — köhnə davranışın eyni)
class NoKeyError extends Error {}

/**
 * Köhnə kodun eyni çağırışı: çağıran faylın öz model sabiti, strict json_schema,
 * TEMPERATURE GÖNDƏRİLMİR (köhnə kod da göndərmirdi), max_tokens yoxdur.
 */
const openaiChat = async (messages: Msg[], schema: any, name: string, task: Task, model?: string) => {
  const key = env("OPENAI_API_KEY");
  if (!key) throw new NoKeyError("OPENAI_API_KEY yoxdur");
  const m = model ?? (task === "fast" ? env("OPENAI_MODEL") ?? "gpt-5.4-mini" : env("OPENAI_CREATIVE_MODEL") ?? "gpt-5.5");
  const text = await post("https://api.openai.com/v1", key, {
    model: m, messages, ...(schema ? { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } : {}),
  }, 300_000);
  return { text, provider: "openai", model: m };
};

/**
 * OpenAI xətası ehtiyata keçməyə əsas verirmi?
 *   BƏLİ: açar yoxdur · 429 (limit/kvota) · 5xx · şəbəkə/timeout · insufficient_quota
 *   XEYR: 400/401/403/404/422 və sxem xətaları — bunlar KOD xətasıdır, pulsuz maskalamamalıdır.
 */
const openaiFallbackReason = (e: unknown): string | null => {
  if (e instanceof NoKeyError) return "OPENAI_API_KEY yoxdur";
  if (e instanceof HttpError) {
    if (e.status === 429) return `limit/kvota (429)`;
    if (e.status >= 500) return `server xətası (${e.status})`;
    if (/insufficient_quota|billing_hard_limit|quota/i.test(e.message)) return "kvota bitib";
    return null;                       // 400/401/403/404/422 → xəta atılsın
  }
  const msg = (e as Error)?.message ?? String(e);
  if (/fetch failed|network|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|aborted|timeout|TimeoutError/i.test(msg)) return `şəbəkə (${msg.slice(0, 60)})`;
  if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") return "vaxt bitdi";
  return null;
};

// ---------------------------------------------------------------- əsas API
export type ChatOpts = {
  task: Task;
  messages: Msg[];
  schema?: object;       // verilsə JSON qaytarır və yoxlayır
  name?: string;
  /** OpenAI model adı — çağıran faylın öz sabiti (köhnə davranış qorunsun deyə). Pulsuz yola təsir etmir. */
  model?: string;
  /** creative rotasiya üçün — eyni seed → eyni başlanğıc model; YALNIZ pulsuz yol (OpenAI-də model sabitdir) */
  seed?: number;
  temperature?: number;
  timeoutMs?: number;
};
export type ChatResult<T> = { data: T; text: string; provider: string; model: string };

export const lastUsed: { provider?: string; model?: string } = {};

export const chat = async <T = unknown>(o: ChatOpts): Promise<ChatResult<T>> => {
  const engine = (env("LLM_ENGINE") ?? "openai-first").toLowerCase();
  const name = o.name ?? "result";
  const task: Task = hasImages(o.messages) ? "vision" : o.task;
  const finish = (text: string, provider: string, model: string): ChatResult<T> => {
    const data = (o.schema ? extractJSON(text) : text) as T;
    if (o.schema) {
      const errs = validate(o.schema, data);
      if (errs.length) throw new Error(`sxem: ${errs.slice(0, 4).join("; ")}`);
    }
    Object.assign(lastUsed, { provider, model });
    return { data, text, provider, model };
  };

  // ---- yalnız OpenAI
  if (engine === "openai") {
    const r = await openaiChat(o.messages, o.schema, name, task, o.model);
    return finish(r.text, r.provider, r.model);
  }

  // ---- ƏSAS rejim: əvvəl OpenAI, yalnız texniki xətada pulsuza keç
  if (engine !== "auto" && engine !== "free") {
    try {
      const r = await openaiChat(o.messages, o.schema, name, task, o.model);
      log(`openai/${r.model} ✓`);
      return finish(r.text, r.provider, r.model);
    } catch (e) {
      const reason = openaiFallbackReason(e);
      if (!reason) throw e;                         // 400 və s. → kod xətası, maskalamırıq
      const first = (await candidates(task))[0];
      log(`OpenAI alınmadı (${reason}) → ehtiyat: ${first ? `${first.provider.id}/${first.model}` : "pulsuz provayder yoxdur"}`);
      if (!first) throw e;
    }
  }

  let list = await candidates(task);
  if (task === "creative" && list.length > 1) {
    const seed = o.seed ?? Math.floor(Date.now() / 1000);
    const start = Math.abs(seed) % list.length;
    list = [...list.slice(start), ...list.slice(0, start)];
  }
  const temperature = o.temperature ?? (task === "creative" ? 1.0 : task === "fast" ? 0.6 : 0.4);
  const timeoutMs = o.timeoutMs ?? 240_000;
  const messages = list.length ? await inlineImages(o.messages) : o.messages;
  const errors: string[] = [];

  for (const c of list) {
    const tag = `${c.provider.id}/${c.model}`;
    try {
      const t0 = Date.now();
      let text = await tryCandidate(c, messages, o.schema, name, temperature, timeoutMs);
      try {
        const r = finish(text, c.provider.id, c.model);
        log(`${tag} ✓ ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        return r;
      } catch (e) {
        // bir dəfə düzəliş istə — eyni model, xəta mesajı ilə
        log(`${tag} format xətası, düzəliş istənir: ${(e as Error).message.slice(0, 120)}`);
        text = await tryCandidate(c, [...messages, { role: "assistant", content: text.slice(0, 12000) }, { role: "user", content: `Cavab sxemə uyğun deyil: ${(e as Error).message}. Eyni məzmunu düzəldilmiş, YALNIZ etibarlı JSON kimi qaytar.` }], o.schema, name, 0.2, timeoutMs);
        const r = finish(text, c.provider.id, c.model);
        log(`${tag} ✓ (düzəlişdən sonra)`);
        return r;
      }
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${tag}: ${msg.slice(0, 140)}`);
      log(`${tag} ✗ ${msg.slice(0, 140)}`);
    }
  }

  if (engine === "auto" && env("OPENAI_API_KEY")) {
    log(list.length ? "pulsuz provayderlər alınmadı → OpenAI" : "pulsuz açar yoxdur → OpenAI");
    const r = await openaiChat(o.messages, o.schema, name, task, o.model);
    return finish(r.text, r.provider, r.model);
  }
  throw new Error(`Heç bir LLM cavab vermədi.\n${errors.join("\n") || "Açar yoxdur: NVIDIA_API_KEY / GEMINI_API_KEY / GROQ_API_KEY … (.env)"}`);
};

/** Qısa yol: JSON qaytarır */
export const chatJSON = async <T>(o: ChatOpts & { schema: object }): Promise<T> => (await chat<T>(o)).data;

// ---------------------------------------------------------------- web axtarışı (trendlər üçün)
/**
 * Gemini + Google Search grounding (pulsuz limit). Cavab mətnindən JSON çıxarılır.
 * GEMINI_API_KEY yoxdursa null qaytarır (çağıran OpenAI web_search-ə keçə bilər).
 */
export const geminiWebSearchJSON = async <T>(prompt: string, schema: object): Promise<T | null> => {
  const key = env("GEMINI_API_KEY");
  if (!key) return null;
  const models = (env("GEMINI_SEARCH_MODELS") ?? "gemini-2.5-flash,gemini-2.5-pro,gemini-flash-latest").split(",").map((s) => s.trim());
  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt + schemaHint(schema) }] }], tools: [{ google_search: {} }] }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!r.ok) throw new HttpError(r.status, await r.text());
      const j = (await r.json()) as any;
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      const data = extractJSON(text) as T;
      const errs = validate(schema, data);
      if (errs.length) throw new Error(errs.slice(0, 3).join("; "));
      log(`gemini-search/${model} ✓`);
      return data;
    } catch (e) {
      log(`gemini-search/${model} ✗ ${(e as Error).message.slice(0, 140)}`);
    }
  }
  return null;
};

// ---------------------------------------------------------------- CLI: npx tsx pipeline/llm.ts
if (process.argv[1]?.replace(/\\/g, "/").endsWith("pipeline/llm.ts")) {
  await import("dotenv/config");
  const cmd = process.argv[2] ?? "status";
  if (cmd === "status") {
    for (const task of ["creative", "smart", "fast", "vision"] as Task[]) {
      const c = await candidates(task);
      console.log(`\n${task.toUpperCase()} (${c.length}):`);
      for (const x of c) console.log(`  ${x.provider.id.padEnd(11)} ${x.model}`);
    }
    const missing = PROVIDERS.filter((p) => !p.key()).map((p) => p.id);
    if (missing.length) console.log(`\nAçarı olmayan provayderlər: ${missing.join(", ")}`);
  } else if (cmd === "test") {
    const schema = { type: "object", additionalProperties: false, required: ["hook", "cta"], properties: { hook: { type: "string" }, cta: { type: "string" } } };
    for (const c of await candidates("creative")) {
      try {
        const text = await tryCandidate(c, [{ role: "system", content: "Azərbaycan dilində qısa yaz." }, { role: "user", content: "Köç xidməti üçün 1 hook və 1 CTA yaz." }], schema, "t", 0.9, 90_000);
        console.log(`✓ ${c.provider.id}/${c.model}: ${JSON.stringify(extractJSON(text))}`);
      } catch (e) {
        console.log(`✗ ${c.provider.id}/${c.model}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
  }
}
