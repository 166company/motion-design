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

  // aviasales üslubu:
  //  slayd 1 — BÖYÜK hərf, sağa hizalı, son parça sağ kənarda KƏSİLİR (nöqtə yox, çərçivə kəsir)
  //  slayd 2 — kiçik hərf, sola hizalı, ilk parça sol kənardan "içəri girir"
  const raw = lines[i].replace(/^\.\.\.|\.\.\.$/g, "").trim();
  const isFirst = i === 0;
  const rowsRaw = raw.includes("\n") ? raw.split("\n") : raw.split(/\s+/).filter(Boolean);
  const rows = rowsRaw.map((r) => (isFirst ? r.toLocaleUpperCase("az") : r.toLocaleLowerCase("az")));
  const longest = Math.max(...rows.map((r) => r.length), 1);
  // 1-ci slayd 2-3 qısa sözdür — nəhəng olsun (aviasales "DUR BURDAN"); 2-ci slayd daha uzun, bir az kiçik
  const cap = isFirst ? Math.max(fontSize, 270) : fontSize;
  const fit = Math.min(cap, Math.floor((W - 60) / (longest * 0.6)), Math.floor((H - 560) / (rows.length * 0.95)));
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
          position: "absolute", left: 0, right: 0, bottom: 170,
          display: "flex", flexDirection: "column",
          alignItems: isFirst ? "flex-end" : "flex-start",
        }}
      >
        {rows.map((ln, k) => {
          const last = k === rows.length - 1;
          const first = k === 0;
          // kəsilmə: slayd 1-in son parçası sağa çıxır, slayd 2-nin ilk parçası soldan gəlir
          const shift = isFirst && last ? fit * 0.55 : !isFirst && first ? -fit * 0.35 : 0;
          return (
            <div
              key={k}
              style={{
                fontSize: fit, fontWeight: 900, color: colors.white, lineHeight: 0.95,
                letterSpacing: -fit * 0.03, whiteSpace: "nowrap",
                textShadow: "0 8px 30px rgba(0,0,0,0.45)",
                paddingLeft: isFirst ? 0 : 36, paddingRight: isFirst ? 36 : 0,
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
