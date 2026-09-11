import { Img, staticFile, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, radius } from "../brand/theme";
import { font } from "../brand/fonts";

/**
 * Nömrə + ikon bloku. İkon narıncı kvadratın içində "pop" edir,
 * nömrə yanında böyük, arxada halqa cızılır.
 */
export const IconBadge: React.FC<{
  n: number;
  total: number;
  icon: string | null;
  delay?: number;
}> = ({ n, total, icon, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);
  const pop = spring({ frame: f, fps, config: { damping: 11, stiffness: 190, mass: 0.6 } });
  const ring = spring({ frame: Math.max(0, f - 4), fps, config: { damping: 30, stiffness: 90 } });
  const R = 54;
  const C = 2 * Math.PI * R;
  const iconSrc = icon
    ? /^https?:/.test(icon) ? icon : staticFile(icon)
    : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, fontFamily: font }}>
      {/* ikon kvadratı */}
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: radius.md,
          background: colors.orange,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${pop}) rotate(${interpolate(pop, [0, 1], [-14, 0])}deg)`,
          boxShadow: "0 18px 40px rgba(255,102,0,0.35)",
        }}
      >
        {iconSrc && <Img src={iconSrc} style={{ width: 62, height: 62 }} />}
      </div>

      {/* nömrə + halqa */}
      <div style={{ position: "relative", width: 124, height: 124, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={124} height={124} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={62} cy={62} r={R} stroke="rgba(255,255,255,0.18)" strokeWidth={6} fill="none" />
          <circle
            cx={62} cy={62} r={R}
            stroke={colors.orange} strokeWidth={6} fill="none" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ring * (n / total))}
          />
        </svg>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, transform: `scale(${0.6 + pop * 0.4})`, opacity: pop }}>
          <span style={{ fontSize: 64, fontWeight: 900, color: colors.white, lineHeight: 1 }}>{n}</span>
          <span style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>/{total}</span>
        </div>
      </div>
    </div>
  );
};
