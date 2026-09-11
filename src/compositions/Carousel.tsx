/**
 * "Carousel" — statik 3 slaydlı post (aviasales.az üslubu):
 *   1–2: foto + nəhəng ağ mətn, cümlə slaydlar arasında KƏSİLİR (sürüşdürmə hiyləsi)
 *   3:   tam narıncı fon, iki sözlük punchline
 * Hər kadr bir slayddır: frame 0 → slayd 1, frame 1 → slayd 2, … `remotion still` ilə çıxarılır.
 */
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { z } from "zod";
import { colors } from "../brand/theme";
import { font } from "../brand/fonts";

export const carouselSchema = z.object({
  id: z.string(),
  /** public-nisbi foto yolu (assets/…jpg) — 1–2-ci slaydların fonu */
  photo: z.string(),
  /** foto slaydlarının mətnləri; hər element öz slaydında, sətirlər \n ilə */
  lines: z.array(z.string()).min(1),
  /** son slayd punchline */
  punch: z.string(),
  /** mətn hizalanması: foto slaydlarında sağ/sol növbə ilə */
  fontSize: z.number().default(190),
});
export type CarouselProps = z.infer<typeof carouselSchema>;

const W = 1080, H = 1350;

const Logo: React.FC<{ light?: boolean }> = ({ light = true }) => (
  <div style={{ position: "absolute", top: 72, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 16, fontFamily: font }}>
    <Img src={staticFile("logo/logo-icon.svg")} style={{ width: 64, height: 64 }} />
    <span style={{ fontSize: 56, fontWeight: 800, color: light ? colors.white : colors.graphite, letterSpacing: -2 }}>
      yük<span style={{ color: light ? colors.orange : colors.graphite }}>.az</span>
    </span>
  </div>
);

export const Carousel: React.FC<CarouselProps> = ({ photo, lines, punch, fontSize }) => {
  const i = useCurrentFrame();
  const isPunch = i >= lines.length;

  if (isPunch) {
    return (
      <AbsoluteFill style={{ width: W, height: H, background: colors.orange, fontFamily: font, alignItems: "center", justifyContent: "center" }}>
        <Logo light={false} />
        <div style={{ fontSize: 118, fontWeight: 900, color: colors.white, letterSpacing: -4, textAlign: "center", lineHeight: 1.05, padding: "0 60px", textShadow: "0 6px 0 rgba(0,0,0,0.12)" }}>
          {punch}
        </div>
      </AbsoluteFill>
    );
  }

  // aviasales üslubu — əsas qayda: kəsilən söz və davamı EYNİ SƏTİRDƏ (eyni y) olmalıdır.
  //  slayd 1: BÖYÜK hərf, sağa hizalı, son parça sağ kənarda kəsilir (nöqtə yox)
  //  slayd 2: kiçik hərf, sola hizalı; ilk sətir = davam parçası, slayd 1-in son sətri ilə eyni y-də;
  //           qalan sözlər onun altında, eni görə sətirlərə yığılır. Hər iki slayd eyni şrift.
  const clean = (t: string) => t.replace(/\.\.\./g, "").trim();
  const wordsOf = (t: string) => clean(t).split(/\s+/).filter(Boolean);
  const w1 = wordsOf(lines[0]).map((w) => w.toLocaleUpperCase("az"));           // slayd 1: hər söz öz sətrində
  const w2 = wordsOf(lines[1] ?? "").map((w) => w.toLocaleLowerCase("az"));     // slayd 2
  const charW = 0.6;                                                            // 1 hərf ≈ 0.6 × şrift
  const maxW = W - 80;
  // slayd 2 sətirləri: ilk sətir yalnız davam parçası; qalanı greedy — verilən şriftə görə
  const packRows = (words: string[], F: number) => {
    if (!words.length) return [] as string[];
    const rows = [words[0]];
    let cur = "";
    for (const w of words.slice(1)) {
      const cand = cur ? cur + " " + w : w;
      if (cand.length * charW * F <= maxW) cur = cand;
      else { if (cur) rows.push(cur); cur = w; }
    }
    if (cur) rows.push(cur);
    return rows;
  };
  const ANCHOR = 800;                // slayd 1-in son sətrinin ALT xətti (y) — 2-ci slaydın davamına yer qalsın
  const ROW = 0.9;                   // sətir hündürlüyü / şrift — sıx, bərabər
  // ortaq şrift: slayd 1 eninə, slayd 2 eninə + slayd 2-nin ANCHOR-dan aşağı sığmasına görə
  let F = Math.min(fontSize, 270);
  for (let k = 0; k < 6; k++) {
    const rows2 = packRows(w2, F);
    const wFit1 = Math.floor(maxW / (Math.max(...w1.map((x) => x.length), 1) * charW));
    const wFit2 = Math.floor(maxW / (Math.max(...rows2.map((x) => x.length), 1) * charW));
    const hFit2 = Math.floor((H - 90 - (ANCHOR - F * ROW)) / (Math.max(rows2.length, 1) * ROW)); // ilk sətir ANCHOR-da, qalanı altında
    const next = Math.min(F, wFit1, wFit2, hFit2);
    if (next >= F) break;
    F = next;
  }
  const rows2 = packRows(w2, F);
  const isFirst = i === 0;
  const rows = isFirst ? w1 : rows2;
  const blockTop = isFirst ? ANCHOR - w1.length * F * ROW : ANCHOR - F * ROW;  // slayd 2-nin ilk sətri slayd 1-in son sətri ilə eyni y-də
  return (
    <AbsoluteFill style={{ width: W, height: H, overflow: "hidden", fontFamily: font, background: colors.graphite }}>
      {/* foto — slaydlar arasında davamlılıq: eyni şəkil, hər slayd öz hissəsini göstərir */}
      <Img
        src={staticFile(photo)}
        style={{ position: "absolute", top: 0, left: -i * W * 0.35, width: W * 1.7, height: H, objectFit: "cover" }}
      />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,22,24,0.45) 0%, rgba(20,22,24,0.05) 40%, rgba(20,22,24,0.55) 100%)" }} />
      <Logo />
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: blockTop,
          display: "flex", flexDirection: "column",
          alignItems: isFirst ? "flex-end" : "flex-start",
        }}
      >
        {rows.map((ln, k) => {
          // Bütün sətirlər eyni kənar xəttində: slayd 1 sağdan 44px, slayd 2 soldan 44px
          const shift = 0;
          return (
            <div
              key={k}
              style={{
                fontSize: F, fontWeight: 900, color: colors.white, lineHeight: ROW, height: F * ROW,
                letterSpacing: -F * 0.035, whiteSpace: "nowrap",
                textShadow: "0 8px 30px rgba(0,0,0,0.45)",
                paddingLeft: isFirst ? 0 : 44, paddingRight: isFirst ? 44 : 0,
                transform: `translateX(${shift}px)`,
              }}
            >
              {ln}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
