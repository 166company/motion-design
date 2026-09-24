/**
 * "SmmReel" — SMM agentin hazır postundan reel.
 *
 * Şəkli və sözləri SMM agent verir (təsdiqlənmiş meme: yazısız təmiz fotolar + ayrıca yazılar).
 * Bu şablon heç nə çəkmir və heç nə yazmır — yalnız hərəkət: kamera fokus nöqtəsinə gedir,
 * yazı brend şrifti ilə söz-söz çıxır, punchline zərbə ilə düşür, sonda bütöv post və CTA.
 *
 * Foto kadr formatına görə iki rejimdə göstərilir:
 *  - hündür foto (en/hündürlük < 0.7) → tam ekran, fokus nöqtəsinə görə kəsilir
 *  - geniş foto → ortada kart (yuxarı/aşağı bulanıq fon), heç nə kəsilmir
 */
import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { z } from "zod";
import { colors, safeArea, canvas } from "../brand/theme";
import { font } from "../brand/fonts";
import { AnimatedTitle } from "../components/AnimatedTitle";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import { Vignette } from "../components/Overlay";

const W = canvas.width, H = canvas.height;
export const SMM_TRANSITION = 10;
export const SMM_CTA = 110;
export const SMM_FINAL = 75;

export const SMM_CAMERAS = ["pushIn", "pullOut", "panLeft", "panRight", "tiltUp", "tiltDown", "still"] as const;
export const SMM_SFX = ["none", "whoosh", "pop", "tick", "riser", "step", "engine", "ring"] as const;

const plateSchema = z.object({ src: z.string(), aspect: z.number() });
const sceneSchema = z.object({
  plate: z.number(),
  text: z.string().default(""),
  label: z.string().default(""),
  punch: z.boolean().default(false),
  frames: z.number(),
  camera: z.enum(SMM_CAMERAS).default("pushIn"),
  focus: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  textAt: z.number().default(8),
  sfx: z.enum(SMM_SFX).default("none"),
});
export const smmReelSchema = z.object({
  id: z.string(),
  plates: z.array(plateSchema).min(1),
  final: plateSchema.nullable().default(null),
  header: z.string().default(""),
  lettered: z.boolean().default(false),
  scenes: z.array(sceneSchema).min(1),
  cta: z.object({ line1: z.string(), line2: z.string().default("Zəng et") }),
  music: z.string().nullable().default(null),
  musicVolume: z.number().default(0.6),
});
export type SmmReelProps = z.infer<typeof smmReelSchema>;
type Scene = z.infer<typeof sceneSchema>;
type Plate = z.infer<typeof plateSchema>;

export const smmReelTotal = (p: Pick<SmmReelProps, "scenes" | "final">) => {
  const beats = p.scenes.length + (p.final ? 1 : 0);
  return p.scenes.reduce((a, s) => a + s.frames, 0) + (p.final ? SMM_FINAL : 0) + SMM_CTA - beats * SMM_TRANSITION;
};

