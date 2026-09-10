/** yuk.az WordPress REST API — kontentin yeganə mənbəyi. Uydurma yoxdur. */

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

export const listArticles = async (perPage = 50): Promise<Article[]> => {
  const res = await fetch(
    `${BASE}/posts?per_page=${perPage}&_fields=id,title,link,content,date`
  );
  if (!res.ok) throw new Error(`WP API ${res.status}`);
  const raw = (await res.json()) as any[];

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
