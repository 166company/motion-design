/**
 * "Poster" — statik satış postu (1080×1350). AI səhnə (loqolu işçilər / maşın / telefon) + kod tipoqrafiyası.
 * Loqo və nömrə həmişə kodla qoyulur — AI-nin ixtiyarına buraxılmır.
 * 3 layout: hero (tam foto + alt tipoqrafiya), split (foto + narıncı panel), card (foto + qrafit kart, 3 fayda)
 */
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { z } from "zod";
import { colors } from "../brand/theme";
import { font } from "../brand/fonts";
import { contact } from "../brand/contact";

export const posterSchema = z.object({
  id: z.string(),
  photo: z.string(),
  headline: z.string(),          // 2-5 söz; \n ilə sətir; sonuncu söz narıncı
  sub: z.string().default(""),   // 1 qısa fayda cümləsi
  bullets: z.array(z.string()).default([]),  // card layout üçün 3 fayda
  cta: z.string().default("Zəng et"),
  variant: z.enum(["hero", "split", "card"]).default("hero"),
});
export type PosterProps = z.infer<typeof posterSchema>;

const W = 1080, H = 1350;

const PhoneIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const Logo: React.FC<{ light?: boolean; x?: number; y?: number }> = ({ light = true, x = 56, y = 56 }) => (
  <div style={{ position: "absolute", top: y, left: x, display: "flex", alignItems: "center", gap: 14, fontFamily: font }}>
    <Img src={staticFile("logo/logo-icon.svg")} style={{ width: 58, height: 58 }} />
    <span style={{ fontSize: 50, fontWeight: 800, color: light ? colors.white : colors.graphite, letterSpacing: -2 }}>
      yük<span style={{ color: colors.orange }}>.az</span>
    </span>
  </div>
);

/** Başlıq: sonuncu söz narıncı */
const Headline: React.FC<{ text: string; size: number; color?: string; accent?: string; align?: "left" | "center" }> = ({ text, size, color = colors.white, accent = colors.orange, align = "left" }) => {
  const rows = text.split("\n");
  const allWords = rows.flatMap((r) => r.split(" "));
  const lastIdx = allWords.length - 1;
  let n = -1;
  return (
    <div style={{ fontFamily: font, fontSize: size, fontWeight: 900, lineHeight: 0.98, letterSpacing: -size * 0.035, color, textAlign: align }}>
      {rows.map((r, i) => (
        <div key={i}>
          {r.split(" ").map((w, j) => { n += 1; return <span key={j} style={{ color: n === lastIdx ? accent : undefined }}>{w}{j < r.split(" ").length - 1 ? " " : ""}</span>; })}
        </div>
      ))}
    </div>
  );
};

const CtaPill: React.FC<{ label: string; dark?: boolean; size?: number }> = ({ label, dark = false, size = 44 }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 18, fontFamily: font,
    background: dark ? colors.graphite : colors.orange, color: dark ? colors.white : colors.graphite,
    borderRadius: 999, padding: `${size * 0.42}px ${size * 0.9}px`, fontSize: size, fontWeight: 900, letterSpacing: -1,
    boxShadow: dark ? "0 14px 40px rgba(0,0,0,0.45)" : "0 14px 40px rgba(255,102,0,0.4)",
  }}>
    <span style={{ width: size * 1.25, height: size * 1.25, borderRadius: "50%", background: dark ? colors.orange : colors.graphite, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <PhoneIcon size={size * 0.65} color={dark ? colors.graphite : colors.orange} />
    </span>
    {label} · {contact.phone}
  </div>
);

export const Poster: React.FC<PosterProps> = ({ photo, headline, sub, bullets, cta, variant }) => {
  useCurrentFrame();
  const src = /^https?:/.test(photo) ? photo : staticFile(photo);

  if (variant === "split") {
    return (
      <AbsoluteFill style={{ width: W, height: H, background: colors.orange, fontFamily: font }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 800, overflow: "hidden" }}>
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,22,24,0.35) 0%, rgba(20,22,24,0) 35%)" }} />
          <Logo />
        </div>
        <div style={{ position: "absolute", left: 60, right: 60, top: 840 }}>
          <Headline text={headline} size={92} color={colors.graphite} accent={colors.white} />
          {sub && <div style={{ marginTop: 22, fontSize: 38, fontWeight: 700, color: "rgba(30,33,36,0.85)", lineHeight: 1.25, maxWidth: 900 }}>{sub}</div>}
          <div style={{ marginTop: 34 }}><CtaPill label={cta} dark /></div>
        </div>
      </AbsoluteFill>
    );
  }

  if (variant === "card") {
    return (
      <AbsoluteFill style={{ width: W, height: H, background: colors.graphite, fontFamily: font }}>
        <Img src={src} style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,22,24,0.25) 0%, rgba(20,22,24,0.05) 40%, rgba(20,22,24,0.7) 100%)" }} />
        <Logo />
        <div style={{ position: "absolute", left: 56, right: 56, bottom: 56, background: "rgba(24,26,29,0.86)", backdropFilter: "blur(10px)", borderRadius: 36, padding: "44px 48px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Headline text={headline} size={78} />
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 14 }}>
            {bullets.slice(0, 3).map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: colors.orange, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.graphite} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {b}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}><CtaPill label={cta} size={40} /></div>
        </div>
      </AbsoluteFill>
    );
  }

  // hero
  return (
    <AbsoluteFill style={{ width: W, height: H, background: colors.graphite, fontFamily: font }}>
      <Img src={src} style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,22,24,0.3) 0%, rgba(20,22,24,0) 30%, rgba(20,22,24,0.2) 55%, rgba(20,22,24,0.88) 100%)" }} />
      <Logo />
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 70 }}>
        <div style={{ width: 120, height: 10, borderRadius: 5, background: colors.orange, marginBottom: 26 }} />
        <Headline text={headline} size={104} />
        {sub && <div style={{ marginTop: 22, fontSize: 40, fontWeight: 600, color: "rgba(255,255,255,0.88)", lineHeight: 1.25, maxWidth: 880 }}>{sub}</div>}
        <div style={{ marginTop: 36 }}><CtaPill label={cta} /></div>
      </div>
    </AbsoluteFill>
  );
};
