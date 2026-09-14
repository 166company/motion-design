/**
 * "Story" — illüstrasiyalı hekayə. Assetlər AI ilə brend rənglərində yaradılıb (public/assets),
 * animasiya tamamilə kodladır: parallaks, yeriş, uçan əşyalar, toz, kamera panı.
 * Səhnələr: call → pack → load → arrive → cta.
 */
import { createContext, useContext } from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { z } from "zod";
import { colors, safeArea, spacing, type, radius } from "../brand/theme";
import { font } from "../brand/fonts";
import { wordSchema } from "../types";
import { Caption } from "../components/Caption";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import { AnimatedTitle } from "../components/AnimatedTitle";
import { Vignette } from "../components/Overlay";
import bounds from "../assetBounds.json";

/** PNG-lər kvadratdır, içində boşluq var — kontentin altı yerə otursun deyə bbox-a görə hesablanır */
type Bounds = Record<string, { left: number; top: number; right: number; bottom: number }>;
const DEFAULT_BOUNDS = bounds as Bounds;

/** Hər postun öz asset dəsti ola bilər (public/render/<id>/assets) — base + bounds kontekstlə gəlir */
const AssetsCtx = createContext<{ base: string; bounds: Bounds }>({ base: "assets", bounds: DEFAULT_BOUNDS });
const useAssets = () => {
  const a = useContext(AssetsCtx);
  return {
    A: (n: string) => staticFile(`${a.base}/${n}.png`),
    bgSrc: (n: string) => staticFile(`${a.base}/${n}.jpg`),
    footTop: (name: string, foot: number, w: number) => foot - w * (a.bounds[name] ?? DEFAULT_BOUNDS[name]).bottom,
  };
};

export const TRANSITION = 12;

export const storySceneSchema = z.object({
  kind: z.enum(["call", "pack", "load", "arrive", "cta"]),
  heading: z.string().default(""),
  spoken: z.string().default(""),
  audio: z.string().nullable().default(null),
  words: z.array(wordSchema).default([]),
  durationInFrames: z.number(),
});
export const storySchema = z.object({
  id: z.string(),
  /** asset qovluğu (public-nisbi) — post üçün fərqli dəst; default ortaq public/assets */
  assets: z.string().default("assets"),
  bounds: z.record(z.string(), z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() })).optional(),
  cta: z.object({ line1: z.string(), line2: z.string() }),
  music: z.string().nullable(),
  musicVolume: z.number().default(0.5),
  scenes: z.array(storySceneSchema),
});
export type StoryProps = z.infer<typeof storySchema>;
type S = z.infer<typeof storySceneSchema>;

export const storyTotal = (scenes: { durationInFrames: number }[]) =>
  scenes.reduce((a, b) => a + b.durationInFrames, 0) - (scenes.length - 1) * TRANSITION;
const starts = (scenes: { durationInFrames: number }[]) => {
  let acc = 0;
  return scenes.map((s, i) => { const v = acc - i * TRANSITION; acc += s.durationInFrames; return v; });
};

/* ---------------------------------------------------------------- Səhnə fonu: AI illüstrasiya + parallaks */
const GROUND_Y = 1500;   // küçə/ev fonlarında yol səthi (~78%)
const FLOOR_Y = 1460;    // interyerdə döşəmə
/** Pan dəyəri — Head/Caption kimi sabit qalmalı elementlər bunu kompensasiya edir */
const PanCtx = createContext(0);

const World: React.FC<{ bg: "bg_street" | "bg_home" | "bg_interior"; pan?: number; duration: number; children?: React.ReactNode }> = ({ bg, pan = 0, duration, children }) => {
  const frame = useCurrentFrame();
  const { bgSrc } = useAssets();
  const p = interpolate(frame, [0, duration], [0, 1], { extrapolateRight: "clamp" });
  const zoom = 1.08 + p * 0.06;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, overflow: "hidden" }}>
      {/* fon — yavaş zoom + panın 20%-i (parallaks) */}
      <Img
        src={bgSrc(bg)}
        style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, objectFit: "cover",
                 transform: `translateX(${-pan * 0.2}px) scale(${zoom})`, transformOrigin: "50% 70%" }}
      />
      {/* oxunaqlıq: yuxarı və aşağı yumşaq qaralma */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,22,24,0.72) 0%, rgba(20,22,24,0.15) 30%, rgba(20,22,24,0) 55%, rgba(20,22,24,0.55) 100%)" }} />
      {/* yaxın qat — səhnə elementləri tam pan ilə */}
      <div style={{ position: "absolute", left: -pan, top: 0, width: 3000, height: 1920 }}><PanCtx.Provider value={pan}>{children}</PanCtx.Provider></div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- yardımçılar */
