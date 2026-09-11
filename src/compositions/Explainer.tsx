/**
 * "Explainer" — tam kodla çəkilmiş kinetik izahat. Stok video yoxdur.
 * Səhnələr: intro → zəng → çat → yükləmə → marşrut → CTA.
 * Səsləndirmə istəyə bağlıdır: audio yoxdursa, yalnız musiqi + SFX + ekran mətni.
 */
import { AbsoluteFill, Audio, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { z } from "zod";
import { colors, safeArea, spacing, type, radius } from "../brand/theme";
import { font } from "../brand/fonts";
import { wordSchema } from "../types";
import { Caption } from "../components/Caption";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import { AnimatedTitle, AccentLine } from "../components/AnimatedTitle";
import { Vignette } from "../components/Overlay";
import { Box, Truck, Road, Skyline, Clouds, RingingPhone, Bubble, RouteMap } from "../components/explainer/assets";

export const TRANSITION = 12;

export const explainerSceneSchema = z.object({
  kind: z.enum(["intro", "call", "chat", "load", "route", "cta"]),
  heading: z.string().default(""),
  sub: z.string().default(""),
  /** çat səhnəsi üçün baloncuqlar; marşrut üçün [from, to] */
  lines: z.array(z.string()).default([]),
  spoken: z.string().default(""),
  audio: z.string().nullable().default(null),
  words: z.array(wordSchema).default([]),
  durationInFrames: z.number(),
});

export const explainerSchema = z.object({
  id: z.string(),
  cta: z.object({ line1: z.string(), line2: z.string() }),
  music: z.string().nullable(),
  musicVolume: z.number().default(0.5),
  scenes: z.array(explainerSceneSchema),
});
export type ExplainerProps = z.infer<typeof explainerSchema>;
type S = z.infer<typeof explainerSceneSchema>;

export const explainerTotal = (scenes: { durationInFrames: number }[]) =>
  scenes.reduce((a, b) => a + b.durationInFrames, 0) - (scenes.length - 1) * TRANSITION;
const starts = (scenes: { durationInFrames: number }[]) => {
  let acc = 0;
  return scenes.map((s, i) => { const v = acc - i * TRANSITION; acc += s.durationInFrames; return v; });
};

/* ---------------------------------------------------------- ortaq: başlıq blokunun yeri */
const Heading: React.FC<{ s: S; step?: number; top?: boolean }> = ({ s, step, top = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pill = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  return (
    <div
      style={{
        position: "absolute", left: safeArea.side, right: safeArea.side,
        ...(top ? { top: safeArea.top + 40 } : { bottom: safeArea.bottom + 30 }),
        fontFamily: font,
      }}
    >
      {step !== undefined && (
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 14, marginBottom: spacing.sm,
            background: colors.orange, color: colors.graphite, borderRadius: radius.pill,
            padding: "8px 22px 8px 10px", fontWeight: 900, fontSize: 30, letterSpacing: 2,
            transform: `translateX(${interpolate(pill, [0, 1], [-50, 0])}px)`, opacity: pill,
          }}
        >
          <span style={{ width: 44, height: 44, borderRadius: "50%", background: colors.graphite, color: colors.orange, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{step}</span>
          ADDIM
        </div>
      )}
      <AnimatedTitle text={s.heading} size={type.title} delay={4} stagger={3} lineHeight={1.08} />
      {s.sub && (
        <div style={{ marginTop: spacing.sm, fontSize: 44, fontWeight: 600, color: "rgba(255,255,255,0.8)", opacity: interpolate(frame, [12, 24], [0, 1], { extrapolateRight: "clamp" }) }}>
          {s.sub}
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------- 1. Intro: kub düşür, parçalanır */
const Intro: React.FC<{ s: S }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const drop = spring({ frame, fps, config: { damping: 9, stiffness: 120, mass: 1.1 } });
  const split = spring({ frame: Math.max(0, frame - 26), fps, config: { damping: 12, stiffness: 110 } });
  const big = 380;
  const cx = width / 2 - big / 2;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #2B3034 0%, ${colors.graphite} 70%)` }}>
      <Clouds />
      {/* böyük kub — düşür, sonra 3 kiçik quta "parçalanır" */}
      {[-1, 0, 1].map((k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: cx + k * split * 300,
            top: 560 + interpolate(drop, [0, 1], [-700, 0]) + Math.abs(k) * split * 40,
            width: big, height: big,
            transform: `scale(${1 - split * 0.42}) rotate(${interpolate(drop, [0, 1], [-30, 0]) + k * split * 12}deg)`,
            opacity: k === 0 ? 1 : split,
            filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.5))",
          }}
        >
          <img src={staticFile("logo/logo-icon.svg")} style={{ width: "100%", height: "100%" }} />
        </div>
      ))}
      <div style={{ position: "absolute", left: safeArea.side, right: safeArea.side, bottom: safeArea.bottom + 40, fontFamily: font }}>
        <AccentLine width={160} delay={20} />
        <div style={{ height: spacing.sm }} />
        <AnimatedTitle text={s.heading} size={type.hook} delay={24} stagger={4} accent={-1} />
      </div>
      <Caption words={s.words} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------- 2. Zəng */
const Call: React.FC<{ s: S; step: number }> = ({ s, step }) => (
  <AbsoluteFill style={{ background: colors.graphite }}>
    <Heading s={s} step={step} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center" }}>
      <RingingPhone size={420} />
    </div>
    <Caption words={s.words} />
  </AbsoluteFill>
);

/* ---------------------------------------------------------- 3. Çat */
const Chat: React.FC<{ s: S; step: number }> = ({ s, step }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, ${colors.graphite}, #24282C)` }}>
    <Heading s={s} step={step} />
    <div style={{ position: "absolute", left: safeArea.side, right: safeArea.side, top: 720, display: "flex", flexDirection: "column", gap: 24, fontFamily: font }}>
      {s.lines.map((t, i) => (
        <Bubble key={i} text={t} side={i % 2 === 0 ? "left" : "right"} delay={8 + i * 22} check={i === s.lines.length - 1} />
      ))}
    </div>
    <Caption words={s.words} />
  </AbsoluteFill>
);

/* ---------------------------------------------------------- 4. Yükləmə */
const Load: React.FC<{ s: S; step: number }> = ({ s, step }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const arrive = spring({ frame, fps, config: { damping: 18, stiffness: 60, mass: 1.2 } });
  const truckX = interpolate(arrive, [0, 1], [-700, 120]);
  const truckY = 1180;
  const boxesIn = Math.max(0, Math.floor((frame - 40) / 12));
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #1B1E21 0%, ${colors.graphite} 60%)` }}>
      <Clouds />
      <Skyline y={880} speed={0} />
      <Road y={1190 + 200} speed={0} />
      <Heading s={s} step={step} />
      <Truck x={truckX} y={truckY} scale={1.05} boxes={Math.min(5, boxesIn)} moving={arrive < 0.98} />
      {/* qutular yuxarıdan maşına düşür */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Box key={i} size={90} x={200 + i * 66} y={1300} delay={40 + i * 12} from={-600} />
      ))}
      <Caption words={s.words} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Sequence key={`p${i}`} from={44 + i * 12} durationInFrames={10}>
          <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------- 5. Marşrut */
const Route: React.FC<{ s: S; step: number }> = ({ s, step }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [10, s.durationInFrames - 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: colors.graphite }}>
      <Heading s={s} step={step} />
      <div style={{ position: "absolute", left: 30, top: 700 }}>
        <RouteMap from={s.lines[0] ?? "Bakı"} to={s.lines[1] ?? "Gəncə"} progress={p} />
      </div>
      <Skyline y={1330} speed={6} />
      <Road y={1560} speed={22} />
      <Truck x={60} y={1350} scale={0.9} boxes={5} />
      <Caption words={s.words} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------- Kompozisiya */
export const Explainer: React.FC<ExplainerProps> = ({ cta, scenes, music, musicVolume }) => {
  const st = starts(scenes);
  const total = explainerTotal(scenes);
  const ctaIdx = scenes.findIndex((s) => s.kind === "cta");
  const ctaFrom = ctaIdx >= 0 ? st[ctaIdx] : total;
  let step = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio
          src={staticFile(music)}
          loop
          volume={(f) => {
            const base = f >= ctaFrom
              ? interpolate(f, [ctaFrom, ctaFrom + 12], [musicVolume, Math.min(1, musicVolume * 1.8)], { extrapolateRight: "clamp" })
              : musicVolume;
            return interpolate(f, [total - 40, total], [base, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          }}
        />
      )}

      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          if (["call", "chat", "load", "route"].includes(s.kind)) step += 1;
          const n = step;
          const el = (
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.durationInFrames}>
              {s.audio && <Audio src={staticFile(s.audio)} />}
              {s.kind === "intro" && <Intro s={s} />}
              {s.kind === "call" && <Call s={s} step={n} />}
              {s.kind === "chat" && <Chat s={s} step={n} />}
              {s.kind === "load" && <Load s={s} step={n} />}
              {s.kind === "route" && <Route s={s} step={n} />}
              {s.kind === "cta" && <CtaScene line1={cta.line1} line2={cta.line2} />}
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [el];
          const pres: TransitionPresentation<any> =
            s.kind === "cta" ? fade() : i % 2 ? slide({ direction: "from-right" }) : wipe({ direction: "from-top" });
          return [<TransitionSeries.Transition key={`t${i}`} presentation={pres} timing={linearTiming({ durationInFrames: TRANSITION })} />, el];
        })}
      </TransitionSeries>

      {st.slice(1).map((from, i) => {
        const isCta = scenes[i + 1].kind === "cta";
        return (
          <Sequence key={`sfx${i}`} from={Math.max(0, from - (isCta ? 30 : 2))} durationInFrames={isCta ? 45 : 20}>
            <Audio src={staticFile(isCta ? "sfx/riser.wav" : "sfx/whoosh.wav")} volume={isCta ? 0.5 : 0.45} />
          </Sequence>
        );
      })}

      <Vignette />
      {ctaFrom > 0 && (
        <Sequence durationInFrames={ctaFrom}>
          <LogoBug />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
