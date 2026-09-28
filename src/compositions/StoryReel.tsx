/**
 * "StoryReel" — əsl hərəkətli hekayə: SMM agentin postundan başlayan, şəkildən-videoya (Wan 2.2)
 * kliplər ardıcıl yığılır. Zəncir kliplər (əvvəlkinin son kadrından davam edən) kəsiksiz birləşir —
 * bir fasiləsiz səhnə kimi; ayrı fotolardan gələnlər yumşaq keçidlə. Yazı brend şrifti ilə üstdə,
 * punchline aşağıda zərbə ilə, sonda CTA.
 */
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import { colors, safeArea, canvas } from "../brand/theme";
import { font } from "../brand/fonts";
import { AnimatedTitle } from "../components/AnimatedTitle";
import { CtaScene } from "../components/CtaScene";

const W = canvas.width, H = canvas.height;
export const STORY_CTA = 110;
const FADE = 8;

const clipSchema = z.object({
  src: z.string(),
  aspect: z.number().default(0.8),
  frames: z.number(),
  text: z.string().default(""),
  punch: z.boolean().default(false),
  /** true — əvvəlki klipin son kadrından davam edir: kəsiksiz birləşir */
  continues: z.boolean().default(false),
});
export const storyReelSchema = z.object({
  clips: z.array(clipSchema).min(1),
  cta: z.object({ line1: z.string(), line2: z.string().default("Zəng et") }),
  music: z.string().nullable().default(null),
  musicVolume: z.number().default(0.5),
});
export type StoryReelProps = z.infer<typeof storyReelSchema>;
type Clip = z.infer<typeof clipSchema>;

export const storyReelTotal = (p: Pick<StoryReelProps, "clips">) => p.clips.reduce((a, c) => a + c.frames, 0) + STORY_CTA;

// Kart yazı zolağının altında durur — yazı heç vaxt şəklin (və qutudakı loqonun) üstünə düşmür.
const TEXT_TOP = safeArea.top + 20;
const CARD_TOP = safeArea.top + 230;
const card = (aspect: number) => {
  const maxH = H - CARD_TOP - 150;
  let w = W - 60, h = w / aspect;
  if (h > maxH) { h = maxH; w = h * aspect; }
  return { w, h, left: (W - w) / 2, top: CARD_TOP };
};

const ClipView: React.FC<{ c: Clip }> = ({ c }) => {
  const frame = useCurrentFrame();
  const b = card(c.aspect);
  const fadeIn = c.continues ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite, opacity: fadeIn }}>
      {/* bulanıq fon — eyni klip, kart kəsilmir */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(c.src)} muted style={{ position: "absolute", inset: -80, width: W + 160, height: H + 160, objectFit: "cover", filter: "blur(36px) brightness(0.5)" }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: b.left, top: b.top, width: b.w, height: b.h, overflow: "hidden", borderRadius: b.w < W ? 24 : 0, boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }}>
        <OffthreadVideo src={staticFile(c.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      {c.text && (
        <>
          <Sequence from={c.punch ? 10 : 6}>
            <div style={{
              position: "absolute", left: safeArea.side - 60, width: W - (safeArea.side - 60) * 2,
              top: TEXT_TOP, height: CARD_TOP - TEXT_TOP - 20, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: font, textShadow: "0 0 3px #000, 0 0 3px #000, 0 4px 18px rgba(0,0,0,0.85)",
            }}>
              <AnimatedTitle text={c.text.toLocaleUpperCase("az-AZ")} size={c.text.length > 30 ? 66 : c.text.length > 18 ? 76 : 88} weight={900} align="center" accent={c.punch ? -1 : null} stagger={c.punch ? 2 : 3} lineHeight={1.08} />
            </div>
          </Sequence>
        </>
      )}
      {c.punch && (
        <Sequence from={10} durationInFrames={30}><Audio src={staticFile("sfx/pop.wav")} volume={0.55} /></Sequence>
      )}
    </AbsoluteFill>
  );
};

/** CTA öz kadr sayğacı ilə yavaşca görünür (Sequence daxilində). */
const CtaIn: React.FC<{ line1: string; line2: string }> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }) }}>
      <CtaScene line1={line1} line2={line2} />
    </AbsoluteFill>
  );
};

export const StoryReel: React.FC<StoryReelProps> = ({ clips, cta, music, musicVolume }) => {
  const total = storyReelTotal({ clips });
  const ctaFrom = total - STORY_CTA;
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && (
        <Audio src={staticFile(music)} loop volume={(f) => interpolate(f, [0, 10, total - 40, total], [0, musicVolume, musicVolume, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      )}
      {clips.map((c, i) => {
        const from = at;
        at += c.frames;
        return (
          <Sequence key={i} from={from} durationInFrames={c.frames}>
            <ClipView c={c} />
          </Sequence>
        );
      })}
      <Sequence from={ctaFrom}>
        <CtaIn line1={cta.line1} line2={cta.line2} />
      </Sequence>
      <Sequence from={Math.max(0, ctaFrom - 25)} durationInFrames={40}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.4} />
      </Sequence>
    </AbsoluteFill>
  );
};
