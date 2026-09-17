/**
 * "Motion" — sərbəst quruluşlu illüstrasiya/motion-design videosu.
 *
 * Story-dan fərqi: səhnələr SABİT DEYİL. Hər video üçün model (pipeline/motion.ts) özü qurur —
 * neçə səhnə, hansı fon, hansı obyektlər, hər obyektin yeri, ölçüsü və hərəkət preseti, kamera, keçid, SFX.
 * Assetlər həmin videonun öz qovluğundan gəlir (public/render/<id>/assets) — heç vaxt təkrarlanmır.
 *
 * Koordinatlar nisbi (0..1): x = mərkəz, y = obyektin ALT xətti, w = kadr eninə görə en.
 */
import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { z } from "zod";
import { colors, safeArea, canvas } from "../brand/theme";
import { font } from "../brand/fonts";
import { AnimatedTitle } from "../components/AnimatedTitle";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import { Vignette } from "../components/Overlay";

export const TRANSITION = 12;
const W = canvas.width, H = canvas.height;

export const ANIMS = ["driveIn", "driveOut", "walkIn", "pop", "rise", "fall", "float", "spin", "shake", "slideLeft", "slideRight", "zoom", "swing", "none"] as const;
export const CAMERAS = ["none", "push", "pull", "panLeft", "panRight", "shake"] as const;
export const SFX = ["none", "whoosh", "pop", "engine", "ring", "step", "riser", "tick"] as const;
export const TRANSITIONS = ["slide", "fade", "wipe", "none"] as const;

const itemSchema = z.object({
  asset: z.string(),                                  // <id>/assets/<asset>.png
  x: z.number().default(0.5),                         // 0..1 — mərkəz
  y: z.number().default(0.78),                        // 0..1 — obyektin altı
  w: z.number().default(0.4),                         // 0..1 — en
  anim: z.enum(ANIMS).default("pop"),
  delay: z.number().default(0),
  flip: z.boolean().default(false),
  z: z.number().default(0),                           // sıralama
});
export const motionSceneSchema = z.object({
  bg: z.string(),                                     // <id>/assets/<bg>.jpg
  text: z.string().default(""),
  textPos: z.enum(["top", "center", "bottom"]).default("top"),
  camera: z.enum(CAMERAS).default("push"),
  transition: z.enum(TRANSITIONS).default("slide"),
  sfx: z.enum(SFX).default("none"),
  items: z.array(itemSchema).default([]),
  durationInFrames: z.number(),
});
export const motionSchema = z.object({
  id: z.string(),
  assets: z.string().default("assets"),
  bounds: z.record(z.string(), z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() })).optional(),
  scenes: z.array(motionSceneSchema).min(1),
  cta: z.object({ line1: z.string(), line2: z.string().default("Zəng et") }),
  music: z.string().nullable().default(null),
  musicVolume: z.number().default(0.75),
});
export type MotionProps = z.infer<typeof motionSchema>;
type Scene = z.infer<typeof motionSceneSchema>;
type Item = z.infer<typeof itemSchema>;

export const motionTotal = (scenes: { durationInFrames: number }[], hasCta = true) =>
  scenes.reduce((a, b) => a + b.durationInFrames, 0) + (hasCta ? 110 : 0) - scenes.length * TRANSITION;

/* ---------------------------------------------------------------- hərəkət presetləri */
const animate = (anim: Item["anim"], f: number, fps: number, dur: number) => {
  const s = spring({ frame: Math.max(0, f), fps, config: { damping: 14, stiffness: 150, mass: 0.8 } });
  const soft = spring({ frame: Math.max(0, f), fps, config: { damping: 22, stiffness: 90, mass: 1.1 } });
  const t = Math.max(0, f);
  switch (anim) {
    case "driveIn":    return { dx: interpolate(soft, [0, 1], [-1.6 * W, 0]), dy: Math.sin(t / 3) * 3, scale: 1, rot: 0, op: 1 };
    case "driveOut":   return { dx: interpolate(soft, [0, 1], [0, 1.8 * W]), dy: Math.sin(t / 3) * 3, scale: 1, rot: 0, op: 1 };
    case "slideLeft":  return { dx: interpolate(soft, [0, 1], [0.9 * W, 0]), dy: 0, scale: 1, rot: 0, op: 1 };
    case "slideRight": return { dx: interpolate(soft, [0, 1], [-0.9 * W, 0]), dy: 0, scale: 1, rot: 0, op: 1 };
    case "walkIn":     return { dx: interpolate(soft, [0, 1], [-0.7 * W, 0]), dy: -Math.abs(Math.sin(t / 3.5)) * 16, scale: 1, rot: Math.sin(t / 3.5) * 2, op: 1 };
    case "pop":        return { dx: 0, dy: 0, scale: s, rot: 0, op: interpolate(t, [0, 5], [0, 1], { extrapolateRight: "clamp" }) };
    case "rise":       return { dx: 0, dy: interpolate(s, [0, 1], [H * 0.5, 0]), scale: 1, rot: 0, op: interpolate(t, [0, 6], [0, 1], { extrapolateRight: "clamp" }) };
    case "fall":       return { dx: 0, dy: interpolate(s, [0, 1], [-H * 0.6, 0]), scale: 1, rot: interpolate(s, [0, 1], [-14, 0]), op: 1 };
    case "float":      return { dx: 0, dy: Math.sin(t / 16) * 22 - (1 - s) * 40, scale: 1, rot: Math.sin(t / 22) * 3, op: s };
    case "spin":       return { dx: 0, dy: 0, scale: s, rot: interpolate(t, [0, dur], [0, 360], { extrapolateRight: "clamp" }), op: s };
    case "swing":      return { dx: 0, dy: 0, scale: s, rot: Math.sin(t / 9) * 9, op: s };
    case "shake":      return { dx: Math.sin(t * 1.4) * 10, dy: 0, scale: s, rot: Math.sin(t * 1.1) * 3, op: s };
    case "zoom":       return { dx: 0, dy: 0, scale: interpolate(t, [0, dur], [1, 1.25], { extrapolateRight: "clamp" }), rot: 0, op: interpolate(t, [0, 6], [0, 1], { extrapolateRight: "clamp" }) };
    default:           return { dx: 0, dy: 0, scale: 1, rot: 0, op: 1 };
  }
};

