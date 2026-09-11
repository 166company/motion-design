import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, safeArea } from "../brand/theme";

/** Vinyet + zəif dənəvərlik — "slayd-şou" hissini kinematik hissə çevirən detal */
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse 78% 66% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)",
    }}
  />
);

/**
 * Yuxarıda seqmentli irəliləmə çubuğu — izləyici neçə bənd qaldığını görür,
 * bu, reels-də izləmə müddətini artıran tanış naxışdır.
 */
export const ProgressBar: React.FC<{ segments: number[]; total: number }> = ({ segments, total }) => {
  const frame = useCurrentFrame();
  let acc = 0;
  return (
    <div
      style={{
        position: "absolute",
        top: safeArea.top - 24,
        left: safeArea.side,
        right: safeArea.side,
        display: "flex",
        gap: 6,
        pointerEvents: "none",
      }}
    >
      {segments.map((len, i) => {
        const from = acc;
        acc += len;
        const p = interpolate(frame, [from, from + len], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              flex: len / total,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.22)",
              overflow: "hidden",
            }}
          >
            <div style={{ width: `${p * 100}%`, height: "100%", background: colors.orange }} />
          </div>
        );
      })}
    </div>
  );
};

/** Diaqonal narıncı zolaq — səhnəyə girəndə süpürüb keçir */
export const Sweep: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const x = interpolate(frame - delay, [0, 18], [-width * 1.4, width * 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const op = interpolate(frame - delay, [0, 4, 14, 18], [0, 0.9, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: -height * 0.2,
        left: x,
        width: width * 0.28,
        height: height * 1.4,
        background: `linear-gradient(90deg, transparent, ${colors.orange}, transparent)`,
        transform: "skewX(-18deg)",
        opacity: op,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
};
