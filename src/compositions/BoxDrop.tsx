/**
 * "BoxDrop" — xəritə pini trendi (POV: yüksəklikdən pinə şığıyıb yerə düşmək); adamın yerinə Yük.az qutusu.
 * Fotoları SMM agent verir: real buludlar (yuxarıdan), real Bakı (yaşayış binası mərkəzdə), real boş mənzil,
 * fotoreal qutu — yuxarıdan (düşərkən) və qarşıdan (loqo ön üzdə çap kimi, yalnız mənzildə görünür).
 *   buludların üstü → buludları yarıb keçir → Bakı, pin mənzilin damında → pinə şığıma (zoom blur)
 *   → ağ işıq → qutu mənzilə düşür (squash, toz, silkələnmə) → kamera loqoya yaxınlaşır + yazı → CTA.
 */
import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { z } from "zod";
import { colors, safeArea, canvas } from "../brand/theme";
import { font } from "../brand/fonts";
import { AnimatedTitle } from "../components/AnimatedTitle";
import { CtaScene } from "../components/CtaScene";

const W = canvas.width, H = canvas.height;
export const BOX_CTA = 110;
const CLOUD_END = 80;   // buludların üstündə
const PUNCH_END = 104;  // buludları yarıb keçir
const CITY_END = 158;   // şəhərin üstündə, pin
const DIVE_END = 210;   // pinə şığıma
const LAND = 234;       // qutu döşəməyə dəyir
const END = 370;        // CTA başlayır
export const boxDropTotal = () => END + BOX_CTA;

export const boxDropSchema = z.object({
  dir: z.string().default("render/boxdrop"),
  clouds: z.string().default("clouds.jpg"),
  aerial: z.string().default("aerial.jpg"),
  room: z.string().default("room.jpg"),
  boxTop: z.string().default("box-top.png"),
  boxFront: z.string().default("box-front.png"),
  /** şəkillərin hündürlük/en nisbəti — ölçü və döşəməyə oturma dəqiq olsun */
  topAspect: z.number().default(1),
  frontAspect: z.number().default(0.8),
  pinLabel: z.string().default("Yeni ev"),
  hook: z.string().default("Köç günü"),
  landLine: z.string().default("Yük ünvanına çatdı"),
  cta: z.object({ line1: z.string(), line2: z.string().default("Zəng et") }).default({ line1: "Köçü bizə tapşır", line2: "Zəng et" }),
  music: z.string().nullable().default(null),
});
export type BoxDropProps = z.infer<typeof boxDropSchema>;

// Pin şəhər fotosunun mərkəzindəki yaşayış binasının damına düşür (SMM agent fotonu buna görə seçir)
const PIN = { x: 0.5, y: 0.55 };
// qutunun mənzildə dayanacağı yer (alt kənarı) və eni
const FLOOR = { x: 0.5, y: 0.84, w: 440 };

const ease = (f: number, a: number, b: number, from: number, to: number, e = Easing.inOut(Easing.cubic)) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

const Pin: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame: frame - 4, fps, config: { damping: 9, stiffness: 140 } });
  const bob = Math.sin(frame / 7) * 6;
  return (
    <div style={{ position: "absolute", left: PIN.x * W, top: PIN.y * H, transform: `translate(-50%, -100%) translateY(${(1 - drop) * -220 + bob}px)`, opacity: drop }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: colors.white, color: colors.graphite, fontFamily: font, fontWeight: 900, fontSize: 42, padding: "10px 26px", borderRadius: 18, marginBottom: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.35)", whiteSpace: "nowrap" }}>{label}</div>
        <svg width="100" height="134" viewBox="0 0 24 32">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#EA4335" stroke="#fff" strokeWidth="1.2" />
          <circle cx="12" cy="12" r="4.4" fill="#B31412" />
        </svg>
      </div>
      {/* pinin düşdüyü yerdə dalğa — damı göstərir */}
      <div style={{ position: "absolute", left: "50%", bottom: -18, width: 120 * (1 + (frame % 30) / 30), height: 40 * (1 + (frame % 30) / 30), transform: "translateX(-50%)", borderRadius: "50%", border: "4px solid rgba(234,67,53,0.8)", opacity: 1 - (frame % 30) / 30 }} />
    </div>
  );
};

/** Radial "zoom blur": şəklin böyüdülmüş, şəffaf nüsxələri pinə doğru. */
const ZoomPlate: React.FC<{ src: string; scale: number; blur: number; origin?: { x: number; y: number } }> = ({ src, scale, blur, origin = PIN }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    {(blur > 0.02 ? [1, 1.06, 1.13, 1.21, 1.3] : [1]).map((k, i) => (
      <Img key={i} src={staticFile(src)} style={{
        position: "absolute", inset: 0, width: W, height: H, objectFit: "cover",
        transform: `scale(${scale * (1 + (k - 1) * blur)})`, transformOrigin: `${origin.x * 100}% ${origin.y * 100}%`,
        opacity: i === 0 ? 1 : 0.22 * blur,
      }} />
    ))}
  </AbsoluteFill>
);