const camera = (kind: Scene["camera"], p: number) => {
  switch (kind) {
    case "push":     return { scale: 1.06 + p * 0.1, x: 0, y: 0 };
    case "pull":     return { scale: 1.2 - p * 0.12, x: 0, y: 0 };
    case "panLeft":  return { scale: 1.16, x: interpolate(p, [0, 1], [60, -60]), y: 0 };
    case "panRight": return { scale: 1.16, x: interpolate(p, [0, 1], [-60, 60]), y: 0 };
    case "shake":    return { scale: 1.1, x: Math.sin(p * 60) * 8, y: Math.cos(p * 47) * 6 };
    default:         return { scale: 1.06, x: 0, y: 0 };
  }
};

/* ---------------------------------------------------------------- səhnə */
const SceneView: React.FC<{ s: Scene; base: string; bounds: Record<string, { bottom: number }> }> = ({ s, base, bounds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [0, s.durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const cam = camera(s.camera, p);
  const size = s.text.length > 34 ? 66 : s.text.length > 22 ? 76 : 88;
  const top = s.textPos === "top" ? safeArea.top + 90 : s.textPos === "center" ? H / 2 - 120 : H - safeArea.bottom - 220;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`, transformOrigin: "50% 60%" }}>
        <Img src={staticFile(`${base}/${s.bg}.jpg`)} style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover" }} />
        {[...s.items].sort((a, b) => a.z - b.z).map((it, i) => {
          const a = animate(it.anim, frame - it.delay, fps, s.durationInFrames);
          const w = it.w * W;
          const bottomPad = bounds[it.asset]?.bottom ?? 1;           // PNG-nin içindəki boşluq
          const left = it.x * W - w / 2 + a.dx;
          const topPx = it.y * H - w * bottomPad + a.dy;
          return (
            <Img
              key={i}
              src={staticFile(`${base}/${it.asset}.png`)}
              style={{
                position: "absolute", left, top: topPx, width: w, opacity: a.op,
                transform: `${it.flip ? "scaleX(-1) " : ""}scale(${a.scale}) rotate(${a.rot}deg)`,
                transformOrigin: "bottom center",
                filter: "drop-shadow(0 22px 28px rgba(0,0,0,0.45))",
              }}
            />
          );
        })}
      </AbsoluteFill>
      {/* oxunaqlıq */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,22,24,0.74) 0%, rgba(20,22,24,0.12) 30%, rgba(20,22,24,0) 55%, rgba(20,22,24,0.5) 100%)" }} />
      {s.text && (
        <div style={{ position: "absolute", left: safeArea.side, width: W - safeArea.side * 2, top, fontFamily: font, textShadow: "0 4px 24px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)" }}>
          <AnimatedTitle text={s.text} size={size} delay={4} stagger={3} accent={-1} lineHeight={1.08} />
        </div>
      )}
      {s.sfx !== "none" && (
        <Sequence from={2} durationInFrames={Math.min(40, s.durationInFrames)}>
          <Audio src={staticFile(`sfx/${s.sfx}.wav`)} volume={0.45} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- kompozisiya */
const present = (kind: Scene["transition"]): TransitionPresentation<any> =>
  kind === "fade" ? fade() : kind === "wipe" ? wipe({ direction: "from-bottom" }) : slide({ direction: "from-right" });

export const Motion: React.FC<MotionProps> = ({ scenes, cta, music, musicVolume, assets, bounds }) => {
  const base = assets || "assets";
  const b = (bounds ?? {}) as Record<string, { bottom: number }>;
  const total = motionTotal(scenes);
  const ctaFrom = total - 110;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio src={staticFile(music)} loop volume={(f) => {
          const base2 = f >= ctaFrom ? Math.min(1, musicVolume * 1.5) : musicVolume;
          return interpolate(f, [total - 40, total], [base2, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        }} />
      )}
      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          const el = (
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.durationInFrames}>
              <SceneView s={s} base={base} bounds={b} />
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [el];
          const prev = scenes[i - 1];
          if (prev.transition === "none") return [<TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={linearTiming({ durationInFrames: 1 })} />, el];
          return [<TransitionSeries.Transition key={`t${i}`} presentation={present(prev.transition)} timing={linearTiming({ durationInFrames: TRANSITION })} />, el];
        })}
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
        <TransitionSeries.Sequence durationInFrames={110}>
          <CtaScene line1={cta.line1} line2={cta.line2} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Sequence from={Math.max(0, ctaFrom - 30)} durationInFrames={45}>
        <Audio src={staticFile("sfx/riser.wav")} volume={0.5} />
      </Sequence>
      <Vignette />
      {ctaFrom > 0 && <Sequence durationInFrames={ctaFrom}><LogoBug /></Sequence>}
    </AbsoluteFill>
  );
};
