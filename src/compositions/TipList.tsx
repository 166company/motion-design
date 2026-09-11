import { AbsoluteFill, Audio, Sequence, staticFile, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { colors, safeArea, spacing, type, radius } from "../brand/theme";
import { font } from "../brand/fonts";
import { BackgroundMedia, type CameraMove } from "../components/BackgroundMedia";
import { Caption } from "../components/Caption";
import { IconBadge } from "../components/IconBadge";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import { AnimatedTitle, AccentLine } from "../components/AnimatedTitle";
import { Vignette, ProgressBar, Sweep } from "../components/Overlay";
import type { Reel, Scene } from "../types";

/** Səhnələrarası keçidin uzunluğu (kadr). Root-dakı calculateMetadata bunu nəzərə alır. */
export const TRANSITION = 12;

const MOVES: CameraMove[] = ["zoom-in", "pan-right", "zoom-out", "pan-left", "drift"];

/** Səhnə başlanğıc kadrları — keçidlər üst-üstə düşdüyü üçün sadə cəm deyil */
export const sceneStarts = (scenes: Scene[]) => {
  const starts: number[] = [];
  let acc = 0;
  scenes.forEach((s, i) => {
    starts.push(acc - i * TRANSITION);
    acc += s.durationInFrames;
  });
  return starts;
};
export const totalDuration = (scenes: Scene[]) =>
  scenes.reduce((a, b) => a + b.durationInFrames, 0) - (scenes.length - 1) * TRANSITION;

/* ---------------------------------------------------------------- Açılış */
const HookScene: React.FC<{ scene: Scene; text: string }> = ({ scene, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });

  return (
    <AbsoluteFill>
      <BackgroundMedia media={scene.media} durationInFrames={scene.durationInFrames} dim={0.7} move="zoom-in" />
      <Sweep delay={2} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: safeArea.side,
          paddingRight: safeArea.side,
          paddingBottom: safeArea.bottom + 40,
          paddingTop: safeArea.top,
          fontFamily: font,
        }}
      >
        <div
          style={{
            alignSelf: "flex-start",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: 3,
            color: colors.graphite,
            background: colors.orange,
            padding: "10px 22px",
            borderRadius: radius.pill,
            marginBottom: spacing.md,
            transform: `translateX(${interpolate(tag, [0, 1], [-60, 0])}px)`,
            opacity: tag,
          }}
        >
          YUK.AZ MƏSLƏHƏT
        </div>
        <AnimatedTitle text={text} size={type.hook} delay={6} stagger={4} accent={-1} />
        <div style={{ marginTop: spacing.md }}>
          <AccentLine width={180} delay={14} />
        </div>
      </AbsoluteFill>
      <Caption words={scene.words} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- Bənd */
const ItemScene: React.FC<{ scene: Scene; total: number; index: number }> = ({ scene, total, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panel = spring({ frame: Math.max(0, frame - 2), fps, config: { damping: 16, stiffness: 120 } });

  return (
    <AbsoluteFill>
      <BackgroundMedia media={scene.media} durationInFrames={scene.durationInFrames} move={MOVES[index % MOVES.length]} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: safeArea.side,
          paddingRight: safeArea.side,
          paddingBottom: safeArea.bottom + 70,
          paddingTop: safeArea.top,
          fontFamily: font,
        }}
      >
        <IconBadge n={scene.index ?? 1} total={total} icon={scene.icon ?? null} delay={3} />

        {/* başlıq paneli — soldan sürüşür, sol tərəfdə narıncı bracket */}
        <div
          style={{
            marginTop: spacing.md,
            paddingLeft: spacing.sm + 6,
            borderLeft: `8px solid ${colors.orange}`,
            transform: `translateX(${interpolate(panel, [0, 1], [-40, 0])}px)`,
            opacity: panel,
          }}
        >
          <AnimatedTitle text={scene.title ?? ""} size={type.title} delay={8} stagger={3} lineHeight={1.08} />
        </div>
      </AbsoluteFill>
      <Caption words={scene.words} />
      {/* ikon "pop" səsi */}
      <Sequence from={4} durationInFrames={12}>
        <Audio src={staticFile("sfx/pop.wav")} volume={0.55} />
      </Sequence>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- Kompozisiya */
export const TipList: React.FC<Reel> = ({ hook, total, cta, scenes, music, musicVolume }) => {
  const starts = sceneStarts(scenes);
  const totalFrames = totalDuration(scenes);
  const ctaIdx = scenes.findIndex((s) => s.kind === "cta");
  const ctaFrom = ctaIdx >= 0 ? starts[ctaIdx] : totalFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {/* musiqi: səsləndirmə altında aşağı, CTA-da qalxır, sonda sönür */}
      {music && (
        <Audio
          src={staticFile(music)}
          loop
          volume={(f) => {
            const base = f >= ctaFrom
              ? interpolate(f, [ctaFrom, ctaFrom + 12], [musicVolume, Math.min(1, musicVolume * 2)], { extrapolateRight: "clamp" })
              : musicVolume;
            return interpolate(f, [totalFrames - 40, totalFrames], [base, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          }}
        />
      )}

      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const el = (
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={scene.durationInFrames}>
              {scene.audio && <Audio src={staticFile(scene.audio)} />}
              {scene.kind === "hook" && <HookScene scene={scene} text={hook} />}
              {scene.kind === "item" && <ItemScene scene={scene} total={total} index={i} />}
              {scene.kind === "cta" && <CtaScene line1={cta.line1} line2={cta.line2} />}
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [el];
          const isCta = scene.kind === "cta";
          // TS: fərqli presentation tipləri birləşəndə generic daralır — açıq şəkildə genişləndiririk
          const presentation: TransitionPresentation<any> = isCta
            ? fade()
            : i % 2 === 0
              ? slide({ direction: "from-right" })
              : wipe({ direction: "from-bottom" });
          return [
            <TransitionSeries.Transition
              key={`t${i}`}
              presentation={presentation}
              timing={linearTiming({ durationInFrames: TRANSITION })}
            />,
            el,
          ];
        })}
      </TransitionSeries>

      {/* keçid səsləri */}
      {starts.slice(1).map((from, i) => {
        const isCta = scenes[i + 1].kind === "cta";
        return (
          <Sequence key={`sfx${i}`} from={Math.max(0, from - (isCta ? 30 : 2))} durationInFrames={isCta ? 45 : 20}>
            <Audio src={staticFile(isCta ? "sfx/riser.wav" : "sfx/whoosh.wav")} volume={isCta ? 0.5 : 0.45} />
          </Sequence>
        );
      })}

      <Vignette />
      <Sequence durationInFrames={ctaFrom}>
        <ProgressBar segments={scenes.filter((s) => s.kind !== "cta").map((s) => s.durationInFrames - TRANSITION)} total={ctaFrom} />
        <LogoBug />
      </Sequence>
    </AbsoluteFill>
  );
};
