/** yuk.az WordPress REST API — kontentin yeganə mənbəyi. Uydurma yoxdur. */

import fs from "node:fs/promises";

const BASE = "https://yuk.az/wp-json/wp/v2";

export type Article = {
  id: number;
  title: string;
  link: string;
  text: string;
  headings: string[];
  lang: "az" | "ru";
};

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Kiril hərfi varsa rus məqaləsidir */
const detectLang = (s: string): "az" | "ru" => (/[а-яА-Я]/.test(s) ? "ru" : "az");

const CACHE = "content/articles-cache.json";

/** Sayt bəzən (xüsusilə GitHub runner-dən) JSON əvəzinə HTML/WAF səhifəsi qaytarır — 3 cəhd, sonra son uğurlu keş */
const fetchPosts = async (perPage: number): Promise<any[]> => {
  const url = `${BASE}/posts?per_page=${perPage}&_fields=id,title,link,content,date`;
  let lastErr = "";
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (yuk.az content agent)", Accept: "application/json" } });
      const body = await res.text();
      if (!res.ok || !body.trim().startsWith("[")) throw new Error(`WP API ${res.status}: ${body.slice(0, 60).replace(/\s+/g, " ")}`);
      const raw = JSON.parse(body) as any[];
      await fs.mkdir("content", { recursive: true });
      await fs.writeFile(CACHE, JSON.stringify(raw), "utf-8");
      return raw;
    } catch (e: any) {
      lastErr = e.message;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  try {
    console.log(`  yuk.az cavab vermədi (${lastErr}) — keşlənmiş məqalələr istifadə olunur`);
    return JSON.parse(await fs.readFile(CACHE, "utf-8")) as any[];
  } catch { throw new Error(lastErr); }
};

export const listArticles = async (perPage = 50): Promise<Article[]> => {
  const raw = await fetchPosts(perPage);

  return raw.map((p) => {
    const html = p.content.rendered as string;
    const headings = [...html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi)]
      .map((m) => strip(m[1]))
      .filter((h) => h.length > 8 && h.length < 90);
    const title = strip(p.title.rendered);
    return {
      id: p.id,
      title,
      link: p.link,
      text: strip(html),
      headings,
      lang: detectLang(title),
    };
  });
};

/** Azərbaycan dilli, reels üçün ən uyğun məqalələr (siyahı strukturu olanlar) */
export const pickArticle = async (usedIds: number[] = []): Promise<Article> => {
  const all = await listArticles();
  const candidates = all
    .filter((a) => a.lang === "az")
    .filter((a) => !usedIds.includes(a.id))
    .filter((a) => a.headings.length >= 3);

  if (!candidates.length) throw new Error("Uyğun məqalə tapılmadı");
  return candidates[0];
};

/** Konkret məqalə (yenidən istehsal üçün) */
export const getArticle = async (id: number): Promise<Article> => {
  const all = await listArticles();
  const a = all.find((x) => x.id === id);
  if (!a) throw new Error(`Məqalə tapılmadı: ${id}`);
  return a;
};