const Sprite: React.FC<{ name: string; x: number; y: number; w: number; style?: React.CSSProperties; flip?: boolean }> = ({ name, x, y, w, style, flip }) => {
  const { A } = useAssets();
  return (
  <Img src={A(name)} style={{ position: "absolute", left: x, top: y, width: w, transform: `${flip ? "scaleX(-1) " : ""}${style?.transform ?? ""}`, transformOrigin: "bottom center", filter: "drop-shadow(0 18px 24px rgba(0,0,0,0.45))", ...style, }} />
  );
};

const Shadow: React.FC<{ x: number; y: number; w: number; s?: number }> = ({ x, y, w, s = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: w * 0.12, borderRadius: "50%", background: "rgba(0,0,0,0.4)", transform: `scale(${s})`, filter: "blur(6px)" }} />
);

const Puffs: React.FC<{ x: number; y: number; from: number }> = ({ x, y, from }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const f = frame - from - i * 4;
        if (f < 0 || f > 30) return null;
        const p = f / 30;
        return <div key={i} style={{ position: "absolute", left: x - p * 140 - i * 20, top: y - p * 60, width: 40 + p * 70, height: 40 + p * 70, borderRadius: "50%", background: "rgba(245,245,243,0.35)", opacity: 1 - p, filter: "blur(4px)" }} />;
      })}
    </>
  );
};

/** Kadr enində sabit qat (pan-ı kompensasiya edir) — altyazı üçün */
const Fixed: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const pan = useContext(PanCtx);
  return <div style={{ position: "absolute", left: pan, top: 0, width: 1080, height: 1920 }}>{children}</div>;
};

// Səhnə qatı 3000px enlidir və pan ilə sürüşür — başlıq kadr enində (1080 − kənarlar) və sabit qalır
const Head: React.FC<{ text: string }> = ({ text }) => {
  const pan = useContext(PanCtx);
  const size = text.length > 30 ? 64 : type.title;
  return (
    <div style={{ position: "absolute", left: safeArea.side + pan, width: 1080 - safeArea.side * 2, top: safeArea.top + 130, fontFamily: font, textShadow: "0 4px 22px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.5)" }}>
      <AnimatedTitle text={text} size={size} delay={4} stagger={3} accent={-1} lineHeight={1.08} />
    </div>
  );
};

/* ---------------------------------------------------------------- 1. Zəng: bina + telefon */
const Call: React.FC<{ s: S }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { footTop } = useAssets();
  const { fps } = useVideoConfig();
  const phone = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 10, stiffness: 150 } });
  const shake = frame > 20 && frame % 36 < 16 ? Math.sin(frame * 1.5) * 6 : 0;
  return (
    <World bg="bg_street" duration={s.durationInFrames}>
      <Shadow x={380} y={GROUND_Y - 40} w={400} s={phone} />
      <Sprite name="phone" x={300} y={footTop("phone", GROUND_Y - 20, 480)} w={480} style={{ transform: `scale(${phone}) rotate(${shake}deg)` }} />
      {[0, 1, 2].map((i) => {
        const p = ((frame - 20 + i * 12) % 36) / 36;
        return frame > 20 ? <div key={i} style={{ position: "absolute", left: 390, top: GROUND_Y - 520, width: 300, height: 300, borderRadius: "50%", border: `6px solid ${colors.orange}`, transform: `scale(${1 + p * 1.2})`, opacity: (1 - p) * 0.6 }} /> : null;
      })}
      <Head text={s.heading} />
      <Fixed><Caption words={s.words} /></Fixed>
      <Sequence from={6} durationInFrames={10}><Audio src={staticFile("sfx/pop.wav")} volume={0.5} /></Sequence>
      {[20, 56].map((f) => <Sequence key={f} from={f} durationInFrames={24}><Audio src={staticFile("sfx/ring.wav")} volume={0.45} /></Sequence>)}
    </World>
  );
};

