import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, type, motion } from "../brand/theme";
import { font } from "../brand/fonts";

export const NumberBadge: React.FC<{ n: number; total: number }> = ({ n, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: motion.springConfig });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 10,
        transform: `scale(${0.7 + s * 0.3})`,
        opacity: s,
        fontFamily: font,
      }}
    >
      <span style={{ fontSize: type.badge, fontWeight: 900, color: colors.orange, lineHeight: 1 }}>
        {n}
      </span>
      <span style={{ fontSize: 40, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
        /{total}
      </span>
    </div>
  );
};
