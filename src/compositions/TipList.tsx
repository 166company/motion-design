import {
  AbsoluteFill, Audio, Sequence, staticFile, interpolate, spring,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import { colors, safeArea, spacing, type, radius, motion } from "../brand/theme";
import { font } from "../brand/fonts";
import { BackgroundMedia } from "../components/BackgroundMedia";
import { Caption } from "../components/Caption";
import { NumberBadge } from "../components/NumberBadge";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import type { Reel, Scene } from "../types";

/** Açılış — sual formatında hook, ilk 2 saniyə hər şeyi həll edir */
const HookScene: React.FC<{ scene: Scene; text: string }> = ({ scene, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: motion.springConfig });

  return (
    <AbsoluteFill>
      <BackgroundMedia media={scene.media} durationInFrames={scene.durationInFrames} dim={0.66} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: safeArea.side,
          paddingRight: safeArea.side,
          paddingBottom: safeArea.bottom,
          paddingTop: safeArea.top,
          fontFamily: font,
        }}
      >
        <div
          style={{
            width: 120, height: 8, borderRadius: 4,
            backgroundColor: colors.orange,
            marginBottom: spacing.md,
            transform: `scaleX(${s})`, transformOrigin: "left",
          }}
        />
        <div
          style={{
            fontSize: type.hook, fontWeight: 900, lineHeight: 1.08, color: colors.white,
            opacity: interpolate(frame, [3, 16], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
      <Caption words={scene.words} />
    </AbsoluteFill>
  );
};

/** Nömrələnmiş bənd — videonun əsas gövdəsi */
const ItemScene: React.FC<{ scene: Scene; total: number }> = ({ scene, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: motion.springConfig });

  return (
    <AbsoluteFill>
      <BackgroundMedia media={scene.media} durationInFrames={scene.durationInFrames} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: safeArea.side,
          paddingRight: safeArea.side,
          paddingBottom: safeArea.bottom + 60,
          paddingTop: safeArea.top,
          fontFamily: font,
        }}
      >
        <NumberBadge n={scene.index ?? 1} total={total} />
        <div
          style={{
            marginTop: spacing.sm,
            fontSize: type.title, fontWeight: 900, lineHeight: 1.1, color: colors.white,
            transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
            opacity: interpolate(frame, [motion.enterStagger, 18], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          {scene.title}
        </div>
      </AbsoluteFill>
      <Caption words={scene.words} />
    </AbsoluteFill>
  );
};

export const TipList: React.FC<Reel> = ({ hook, total, cta, scenes, music, musicVolume }) => {
  let cursor = 0;
  // Loyo yalnız CTA-dan əvvəl görünür — CTA-da onsuz da böyük loyo var
  const bugUntil = scenes
    .filter((s) => s.kind !== "cta")
    .reduce((a, b) => a + b.durationInFrames, 0);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio src={staticFile(music)} volume={musicVolume} loop />
      )}

      {scenes.map((scene, i) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
            {scene.audio && <Audio src={staticFile(scene.audio)} />}
            {scene.kind === "hook" && <HookScene scene={scene} text={hook} />}
            {scene.kind === "item" && <ItemScene scene={scene} total={total} />}
            {scene.kind === "cta" && <CtaScene line1={cta.line1} line2={cta.line2} />}
          </Sequence>
        );
      })}

      <Sequence durationInFrames={bugUntil}>
        <LogoBug />
      </Sequence>
    </AbsoluteFill>
  );
};