/* ---------------------------------------------------------------- 2. Qablaşdırma: daşıyıcı gəlir, qutular yığılır */
const Pack: React.FC<{ s: S }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { footTop } = useAssets();
  const { fps } = useVideoConfig();
  const walk = interpolate(frame, [0, 50], [-500, 120], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const bob = frame < 50 ? Math.abs(Math.sin(frame / 3)) * 14 : 0;
  const tilt = frame < 50 ? Math.sin(frame / 3) * 3 : 0;
  const boxes = spring({ frame: Math.max(0, frame - 46), fps, config: { damping: 9, stiffness: 130 } });
  const sofa = spring({ frame: Math.max(0, frame - 70), fps, config: { damping: 14, stiffness: 90 } });
  const plant = spring({ frame: Math.max(0, frame - 84), fps, config: { damping: 10, stiffness: 160 } });
  return (
    <World bg="bg_interior" duration={s.durationInFrames}>
      <Shadow x={walk + 60} y={FLOOR_Y - 30} w={340} />
      <Sprite name="mover" x={walk} y={footTop("mover", FLOOR_Y, 520) - bob} w={520} style={{ transform: `rotate(${tilt}deg)` }} />
      <Shadow x={640} y={FLOOR_Y - 30} w={420} s={boxes} />
      <Sprite name="boxes" x={620} y={footTop("boxes", FLOOR_Y, 440) + (1 - boxes) * -300} w={440} style={{ transform: `scale(${0.8 + boxes * 0.2})`, opacity: boxes }} />
      <Shadow x={1060} y={FLOOR_Y - 30} w={560} s={sofa} />
      <Sprite name="sofa" x={1040 + (1 - sofa) * 700} y={footTop("sofa", FLOOR_Y, 600)} w={600} style={{ opacity: sofa }} />
      <Sprite name="plant" x={80} y={footTop("plant", FLOOR_Y - 10, 260)} w={260} style={{ transform: `scale(${plant})`, opacity: plant }} />
      <Head text={s.heading} />
      <Fixed><Caption words={s.words} /></Fixed>
      {[6, 12, 18, 24, 30, 36, 42].map((f) => <Sequence key={f} from={f} durationInFrames={6}><Audio src={staticFile("sfx/step.wav")} volume={0.35} /></Sequence>)}
      <Sequence from={48} durationInFrames={10}><Audio src={staticFile("sfx/pop.wav")} volume={0.55} /></Sequence>
      <Sequence from={72} durationInFrames={14}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.4} /></Sequence>
      <Sequence from={86} durationInFrames={10}><Audio src={staticFile("sfx/pop.wav")} volume={0.45} /></Sequence>
    </World>
  );
};

/* ---------------------------------------------------------------- 3. Yükləmə: maşın gəlir, əşyalar içinə uçur, yola düşür */
const Load: React.FC<{ s: S }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { footTop } = useAssets();
  const { fps } = useVideoConfig();
  const D = s.durationInFrames;
  // maşının üzü sağa baxır: SOLDAN gəlir, dayanır, yüklənir, SAĞA yola düşür
  const arrive = interpolate(frame, [0, 40], [-1100, 100], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const leaveStart = D - 50;
  const leave = interpolate(frame, [leaveStart, D], [0, 1700], { extrapolateLeft: "clamp", easing: Easing.in(Easing.quad) });
  const truckX = arrive + leave;
  const bounce = frame < 40 || frame > leaveStart ? Math.sin(frame / 2) * 3 : 0;
  // əşyalar: 46-cı kadrdan maşına "uçur"
  const fly = (from: number) => spring({ frame: Math.max(0, frame - from), fps, config: { damping: 14, stiffness: 80 } });
  const fb = fly(46), fs = fly(64);
  const inTruck = { x: truckX + 170, y: GROUND_Y - 330 };
  return (
    <World bg="bg_street" duration={s.durationInFrames}>
      <Shadow x={truckX + 20} y={GROUND_Y - 40} w={900} />
      <Sprite name="truck" x={truckX} y={footTop("truck", GROUND_Y, 900) + bounce} w={900} />
      {/* qutular */}
      <Sprite name="boxes" x={interpolate(fb, [0, 1], [1450, inTruck.x])} y={interpolate(fb, [0, 1], [footTop("boxes", GROUND_Y, 440), inTruck.y - 120])} w={interpolate(fb, [0, 1], [440, 220])} style={{ opacity: 1 - Math.max(0, fb - 0.8) / 0.2 }} />
      {/* divan */}
      <Sprite name="sofa" x={interpolate(fs, [0, 1], [1900, inTruck.x + 60])} y={interpolate(fs, [0, 1], [footTop("sofa", GROUND_Y, 520), inTruck.y - 60])} w={interpolate(fs, [0, 1], [520, 240])} style={{ opacity: 1 - Math.max(0, fs - 0.8) / 0.2 }} />
      {/* toz — yola düşəndə */}
      <Puffs x={truckX + 40} y={GROUND_Y - 40} from={leaveStart} />
      <Head text={s.heading} />
      <Fixed><Caption words={s.words} /></Fixed>
      <Sequence from={0} durationInFrames={44}><Audio src={staticFile("sfx/engine.wav")} volume={0.5} /></Sequence>
      <Sequence from={40} durationInFrames={10}><Audio src={staticFile("sfx/pop.wav")} volume={0.4} /></Sequence>
      <Sequence from={46} durationInFrames={14}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.45} /></Sequence>
      <Sequence from={58} durationInFrames={8}><Audio src={staticFile("sfx/pop.wav")} volume={0.5} /></Sequence>
      <Sequence from={64} durationInFrames={14}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.45} /></Sequence>
      <Sequence from={76} durationInFrames={8}><Audio src={staticFile("sfx/pop.wav")} volume={0.5} /></Sequence>
      <Sequence from={leaveStart} durationInFrames={50}><Audio src={staticFile("sfx/engine.wav")} volume={0.55} /></Sequence>
    </World>
  );
};

