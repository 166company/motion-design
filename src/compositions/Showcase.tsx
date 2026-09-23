/**
 * "Showcase" — premium motion design: real stok kadrlar (Pexels) + kinetik tipoqrafiya + brend çərçivəsi.
 *
 * Hər səhnə: media (video/foto) + kamera hərəkəti + maska ilə açılan mətn + istəyə bağlı "data rozetkası"
 * (real rəqəm: hava, bayram, marşrut). Assetlər hər videoda fərqlidir — sorğular ssenaridən gəlir.
 */
import { AbsoluteFill, Audio, Img, OffthreadVideo, Loop, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { z } from "zod";
import { colors, safeArea, canvas } from "../brand/theme";
import { font } from "../brand/fonts";
import { CtaScene } from "../components/CtaScene";
import { LogoBug } from "../components/LogoBug";
import { Vignette } from "../components/Overlay";

export const TRANSITION = 10;
const W = canvas.width, H = canvas.height;
const CTA_FRAMES = 110;

export const MOVES = ["pushIn", "pullOut", "panLeft", "panRight", "tiltUp", "still"] as const;
export const REVEALS = ["maskUp", "wordPop", "typeLine", "slideIn"] as const;

const sceneSchema = z.object({
  media: z.string(),                           // render/<id>/mN.mp4 | .jpg
  kind: z.enum(["video", "photo"]).default("video"),
  move: z.enum(MOVES).default("pushIn"),
  text: z.string().default(""),
  sub: z.string().default(""),                 // kiçik alt sətir
  badge: z.string().default(""),               // real data rozetkası, məs "7 gündə 2 yağışlı gün"
  reveal: z.enum(REVEALS).default("maskUp"),
  align: z.enum(["top", "center", "bottom"]).default("bottom"),
  transition: z.enum(["slide", "fade", "wipe"]).default("slide"),
  durationInFrames: z.number(),
});
export const showcaseSchema = z.object({
  id: z.string(),
  scenes: z.array(sceneSchema).min(1),
  cta: z.object({ line1: z.string(), line2: z.string().default("Zəng et") }),
  music: z.string().nullable().default(null),
  musicVolume: z.number().default(0.75),
  source: z.string().default(""),              // data mənbəyi (ekranda kiçik kredit)
});
export type ShowcaseProps = z.infer<typeof showcaseSchema>;
type Scene = z.infer<typeof sceneSchema>;

export const showcaseTotal = (scenes: { durationInFrames: number }[]) =>
  scenes.reduce((a, b) => a + b.durationInFrames, 0) + CTA_FRAMES - scenes.length * TRANSITION;

/* ---------------------------------------------------------------- kamera */
const camera = (move: Scene["move"], p: number) => {
  const e = Easing.inOut(Easing.ease);
  switch (move) {
    case "pushIn":  return { s: interpolate(p, [0, 1], [1.02, 1.18], { easing: e }), x: 0, y: 0 };
    case "pullOut": return { s: interpolate(p, [0, 1], [1.22, 1.04], { easing: e }), x: 0, y: 0 };
    case "panLeft": return { s: 1.18, x: interpolate(p, [0, 1], [70, -70], { easing: e }), y: 0 };
    case "panRight":return { s: 1.18, x: interpolate(p, [0, 1], [-70, 70], { easing: e }), y: 0 };
    case "tiltUp":  return { s: 1.18, x: 0, y: interpolate(p, [0, 1], [60, -60], { easing: e }) };
    default:        return { s: 1.06, x: 0, y: 0 };
  }
};

/* ---------------------------------------------------------------- kinetik tipoqrafiya */
const Reveal: React.FC<{ text: string; kind: Scene["reveal"]; size: number; delay?: number }> = ({ text, kind, size, delay = 4 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);

  if (kind === "typeLine") {
    const shown = Math.floor(interpolate(frame - delay, [0, Math.max(10, text.length * 1.2)], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return (
      <div style={{ fontSize: size, fontWeight: 900, lineHeight: 1.06, letterSpacing: -size * 0.035, color: colors.white }}>
        {text.slice(0, shown)}
        <span style={{ opacity: frame % 20 < 10 ? 1 : 0, color: colors.orange }}>▌</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.26, rowGap: 2, fontSize: size, fontWeight: 900, lineHeight: 1.06, letterSpacing: -size * 0.035, color: colors.white }}>
      {words.map((w, i) => {
        const f = frame - delay - i * 3;
        const s = spring({ frame: Math.max(0, f), fps, config: { damping: 15, stiffness: 160, mass: 0.7 } });
        const last = i === words.length - 1;
        if (kind === "maskUp")
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", height: size * 1.12 }}>
              <span style={{ display: "inline-block", transform: `translateY(${interpolate(s, [0, 1], [size * 1.1, 0])}px)`, color: last ? colors.orange : undefined }}>{w}</span>
            </span>
          );
        if (kind === "slideIn")
          return <span key={i} style={{ display: "inline-block", transform: `translateX(${interpolate(s, [0, 1], [-60, 0])}px)`, opacity: s, color: last ? colors.orange : undefined }}>{w}</span>;
        return <span key={i} style={{ display: "inline-block", transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`, opacity: s, color: last ? colors.orange : undefined }}>{w}</span>;
      })}
    </div>
  );
};

/** Real data rozetkası — rəqəm/fakt, narıncı xətt ilə */
const Badge: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 140 } });
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 14, marginBottom: 22, fontFamily: font,
      background: "rgba(20,22,24,0.72)", border: `2px solid ${colors.orange}`, borderRadius: 999,
      padding: "14px 26px", fontSize: 34, fontWeight: 800, color: colors.white,
      transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`, opacity: s,
    }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: colors.orange }} />
      {text}
    </div>
  );
};

/** Brend çərçivəsi — nazik narıncı künc bucaqları */
const Frame: React.FC = () => {
  const c = { position: "absolute" as const, width: 86, height: 86, border: `5px solid ${colors.orange}`, opacity: 0.9 };
  const m = 52;
  return (
    <>
      <div style={{ ...c, left: m, top: m, borderRight: "none", borderBottom: "none", borderTopLeftRadius: 10 }} />
      <div style={{ ...c, right: m, top: m, borderLeft: "none", borderBottom: "none", borderTopRightRadius: 10 }} />
      <div style={{ ...c, left: m, bottom: m, borderRight: "none", borderTop: "none", borderBottomLeftRadius: 10 }} />
      <div style={{ ...c, right: m, bottom: m, borderLeft: "none", borderTop: "none", borderBottomRightRadius: 10 }} />
    </>
  );
};

const SceneView: React.FC<{ s: Scene; source: string }> = ({ s, source }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, s.durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const cam = camera(s.move, p);
  const src = staticFile(s.media);
  const size = s.text.length > 40 ? 72 : s.text.length > 24 ? 84 : 96;
  const pos = s.align === "top" ? { top: safeArea.top + 40 } : s.align === "center" ? { top: H / 2 - 200 } : { bottom: safeArea.bottom + 30 };

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`, transformOrigin: "50% 50%" }}>
        {s.kind === "video" ? (
          <Loop durationInFrames={Math.max(1, s.durationInFrames)}>
            <OffthreadVideo src={src} muted style={{ width: W, height: H, objectFit: "cover" }} />
          </Loop>
        ) : (
          <Img src={src} style={{ width: W, height: H, objectFit: "cover" }} />
        )}
      </AbsoluteFill>
      {/* qradiyent qradasiya — brend tonu */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,22,24,0.78) 0%, rgba(20,22,24,0.18) 26%, rgba(20,22,24,0.05) 45%, rgba(20,22,24,0.72) 82%, rgba(20,22,24,0.92) 100%)" }} />
      <AbsoluteFill style={{ background: `radial-gradient(120% 60% at 50% 110%, ${colors.orange}22 0%, transparent 60%)` }} />
      <Frame />
      <div style={{ position: "absolute", left: safeArea.side, width: W - safeArea.side * 2, ...pos, fontFamily: font, textShadow: "0 6px 28px rgba(0,0,0,0.6)" }}>
        {s.badge && <Badge text={s.badge} />}
        <Reveal text={s.text} kind={s.reveal} size={size} />
        {s.sub && (
          <div style={{ marginTop: 18, fontSize: 38, fontWeight: 600, lineHeight: 1.28, color: "rgba(255,255,255,0.9)", maxWidth: 820 }}>{s.sub}</div>
        )}
      </div>
      {source && (
        <div style={{ position: "absolute", left: safeArea.side, bottom: safeArea.bottom - 46, fontFamily: font, fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{source}</div>
      )}
    </AbsoluteFill>
  );
};

const present = (k: Scene["transition"]): TransitionPresentation<any> =>
  k === "fade" ? fade() : k === "wipe" ? wipe({ direction: "from-right" }) : slide({ direction: "from-bottom" });

export const Showcase: React.FC<ShowcaseProps> = ({ scenes, cta, music, musicVolume, source }) => {
  const total = showcaseTotal(scenes);
  const ctaFrom = total - CTA_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio src={staticFile(music)} loop volume={(f) =>
          interpolate(f, [0, 20, total - 40, total], [0, musicVolume, musicVolume, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      )}
      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          const el = (
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.durationInFrames}>
              <SceneView s={s} source={i === 0 ? source : ""} />
            </TransitionSeries.Sequence>
          );
          if (i === 0) return [el];
          return [<TransitionSeries.Transition key={`t${i}`} presentation={present(scenes[i - 1].transition)} timing={linearTiming({ durationInFrames: TRANSITION })} />, el];
        })}
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
        <TransitionSeries.Sequence durationInFrames={CTA_FRAMES}>
          <CtaScene line1={cta.line1} line2={cta.line2} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Sequence from={Math.max(0, ctaFrom - 26)} durationInFrames={40}>
        <Audio src={staticFile("sfx/riser.wav")} volume={0.45} />
      </Sequence>
      {scenes.slice(1).map((_, i) => {
        const from = scenes.slice(0, i + 1).reduce((a, b) => a + b.durationInFrames, 0) - (i + 1) * TRANSITION;
        return <Sequence key={`w${i}`} from={Math.max(0, from - 3)} durationInFrames={18}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.4} /></Sequence>;
      })}
      <Vignette />
      {ctaFrom > 0 && <Sequence durationInFrames={ctaFrom}><LogoBug /></Sequence>}
    </AbsoluteFill>
  );
};
