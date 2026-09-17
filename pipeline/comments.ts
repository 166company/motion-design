/**
 * Şərh cavablayıcı — Ootto "comment-responder" + "dm-script-writer" metodologiyası.
 * Son 14 günün Instagram postlarındakı cavabsız şərhlərə isti, qısa, azərbaycanca cavab yazır:
 *   ictimai cavabda LİNK YOX; nömrə/DM-ə dəvət; hər şərh → potensial müştəri (content/data/leads.json).
 * Yalnız AUTO_REPLY=1 olanda cavab göndərir; əks halda təklif olunan cavabları yazıb saxlayır (out/comments-preview.md).
 *
 *   npx tsx pipeline/comments.ts            → önizləmə (göndərmir)
 *   AUTO_REPLY=1 npx tsx pipeline/comments.ts → cavabları göndərir
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { contact } from "../src/brand/contact.ts";
import { playbook } from "./skills.ts";
import { chat } from "./llm.ts";

const V = "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN!;
const IG = process.env.META_IG_USER_ID!;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
const SEND = process.env.AUTO_REPLY === "1";
const LOG = "content/data/comments.json";

const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(`https://graph.facebook.com/${V}/${path}${path.includes("?") ? "&" : "?"}access_token=${TOKEN}`, init);
  const j = (await r.json()) as any;
  if (j.error) throw new Error(j.error.message);
  return j;
};

type Reply = { reply: string; intent: "qiymət" | "sifariş" | "sual" | "tərif" | "şikayət" | "spam" | "digər"; lead: boolean; skip: boolean };
const schema = {
  type: "object", additionalProperties: false, required: ["reply", "intent", "lead", "skip"],
  properties: {
    reply: { type: "string", description: "1-2 cümlə, isti, azərbaycanca, link YOX, emoji ≤1; qiymət soruşulubsa rəqəm vermə — nömrəyə/DM-ə yönləndir" },
    intent: { type: "string", enum: ["qiymət", "sifariş", "sual", "tərif", "şikayət", "spam", "digər"] },
    lead: { type: "boolean", description: "potensial müştəridirmi (qiymət/sifariş/sual)" },
    skip: { type: "boolean", description: "cavab verməyə dəyməz (spam, mənasız, öz şərhimiz)" },
  },
} as const;

const draft = async (postHook: string, text: string, username: string): Promise<Reply> => {
  const __r = await chat<any>({ task: "fast", name: "reply", model: MODEL, schema: schema, messages: [
        { role: "system", content: `Sən Yük.az (Bakı, ev/ofis köçü, yükdaşıma) Instagram səhifəsinin şərh cavablayıcısısan. Nömrə: ${contact.phone}. Qiymət rəqəmi vermə (operator telefonda deyir). Şikayətə: üzr + nömrəyə dəvət. Spam/təhqirə cavab vermə (skip).` + playbook(["comment-responder", "dm-script-writer"], 6000) },
        { role: "user", content: `POST: "${postHook}"\n@${username}: "${text}"` },
      ] });
  return (__r.data);
};

const main = async () => {
  const log: Record<string, any> = JSON.parse(await fs.readFile(LOG, "utf-8").catch(() => "{}"));
  const me = (await api(`${IG}?fields=username`)).username as string;
  const since = Date.now() - 14 * 86400e3;
  const media = (await api(`${IG}/media?fields=id,caption,permalink,timestamp&limit=30`)).data.filter((m: any) => new Date(m.timestamp).getTime() > since);
  const preview: string[] = [];
  let sent = 0;
  for (const m of media) {
    const comments = (await api(`${m.id}/comments?fields=id,text,username,timestamp,replies{username}&limit=50`)).data ?? [];
    for (const c of comments) {
      if (log[c.id] || c.username === me) continue;
      if ((c.replies?.data ?? []).some((r: any) => r.username === me)) { log[c.id] = { repliedBefore: true }; continue; }
      const hook = String(m.caption ?? "").split("\n")[0].slice(0, 120);
      const d = await draft(hook, c.text, c.username);
      const entry: any = { media: m.permalink, username: c.username, text: c.text, intent: d.intent, lead: d.lead, reply: d.reply, at: new Date().toISOString(), sent: false };
      if (!d.skip) {
        if (SEND) {
          try { await api(`${c.id}/replies?message=${encodeURIComponent(d.reply)}`, { method: "POST" }); entry.sent = true; sent++; }
          catch (e: any) { entry.error = e.message.slice(0, 120); }
        }
        preview.push(`**@${c.username}** (${d.intent}${d.lead ? ", lead" : ""}) — ${m.permalink}\n> ${c.text}\n\n→ ${d.reply}${entry.sent ? " ✅" : ""}\n`);
      }
      log[c.id] = entry;
    }
  }
  await fs.writeFile(LOG, JSON.stringify(log, null, 2), "utf-8");
  await fs.mkdir("out", { recursive: true });
  await fs.writeFile("out/comments-preview.md", preview.join("\n") || "Yeni şərh yoxdur.\n", "utf-8");
  const leads = Object.values(log).filter((e: any) => e.lead).length;
  console.log(`  ✓ ${preview.length} yeni şərh${SEND ? `, ${sent} cavab göndərildi` : " (önizləmə, AUTO_REPLY=1 deyil)"}; cəmi lead: ${leads}`);
};

main().catch((e) => { console.error("XƏTA:", e.message); process.exit(1); });