/* ---------------------------------------------------------------- 4. Çatdı: kamera panı, yeni bina, daşıyıcı qutu ilə */
const Arrive: React.FC<{ s: S }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { footTop } = useAssets();
  const pan = interpolate(frame, [0, s.durationInFrames], [0, 420], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const truckX = interpolate(frame, [0, 45], [-1000, 900], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const moverX = interpolate(frame, [50, 100], [1150, 1420], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bob = frame > 50 && frame < 100 ? Math.abs(Math.sin(frame / 3)) * 12 : 0;
  return (
    <World bg="bg_home" pan={pan} duration={s.durationInFrames}>
      <Shadow x={truckX + 20} y={GROUND_Y - 40} w={900} />
      <Sprite name="truck" x={truckX} y={footTop("truck", GROUND_Y, 900) + (frame < 45 ? Math.sin(frame / 2) * 3 : 0)} w={900} />
      {frame > 50 && <Sprite name="mover" x={moverX} y={footTop("mover", GROUND_Y, 440) - bob} w={440} />}
      <Head text={s.heading} />
      <Fixed><Caption words={s.words} /></Fixed>
      <Sequence from={0} durationInFrames={46}><Audio src={staticFile("sfx/engine.wav")} volume={0.45} /></Sequence>
      <Sequence from={44} durationInFrames={10}><Audio src={staticFile("sfx/pop.wav")} volume={0.4} /></Sequence>
      {[54, 60, 66, 72, 78, 84, 90, 96].map((f) => <Sequence key={f} from={f} durationInFrames={6}><Audio src={staticFile("sfx/step.wav")} volume={0.3} /></Sequence>)}
    </World>
  );
};

/* ---------------------------------------------------------------- Kompozisiya */
export const Story: React.FC<StoryProps> = ({ cta, scenes, music, musicVolume, assets, bounds: b }) => {
  const st = starts(scenes);
  const total = storyTotal(scenes);
  const ctaIdx = scenes.findIndex((s) => s.kind === "cta");
  const ctaFrom = ctaIdx >= 0 ? st[ctaIdx] : total;
  return (
    <AssetsCtx.Provider value={{ base: assets || "assets", bounds: { ...DEFAULT_BOUNDS, ...(b ?? {}) } }}>
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio src={staticFile(music)} loop volume={(f) => {
          const base = f >= ctaFrom ? interpolate(f, [ctaFrom, ctaFrom + 12], [musicVolume, Math.min(1, musicVolume * 1.8)], { extrapolateRight: "clamp" }) : musicVolume;
          return interpolate(f, [total - 40, total], [base, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        }} />
      )}
      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          const el = (
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.durationInFrames}>
              {s.audio && <Audio src={staticFile(s.audio)} />}
              {s.kind === "call" && <Call s={s} />}
              {s.kind === "pack" && <Pack s={s} />}
              {s.kind === "load" && <Load s={s} />}
              {s.kind === "arrive" && <Arrive s={s} />}
              {s.kind === "cta" && <CtaScene line1={cta.line1} line2={cta.line2} />}
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [el];
          const pres: TransitionPresentation<any> = s.kind === "cta" ? fade() : slide({ direction: "from-right" });
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
      {ctaFrom > 0 && <Sequence durationInFrames={ctaFrom}><LogoBug /></Sequence>}
    </AbsoluteFill>
    </AssetsCtx.Provider>
  );
};
