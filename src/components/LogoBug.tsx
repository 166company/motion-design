import { AbsoluteFill, Img, staticFile, interpolate, useCurrentFrame } from "remotion";
import { safeArea, spacing } from "../brand/theme";

/** Sağ yuxarıda daimi loqo — təhlükəsiz zonanın altında */
export const LogoBug: React.FC<{ variant?: "light" | "dark" }> = ({ variant = "light" }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 0.92], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Img
        src={staticFile(
          variant === "light" ? "logo/logo-horizontal-dark.svg" : "logo/logo-horizontal-light.svg"
        )}
        style={{
          position: "absolute",
          top: safeArea.top,
          right: safeArea.side,
          width: 230,
          opacity,
          borderRadius: 12,
        }}
      />
    </AbsoluteFill>
  );
};
