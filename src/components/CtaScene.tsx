import { AbsoluteFill, Audio, Img, staticFile, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, type, spacing, radius, safeArea } from "../brand/theme";
import { font } from "../brand/fonts";

/** Arxada yavaş süzülən narıncı nöqtələr — dərinlik hissi */
const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const dots = Array.from({ length: 14 }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280 / 233280;
    const seed2 = (i * 4271 + 1237) % 233280 / 233280;
    return {
      x: seed * width,
      y: height * 0.15 + seed2 * height * 0.7 - frame * (0.6 + seed * 1.2),
      r: 3 + seed2 * 6,
      o: 0.15 + seed * 0.35,
    };
  });
  return (
    <>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: d.x,
            top: ((d.y % (height * 1.1)) + height * 1.1) % (height * 1.1) - height * 0.05,
            width: d.r,
            height: d.r,
            borderRadius: "50%",
            background: colors.orange,
            opacity: d.o,
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </>
  );
};

/**
 * Yekun səhnə: kub loqo fırlanaraq gəlir, "yuk.az" yazısı hərf-hərf yığılır,
 * CTA pill-i və tagline aşağıdan qalxır. Riser SFX səhnədən əvvəl, pop loqo oturanda.
 */
export const CtaScene: React.FC<{ line1: string; line2: string }> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const logo = spring({ frame, fps, config: { damping: 12, stiffness: 120, mass: 0.9 } });
  const float = Math.sin(frame / 14) * 6;
  const wordDelay = 8;
  const pillS = spring({ frame: Math.max(0, frame - 26), fps, config: { damping: 14, stiffness: 140 } });
  const tagOp = interpolate(frame, [30, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = 0.35 + 0.15 * Math.sin(frame / 10);

  const brand = ["y", "u", "k", ".", "a", "z"];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, fontFamily: font, overflow: "hidden" }}>
      {/* diaqonal narıncı zolaq — sağ yuxarıdan sola sürüşür */}
      <div
        style={{
          position: "absolute",
          top: -200,
          left: interpolate(logo, [0, 1], [width, width * 0.62]),
          width: 520,
          height: 2400,
          background: `linear-gradient(90deg, ${colors.orange}33, ${colors.orange}0d)`,
          transform: "rotate(18deg)",
        }}
      />
      {/* radial parıltı */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "46%",
          width: 1000,
          height: 1000,
          transform: "translate(-50%,-50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,102,0,${glow}) 0%, transparent 62%)`,
        }}
      />
      <Particles />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: safeArea.side,
          paddingRight: safeArea.side,
          paddingBottom: 120,
        }}
      >
        {/* kub loqo */}
        <Img
          src={staticFile("logo/logo-icon.svg")}
          style={{
            width: 300,
            transform: `translateY(${float}px) scale(${logo}) rotate(${interpolate(logo, [0, 1], [-40, 0])}deg)`,
            opacity: logo,
            filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.5))",
          }}
        />

        {/* yuk.az — hərf-hərf */}
        <div style={{ display: "flex", marginTop: spacing.md, letterSpacing: -6 }}>
          {brand.map((ch, i) => {
            const s = spring({ frame: Math.max(0, frame - wordDelay - i * 2), fps, config: { damping: 13, stiffness: 180 } });
            return (
              <span
                key={i}
                style={{
                  fontSize: 168,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: i >= 3 ? colors.orange : colors.white,
                  display: "inline-block",
                  transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px)`,
                  opacity: s,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* tagline */}
        <div
          style={{
            marginTop: spacing.md,
            fontSize: 54,
            fontWeight: 800,
            color: colors.white,
            textAlign: "center",
            maxWidth: 820,
            lineHeight: 1.2,
            opacity: tagOp,
            transform: `translateY(${(1 - tagOp) * 16}px)`,
          }}
        >
          {line1}
        </div>

        {/* CTA pill */}
        <div
          style={{
            marginTop: spacing.sm,
            fontSize: type.body,
            fontWeight: 800,
            color: colors.graphite,
            backgroundColor: colors.orange,
            padding: `${spacing.xs + 8}px ${spacing.lg}px`,
            borderRadius: radius.pill,
            transform: `scale(${pillS})`,
            opacity: pillS,
            boxShadow: "0 16px 40px rgba(255,102,0,0.4)",
          }}
        >
          {line2}
        </div>
      </AbsoluteFill>

      <Audio src={staticFile("sfx/pop.wav")} volume={0.7} startFrom={0} />
    </AbsoluteFill>
  );
};
