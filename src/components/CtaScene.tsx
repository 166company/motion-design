import { AbsoluteFill, Img, staticFile, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, type, spacing, radius, safeArea, motion } from "../brand/theme";
import { font } from "../brand/fonts";

export const CtaScene: React.FC<{ line1: string; line2: string }> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: motion.springConfig });
  const logoY = interpolate(s, [0, 1], [40, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.graphite,
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: safeArea.side,
        paddingRight: safeArea.side,
        fontFamily: font,
      }}
    >
      {/* fon aksenti */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.orange}22 0%, transparent 68%)`,
          transform: `scale(${0.8 + s * 0.4})`,
        }}
      />
      <Img
        src={staticFile("logo/logo-horizontal-dark.svg")}
        style={{ width: 620, opacity: s, transform: `translateY(${logoY}px)`, borderRadius: radius.md }}
      />
      <div
        style={{
          marginTop: spacing.lg,
          fontSize: type.cta,
          fontWeight: 800,
          color: colors.white,
          textAlign: "center",
          opacity: interpolate(frame, [8, 22], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {line1}
      </div>
      <div
        style={{
          marginTop: spacing.sm,
          fontSize: type.body,
          fontWeight: 700,
          color: colors.graphite,
          backgroundColor: colors.orange,
          padding: `${spacing.xs + 6}px ${spacing.md}px`,
          borderRadius: radius.pill,
          opacity: interpolate(frame, [16, 30], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {line2}
      </div>
    </AbsoluteFill>
  );
};
