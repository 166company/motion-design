import { AbsoluteFill, Img, Loop, OffthreadVideo, staticFile, useVideoConfig, useCurrentFrame, interpolate } from "remotion";
import { colors } from "../brand/theme";

export type MediaSource = { kind: "video" | "image"; src: string; duration?: number | null };

/** Kamera hərəkəti variantları — səhnələr eyni görünməsin */
export type CameraMove = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "drift";

const camera = (move: CameraMove, p: number) => {
  switch (move) {
    case "zoom-in":  return { scale: 1.06 + p * 0.14, x: 0, y: 0 };
    case "zoom-out": return { scale: 1.22 - p * 0.14, x: 0, y: 0 };
    case "pan-left": return { scale: 1.16, x: 30 - p * 60, y: 0 };
    case "pan-right":return { scale: 1.16, x: -30 + p * 60, y: 0 };
    default:         return { scale: 1.1 + p * 0.06, x: -12 + p * 24, y: 10 - p * 20 };
  }
};

/**
 * Fon: video/şəkil + kamera hərəkəti + qradient örtük.
 * Örtük olmasa mətn oxunmur — bu, motion design-ın ən çox buraxılan detalıdır.
 */
export const BackgroundMedia: React.FC<{
  media: MediaSource | null;
  durationInFrames: number;
  dim?: number;
  move?: CameraMove;
}> = ({ media, durationInFrames, dim = 0.68, move = "zoom-in" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = media && (/^https?:/.test(media.src) ? media.src : staticFile(media.src));
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const { scale, x, y } = camera(move, p);
  const style: React.CSSProperties = {
    width: "100%", height: "100%", objectFit: "cover",
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, overflow: "hidden" }}>
      {media?.kind === "video" && (() => {
        const clip = <OffthreadVideo src={src as string} muted style={style} />;
        const srcFrames = media.duration ? Math.floor(media.duration * fps) - 2 : 0;
        return srcFrames > 0 && srcFrames < durationInFrames
          ? <Loop durationInFrames={srcFrames}>{clip}</Loop>
          : clip;
      })()}
      {media?.kind === "image" && <Img src={src as string} style={style} />}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg,
            rgba(30,33,36,${dim + 0.12}) 0%,
            rgba(30,33,36,${dim - 0.22}) 40%,
            rgba(30,33,36,${dim + 0.26}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
