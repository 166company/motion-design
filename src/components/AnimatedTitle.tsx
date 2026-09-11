import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, motion } from "../brand/theme";
import { font } from "../brand/fonts";

/**
 * Başlıq söz-söz canlanır: hər söz aşağıdan sürüşüb, yüngül overshoot ilə yerinə oturur.
 * `accent` — narıncı vurğulanacaq sözün indeksi (default: sonuncu).
 */
export const AnimatedTitle: React.FC<{
  text: string;
  size: number;
  weight?: number;
  delay?: number;
  stagger?: number;
  accent?: number | null;
  align?: "left" | "center";
  color?: string;
  lineHeight?: number;
}> = ({ text, size, weight = 900, delay = 0, stagger = 3, accent = null, align = "left", color = colors.white, lineHeight = 1.06 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/);
  const accentIdx = accent === null ? -1 : accent < 0 ? words.length + accent : accent;

  return (
    <div
      style={{
        fontFamily: font,
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        color,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * 0.26,
        rowGap: 0,
        letterSpacing: -size * 0.02,
      }}
    >
      {words.map((w, i) => {
        const f = frame - delay - i * stagger;
        const s = spring({ frame: Math.max(0, f), fps, config: { damping: 14, stiffness: 160, mass: 0.7 } });
        const y = interpolate(s, [0, 1], [size * 0.55, 0]);
        const op = interpolate(f, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: op,
              color: i === accentIdx ? colors.orange : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Sürüşüb açılan narıncı xətt — başlığın altında/üstündə vurğu */
export const AccentLine: React.FC<{ width?: number; delay?: number; height?: number }> = ({
  width = 140,
  delay = 0,
  height = 8,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: Math.max(0, frame - delay), fps, config: motion.springConfig });
  return (
    <div
      style={{
        width,
        height,
        borderRadius: height / 2,
        background: colors.orange,
        transform: `scaleX(${s})`,
        transformOrigin: "left",
      }}
    />
  );
};