/* ---------------------------------------------------------------- kamera */
const cameraAt = (s: Scene, frame: number, fps: number) => {
  const p = interpolate(frame, [0, s.frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  if (s.punch) {
    // Punchline: sakit giriş, yazı düşən anda sürətli zərbə + qısa silkələnmə
    const hit = spring({ frame: frame - s.textAt, fps, config: { damping: 11, stiffness: 180, mass: 0.7 } });
    const shakeT = Math.max(0, frame - s.textAt);
    const shake = shakeT < 12 ? Math.sin(shakeT * 2.2) * (12 - shakeT) * 0.9 : 0;
    return { scale: 1.02 + hit * 0.16 + p * 0.03, x: shake, y: 0 };
  }
  switch (s.camera) {
    case "pushIn":   return { scale: 1.0 + p * 0.16, x: 0, y: 0 };
    case "pullOut":  return { scale: 1.16 - p * 0.14, x: 0, y: 0 };
    case "panLeft":  return { scale: 1.12, x: interpolate(p, [0, 1], [3.5, -3.5]), y: 0 };
    case "panRight": return { scale: 1.12, x: interpolate(p, [0, 1], [-3.5, 3.5]), y: 0 };
    case "tiltUp":   return { scale: 1.12, x: 0, y: interpolate(p, [0, 1], [3.5, -3.5]) };
    case "tiltDown": return { scale: 1.12, x: 0, y: interpolate(p, [0, 1], [-3.5, 3.5]) };
    default:         return { scale: 1.03 + Math.sin(frame / 30) * 0.008, x: 0, y: 0 };
  }
};

/** Fotonun özü: kamera transformu fokus nöqtəsi ətrafında (x,y faiz, yerdəyişmə — kadr eninin faizi). */
const Photo: React.FC<{ plate: Plate; cam: { scale: number; x: number; y: number }; focus: { x: number; y: number }; cover: boolean }> = ({ plate, cam, focus, cover }) => (
  <Img
    src={staticFile(plate.src)}
    style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      objectFit: cover ? "cover" : "fill",
      objectPosition: `${focus.x * 100}% ${focus.y * 100}%`,
      transform: `translate(${cam.x}%, ${cam.y}%) scale(${cam.scale})`,
      transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`,
    }}
  />
);

/** Geniş foto üçün kart ölçüsü: tam en, hündürlük təhlükəsiz zonaya sığır. */
const cardBox = (aspect: number) => {
  const maxH = H - 520;
  let w = W, h = W / aspect;
  if (h > maxH) { h = maxH; w = h * aspect; }
  return { w, h, left: (W - w) / 2, top: (H - h) / 2 + 20 };
};

/* ---------------------------------------------------------------- yazı */
const Words: React.FC<{ text: string; punch: boolean; where: "top" | "bottom" }> = ({ text, punch, where }) => {
  const upper = text.toLocaleUpperCase("az-AZ");
  const len = upper.length;
  const size = len > 48 ? 64 : len > 30 ? 74 : 88;
  const style: React.CSSProperties = {
    position: "absolute", left: safeArea.side - 60, width: W - (safeArea.side - 60) * 2,
    // yuxarıda loqo nişanı (LogoBug) var — yazı onun altından başlayır
    ...(where === "top" ? { top: safeArea.top + 120 } : { bottom: safeArea.bottom + 40 }),
    fontFamily: font,
    textShadow: "0 0 3px #000, 0 0 3px #000, 0 4px 18px rgba(0,0,0,0.85)",
  };
  return (
    <div style={style}>
      <AnimatedTitle text={upper} size={size} weight={900} delay={0} stagger={punch ? 2 : 3} accent={punch ? -1 : null} align="center" lineHeight={1.08} />
    </div>
  );
};

const Label: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <div style={{ position: "absolute", top: safeArea.top - 10, left: 0, width: W, display: "flex", justifyContent: "center" }}>
      <div style={{
        transform: `scale(${s})`, background: colors.orange, color: colors.white, fontFamily: font, fontWeight: 900,
        fontSize: 54, padding: "10px 34px", borderRadius: 999, letterSpacing: 1, boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}>{text.toLocaleUpperCase("az-AZ")}</div>
    </div>
  );
};

const Header: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: safeArea.top - 70, left: 60, width: W - 120, opacity: op, display: "flex", justifyContent: "center" }}>
      <div style={{
        background: colors.white, color: "#111", fontFamily: font, fontWeight: 900, fontSize: 50, lineHeight: 1.1,
        padding: "18px 30px", borderRadius: 22, textAlign: "center", boxShadow: "0 12px 34px rgba(0,0,0,0.35)",
      }}>{text.toLocaleUpperCase("az-AZ")}</div>
    </div>
  );
};

/* ---------------------------------------------------------------- səhnə */
const SceneView: React.FC<{ s: Scene; plate: Plate; header: string; lettered: boolean }> = ({ s, plate, header, lettered }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = cameraAt(s, frame, fps);
  const cover = plate.aspect < 0.7;
  const box = cardBox(plate.aspect);
  // Başlıq varsa yuxarı onundur; yazı aşağı düşür. Punchline həmişə aşağıda — göz ora enir.
  const where: "top" | "bottom" = header || s.label || s.punch ? "bottom" : "top";

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, overflow: "hidden" }}>
      {!cover && (
        <Img src={staticFile(plate.src)} style={{ position: "absolute", inset: -80, width: W + 160, height: H + 160, objectFit: "cover", filter: "blur(38px) brightness(0.5)" }} />
      )}
      {cover ? (
        <AbsoluteFill><Photo plate={plate} cam={cam} focus={s.focus} cover /></AbsoluteFill>
      ) : (
        <div style={{ position: "absolute", left: box.left, top: box.top, width: box.w, height: box.h, overflow: "hidden", borderRadius: box.w < W ? 24 : 0, boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }}>
          <Photo plate={plate} cam={cam} focus={s.focus} cover={false} />
        </div>
      )}
      {/* oxunaqlıq: yazının düşdüyü tərəf tündləşir */}
      {!lettered && s.text && (
        <AbsoluteFill style={{ background: where === "top"
          ? "linear-gradient(180deg, rgba(20,22,24,0.7) 0%, rgba(20,22,24,0) 34%)"
          : "linear-gradient(0deg, rgba(20,22,24,0.75) 0%, rgba(20,22,24,0.35) 30%, rgba(20,22,24,0) 50%)" }} />
      )}
      {header && <Header text={header} />}
      {s.label && <Sequence from={2}><Label text={s.label} /></Sequence>}
      {!lettered && s.text && (
        <Sequence from={s.textAt}><Words text={s.text} punch={s.punch} where={where} /></Sequence>
      )}
      {s.sfx !== "none" && (
        <Sequence from={s.punch ? s.textAt : Math.max(0, s.textAt - 2)} durationInFrames={40}>
          <Audio src={staticFile(`sfx/${s.sfx}.wav`)} volume={s.punch ? 0.6 : 0.4} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** Son vuruş: bütöv post (tanınan meme) — yavaşca geri çəkilir. */
const FinalView: React.FC<{ plate: Plate }> = ({ plate }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, SMM_FINAL], [1.08, 1.0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const box = cardBox(plate.aspect);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      <Img src={staticFile(plate.src)} style={{ position: "absolute", inset: -80, width: W + 160, height: H + 160, objectFit: "cover", filter: "blur(38px) brightness(0.45)" }} />
      <div style={{ position: "absolute", left: box.left, top: box.top, width: box.w, height: box.h, transform: `scale(${scale})`, borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.55)" }}>
        <Img src={staticFile(plate.src)} style={{ width: "100%", height: "100%", objectFit: "fill" }} />
      </div>
    </AbsoluteFill>
  );
};

const present = (i: number, nextIsPunch: boolean): TransitionPresentation<any> =>
  // Punchline-a kəskin keçid (komediya ritmi), qalanlarında növbə ilə slide / fade
  nextIsPunch ? fade() : i % 2 ? slide({ direction: "from-right" }) : fade();

export const SmmReel: React.FC<SmmReelProps> = ({ plates, final, header, lettered, scenes, cta, music, musicVolume }) => {
  const total = smmReelTotal({ scenes, final });
  const ctaFrom = total - SMM_CTA;
  // Bütöv postun öz loqosu var — son vuruşda nişan gizlənir ki, iki loqo olmasın və postun yazısını örtməsin
  const bugUntil = final ? ctaFrom - SMM_FINAL + SMM_TRANSITION : ctaFrom;
  const beats = [
    ...scenes.map((s, i) => ({ key: `s${i}`, frames: s.frames, punch: s.punch, el: <SceneView s={s} plate={plates[s.plate] ?? plates[0]} header={header} lettered={lettered} /> })),
    ...(final ? [{ key: "final", frames: SMM_FINAL, punch: false, el: <FinalView plate={final} /> }] : []),
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio src={staticFile(music)} loop volume={(f) => {
          const base = f >= ctaFrom ? Math.min(1, musicVolume * 1.4) : musicVolume;
          return interpolate(f, [0, 8, total - 40, total], [0, base, base, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        }} />
      )}
      <TransitionSeries>
        {beats.flatMap((b, i) => {
          const seq = <TransitionSeries.Sequence key={b.key} durationInFrames={b.frames}>{b.el}</TransitionSeries.Sequence>;
          if (i === 0) return [seq];
          return [<TransitionSeries.Transition key={`t${i}`} presentation={present(i, b.punch)} timing={linearTiming({ durationInFrames: SMM_TRANSITION })} />, seq];
        })}
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: SMM_TRANSITION })} />
        <TransitionSeries.Sequence durationInFrames={SMM_CTA}>
          <CtaScene line1={cta.line1} line2={cta.line2} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Sequence from={Math.max(0, ctaFrom - 30)} durationInFrames={45}>
        <Audio src={staticFile("sfx/riser.wav")} volume={0.45} />
      </Sequence>
      <Vignette />
      {bugUntil > 0 && <Sequence durationInFrames={bugUntil}><LogoBug /></Sequence>}
    </AbsoluteFill>
  );
};
