import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, interpolate } from "remotion";
import { colors } from "../brand/theme";

export type MediaSource = { kind: "video" | "image"; src: string };

/**
 * Fon: video və ya şəkil + yavaş zoom (Ken Burns) + qradient örtük.
 * Örtük olmasa mətn oxunmur — bu, motion design-ın ən çox buraxılan detalıdır.
 */
export const BackgroundMedia: React.FC<{
  media: MediaSource | null;
  durationInFrames: number;
  dim?: number;
}> = ({ media, durationInFrames, dim = 0.68 }) => {
  const frame = useCurrentFrame();
  // public/ içindəki nisbi yolları staticFile ilə həll edirik; xarici URL toxunulmaz qalır
  const src = media && (/^https?:/.test(media.src) ? media.src : staticFile(media.src));
  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.16], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, overflow: "hidden" }}>
      {media?.kind === "video" && (
        <OffthreadVideo
          src={src as string}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
        />
      )}
      {media?.kind === "image" && (
        <Img
          src={src as string}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
        />
      )}
      {/* oxunaqlıq örtüyü */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg,
            rgba(30,33,36,${dim + 0.15}) 0%,
            rgba(30,33,36,${dim - 0.2}) 42%,
            rgba(30,33,36,${dim + 0.28}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