const Dust: React.FC<{ at: number; cx: number; cy: number; spread: number }> = ({ at, cx, cy, spread }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 45) return null;
  return (
    <>
      {Array.from({ length: 40 }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const dist = interpolate(t, [0, 45], [0, spread * (0.6 + (i % 5) * 0.12)], { easing: Easing.out(Easing.cubic) });
        const lift = interpolate(t, [0, 45], [0, 60 + (i % 4) * 30], { easing: Easing.out(Easing.quad) });
        const size = 18 + (i % 4) * 10;
        return (
          <div key={i} style={{
            position: "absolute", left: cx + side * dist - size / 2, top: cy - lift * (0.3 + (i % 3) * 0.3) - size / 2,
            width: size, height: size, borderRadius: "50%", background: "rgba(190,180,165,0.45)", filter: "blur(6px)",
            opacity: interpolate(t, [0, 5, 45], [0, 0.7, 0]),
          }} />
        );
      })}
    </>
  );
};

export const BoxDrop: React.FC<BoxDropProps> = ({ dir, clouds, aerial, room, boxTop, boxFront, topAspect, frontAspect, pinLabel, hook, landLine, cta, music }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const topSrc = staticFile(`${dir}/${boxTop}`);
  const frontSrc = staticFile(`${dir}/${boxFront}`);

  // ---- 1. buludların üstü: buludlar yaxınlaşır (biz düşürük) ----
  const cloudScale = ease(frame, 0, CLOUD_END, 1, 1.7, Easing.in(Easing.quad)) * ease(frame, CLOUD_END, PUNCH_END, 1, 4, Easing.in(Easing.cubic));
  const cloudOpacity = ease(frame, CLOUD_END + 6, PUNCH_END, 1, 0);
  // buludun içindən keçəndə ağ duman
  const mist = interpolate(frame, [CLOUD_END - 4, CLOUD_END + 10, PUNCH_END + 4], [0, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ---- 2-3. şəhər: yavaş yaxınlaşma, sonra pinə şığıma ----
  const cityHang = ease(frame, CLOUD_END, CITY_END, 1, 1.3, Easing.linear);
  const dive = ease(frame, CITY_END, DIVE_END, 0, 1, Easing.in(Easing.cubic));
  const cityScale = cityHang * Math.pow(7, dive);
  const cityBlur = ease(frame, CITY_END, CITY_END + 15, 0, 1) + ease(frame, CLOUD_END, PUNCH_END, 0.8, 0) * (frame < PUNCH_END ? 1 : 0);
  const flash = interpolate(frame, [DIVE_END - 6, DIVE_END, DIVE_END + 8], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Havada qutu YUXARIDAN görünür (biz onun üstündəyik): yavaş fırlanır, yırğalanır; şığıyanda pinə doğru kiçilir.
  const airW = ease(frame, 0, CITY_END, 420, 360, Easing.linear) * interpolate(dive, [0, 1], [1, 0.22]);
  const airX = interpolate(dive, [0, 1], [W / 2 + Math.sin(frame / 17) * 40, PIN.x * W]);
  const airY = interpolate(dive, [0, 1], [H * 0.66 + Math.cos(frame / 21) * 20, PIN.y * H - 40]);
  const airRot = frame * 0.9 + Math.sin(frame / 9) * 6;

  // ---- 4. mənzil: qutu QARŞIDAN, yuxarıdan düşür ----
  const fall = ease(frame, DIVE_END, LAND, 0, 1, Easing.in(Easing.quad));
  const impact = spring({ frame: frame - LAND, fps, config: { damping: 8, stiffness: 230, mass: 0.6 } });
  const squash = frame >= LAND ? 1 + (1 - impact) * 0.14 : 1 - fall * 0.04;
  const boxBottom = interpolate(fall, [0, 1], [-160, FLOOR.y * H]);
  const boxRot = interpolate(fall, [0, 1], [-18, 0]);
  const shakeT = frame - LAND;
  const shake = shakeT >= 0 && shakeT < 14 ? Math.sin(shakeT * 2.4) * (14 - shakeT) * 1.8 : 0;
  const push = ease(frame, LAND + 12, END, 1, 1.22);
  const shadow = interpolate(fall, [0, 1], [0.15, 0.55]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.graphite }}>
      {music && <Audio src={staticFile(music)} volume={(f) => interpolate(f, [0, 10, boxDropTotal() - 30, boxDropTotal()], [0, 0.5, 0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />}

      {/* şəhər (buludların altında, onlar çəkiləndə görünür) */}
      {frame >= CLOUD_END - 2 && frame < DIVE_END + 8 && (
        <AbsoluteFill>
          <ZoomPlate src={`${dir}/${aerial}`} scale={cityScale} blur={Math.min(1, cityBlur)} />
          {frame >= PUNCH_END - 4 && (
            <Sequence from={PUNCH_END - 4}>
              <AbsoluteFill style={{ transform: `scale(${Math.pow(3, dive)})`, transformOrigin: `${PIN.x * 100}% ${PIN.y * 100}%`, opacity: 1 - dive * 0.7 }}>
                <Pin label={pinLabel} />
              </AbsoluteFill>
            </Sequence>
          )}
        </AbsoluteFill>
      )}

      {/* buludlar */}
      {frame < PUNCH_END + 2 && (
        <AbsoluteFill style={{ opacity: cloudOpacity }}>
          <ZoomPlate src={`${dir}/${clouds}`} scale={cloudScale} blur={ease(frame, CLOUD_END - 20, CLOUD_END, 0, 0.8)} origin={{ x: 0.5, y: 0.6 }} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 60%, rgba(255,255,255,0.95), rgba(240,244,248,0.85))", opacity: mist, pointerEvents: "none" }} />

      {/* havada düşən qutu — yuxarıdan görünüş */}
      {frame < DIVE_END && (
        <Img src={topSrc} style={{
          position: "absolute", left: airX - airW / 2, top: airY - (airW * topAspect) / 2, width: airW,
          transform: `rotate(${airRot}deg)`, filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.45))",
        }} />
      )}
      {frame < CLOUD_END && (
        <Sequence from={8} durationInFrames={CLOUD_END - 8}>
          <div style={{ position: "absolute", top: safeArea.top + 10, left: 0, width: W, fontFamily: font, textShadow: "0 0 3px #000, 0 4px 18px rgba(0,0,0,0.7)" }}>
            <AnimatedTitle text={hook.toLocaleUpperCase("az-AZ")} size={92} align="center" accent={null} />
          </div>
        </Sequence>
      )}

      {/* mənzil — qutu qarşıdan, loqo görünür */}
      {frame >= DIVE_END && (
        <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px) scale(${push})`, transformOrigin: `${FLOOR.x * 100}% ${FLOOR.y * 100 - 8}%` }}>
          <Img src={staticFile(`${dir}/${room}`)} style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover" }} />
          <div style={{ position: "absolute", left: FLOOR.x * W - FLOOR.w * 0.62, top: FLOOR.y * H - 34, width: FLOOR.w * 1.24, height: 70, borderRadius: "50%", background: "#000", opacity: shadow, filter: "blur(18px)" }} />
          <Img src={frontSrc} style={{
            position: "absolute", left: FLOOR.x * W - FLOOR.w / 2, width: FLOOR.w, top: boxBottom - FLOOR.w * frontAspect,
            transform: `rotate(${boxRot}deg) scale(${squash}, ${2 - squash})`, transformOrigin: "50% 100%",
            filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.35))",
          }} />
          <Dust at={LAND} cx={FLOOR.x * W} cy={FLOOR.y * H} spread={300} />
        </AbsoluteFill>
      )}
      <Sequence from={LAND + 18} durationInFrames={END - LAND - 18}>
        <div style={{ position: "absolute", top: safeArea.top + 20, left: 0, width: W, fontFamily: font, textShadow: "0 0 3px #000, 0 4px 18px rgba(0,0,0,0.75)" }}>
          <AnimatedTitle text={landLine.toLocaleUpperCase("az-AZ")} size={86} align="center" accent={-1} />
        </div>
      </Sequence>
      <AbsoluteFill style={{ background: "#fff", opacity: flash, pointerEvents: "none" }} />

      <Sequence from={END}>
        <AbsoluteFill style={{ opacity: interpolate(frame, [END, END + 10], [0, 1], { extrapolateRight: "clamp" }) }}>
          <CtaScene line1={cta.line1} line2={cta.line2} />
        </AbsoluteFill>
      </Sequence>

      {/* səslər: külək → buluddan keçid → şığıma → gup */}
      <Sequence from={0} durationInFrames={60}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.3} /></Sequence>
      <Sequence from={CLOUD_END - 6} durationInFrames={40}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.55} /></Sequence>
      <Sequence from={CITY_END - 10} durationInFrames={70}><Audio src={staticFile("sfx/riser.wav")} volume={0.55} /></Sequence>
      <Sequence from={LAND} durationInFrames={30}><Audio src={staticFile("sfx/pop.wav")} volume={0.8} /></Sequence>
      <Sequence from={LAND} durationInFrames={30}><Audio src={staticFile("sfx/step.wav")} volume={0.9} /></Sequence>
      <Sequence from={LAND + 18} durationInFrames={30}><Audio src={staticFile("sfx/tick.wav")} volume={0.4} /></Sequence>
    </AbsoluteFill>
  );
};
