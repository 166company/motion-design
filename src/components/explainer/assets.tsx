/**
 * Kodla çəkilmiş assetlər — stok yoxdur, hər şey brend rəngləri ilə sıfırdan.
 * Kub loqo (logo-icon.svg) birbaşa "qutu" kimi işlədilir.
 */
import { Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors } from "../../brand/theme";

/* ------------------------------------------------------------------ Qutu (kub loqo) */
export const Box: React.FC<{ size: number; x: number; y: number; delay?: number; from?: number }> = ({
  size, x, y, delay = 0, from = -400,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 9, stiffness: 140, mass: 0.9 } });
  const squash = interpolate(s, [0.85, 1], [1.12, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Img
      src={staticFile("logo/logo-icon.svg")}
      style={{
        position: "absolute",
        left: x, top: y + interpolate(s, [0, 1], [from, 0]),
        width: size, height: size,
        transform: `scaleX(${squash}) scaleY(${2 - squash}) rotate(${interpolate(s, [0, 1], [-25, 0])}deg)`,
        transformOrigin: "bottom center",
        opacity: frame >= delay ? 1 : 0,
        filter: "drop-shadow(0 16px 24px rgba(0,0,0,0.45))",
      }}
    />
  );
};

/* ------------------------------------------------------------------ Yük maşını */
export const Truck: React.FC<{ x: number; y: number; scale?: number; boxes?: number; moving?: boolean }> = ({
  x, y, scale = 1, boxes = 0, moving = true,
}) => {
  const frame = useCurrentFrame();
  const bounce = moving ? Math.sin(frame / 2.2) * 3 : 0;
  const wheel = moving ? frame * 14 : 0;
  const W = 560, H = 230;

  const Wheel: React.FC<{ cx: number }> = ({ cx }) => (
    <g transform={`translate(${cx}, ${H - 18}) rotate(${wheel})`}>
      <circle r={44} fill="#141618" />
      <circle r={30} fill="#2F3438" />
      <circle r={9} fill={colors.orange} />
      <rect x={-3} y={-30} width={6} height={60} fill="#3C4247" />
      <rect x={-30} y={-3} width={60} height={6} fill="#3C4247" />
    </g>
  );

  return (
    <div style={{ position: "absolute", left: x, top: y + bounce, transform: `scale(${scale})`, transformOrigin: "bottom left" }}>
      <svg width={W} height={H + 30} viewBox={`0 0 ${W} ${H + 30}`}>
        {/* kölgə */}
        <ellipse cx={W / 2} cy={H + 16} rx={W / 2.1} ry={12} fill="rgba(0,0,0,0.35)" />
        {/* yük bölməsi */}
        <rect x={0} y={20} width={380} height={H - 60} rx={18} fill="#2A2E32" stroke="#FFFFFF" strokeWidth={6} />
        <rect x={20} y={40} width={340} height={12} rx={6} fill="rgba(255,255,255,0.08)" />
        {/* kabin */}
        <path d={`M380 ${H - 40} V60 q0-22 22-22 h96 q22 0 40 18 l40 46 q8 10 8 26 v42 z`} fill={colors.orange} stroke="#FFFFFF" strokeWidth={6} strokeLinejoin="round" />
        <path d={`M410 74 h70 q16 0 26 12 l30 36 H410 z`} fill="#F5F5F3" opacity={0.9} />
        <rect x={392} y={150} width={22} height={40} rx={6} fill="#1E2124" opacity={0.5} />
        {/* far */}
        <rect x={568} y={150} width={14} height={30} rx={5} fill="#FFE08A" />
        {/* şassi */}
        <rect x={-6} y={H - 40} width={W - 10} height={22} rx={6} fill="#1E2124" />
        <Wheel cx={80} />
        <Wheel cx={200} />
        <Wheel cx={470} />
        {/* loqo yazısı */}
        <text x={190} y={132} textAnchor="middle" fontFamily="Inter, Arial" fontWeight={900} fontSize={54} fill="#FFFFFF" letterSpacing={-2}>
          yuk<tspan fill={colors.orange}>.az</tspan>
        </text>
      </svg>
      {/* yük bölməsindəki qutular */}
      {Array.from({ length: boxes }).map((_, i) => (
        <Img
          key={i}
          src={staticFile("logo/logo-icon.svg")}
          style={{ position: "absolute", left: 30 + i * 62, top: 96, width: 56, height: 56 }}
        />
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ Yol + şəhər + buludlar */
export const Road: React.FC<{ y: number; speed?: number }> = ({ y, speed = 18 }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const off = (frame * speed) % 120;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, height: 180 }}>
      <div style={{ position: "absolute", inset: 0, background: "#15181B" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 10, background: "#3A4045" }} />
      {Array.from({ length: Math.ceil(width / 120) + 2 }).map((_, i) => (
        <div
          key={i}
          style={{ position: "absolute", top: 82, left: i * 120 - off, width: 64, height: 12, borderRadius: 6, background: colors.orange, opacity: 0.85 }}
        />
      ))}
    </div>
  );
};

export const Skyline: React.FC<{ y: number; speed?: number }> = ({ y, speed = 4 }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const heights = [140, 220, 90, 260, 170, 120, 300, 200, 110, 240, 160, 280, 130];
  const total = heights.length * 110;
  const off = (frame * speed) % total;
  return (
    <div style={{ position: "absolute", left: 0, top: y, width, height: 320, overflow: "hidden" }}>
      {[0, 1].map((rep) =>
        heights.map((h, i) => (
          <div
            key={`${rep}-${i}`}
            style={{
              position: "absolute", bottom: 0, left: rep * total + i * 110 - off,
              width: 84, height: h, background: "#23272B", borderRadius: "6px 6px 0 0",
            }}
          >
            {Array.from({ length: Math.floor(h / 40) }).map((_, w) => (
              <div key={w} style={{ position: "absolute", left: 14, top: 14 + w * 40, width: 56, height: 14, background: (i + w) % 3 ? "rgba(255,224,138,0.35)" : "rgba(255,255,255,0.06)", borderRadius: 3 }} />
            ))}
          </div>
        ))
      )}
    </div>
  );
};

export const Clouds: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const clouds = [{ y: 260, s: 1.2, v: 0.9 }, { y: 420, s: 0.8, v: 1.4 }, { y: 340, s: 1, v: 0.6 }];
  return (
    <>
      {clouds.map((c, i) => {
        const x = ((i * 500 - frame * c.v) % (width + 400) + width + 400) % (width + 400) - 200;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: c.y, transform: `scale(${c.s})`, opacity: 0.12 }}>
            <div style={{ width: 180, height: 60, background: "#fff", borderRadius: 40 }} />
            <div style={{ position: "absolute", left: 40, top: -30, width: 90, height: 90, background: "#fff", borderRadius: "50%" }} />
            <div style={{ position: "absolute", left: 100, top: -16, width: 70, height: 70, background: "#fff", borderRadius: "50%" }} />
          </div>
        );
      })}
    </>
  );
};

/* ------------------------------------------------------------------ Telefon + dalğalar */
export const RingingPhone: React.FC<{ size?: number }> = ({ size = 320 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 10, stiffness: 150 } });
  const shake = frame > 12 && frame % 40 < 18 ? Math.sin(frame * 1.6) * 9 : 0;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map((i) => {
        const p = ((frame - 10 + i * 14) % 42) / 42;
        return (
          <div
            key={i}
            style={{
              position: "absolute", width: size, height: size, borderRadius: "50%",
              border: `6px solid ${colors.orange}`,
              transform: `scale(${1 + p * 0.9})`, opacity: (1 - p) * 0.6 * enter,
            }}
          />
        );
      })}
      <div
        style={{
          width: size * 0.62, height: size * 0.62, borderRadius: "50%", background: colors.orange,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: `scale(${enter}) rotate(${shake}deg)`,
          boxShadow: "0 30px 60px rgba(255,102,0,0.45)",
        }}
      >
        <svg width={size * 0.3} height={size * 0.3} viewBox="0 0 24 24" fill="none" stroke={colors.graphite} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ Çat baloncuğu */
export const Bubble: React.FC<{ text: string; side: "left" | "right"; delay: number; check?: boolean }> = ({ text, side, delay, check }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 12, stiffness: 170 } });
  const isOp = side === "left";
  return (
    <div
      style={{
        alignSelf: isOp ? "flex-start" : "flex-end",
        maxWidth: "82%",
        background: isOp ? "#2E3338" : colors.orange,
        color: isOp ? colors.white : colors.graphite,
        fontSize: 46, fontWeight: 700, lineHeight: 1.25,
        padding: "22px 30px",
        borderRadius: isOp ? "28px 28px 28px 8px" : "28px 28px 8px 28px",
        transform: `scale(${s}) translateY(${(1 - s) * 30}px)`,
        transformOrigin: isOp ? "bottom left" : "bottom right",
        opacity: frame >= delay ? 1 : 0,
        display: "flex", alignItems: "center", gap: 16,
        boxShadow: "0 14px 30px rgba(0,0,0,0.35)",
      }}
    >
      {check && (
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#4CD97B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
      )}
      {text}
    </div>
  );
};

/* ------------------------------------------------------------------ Marşrut xəritəsi */
export const RouteMap: React.FC<{ from: string; to: string; progress: number }> = ({ from, to, progress }) => {
  // kvadratik bezier: A → B, ortada yuxarı qövs
  const A = { x: 120, y: 520 }, B = { x: 900, y: 180 }, C = { x: 420, y: 120 };
  const pt = (t: number) => ({
    x: (1 - t) ** 2 * A.x + 2 * (1 - t) * t * C.x + t ** 2 * B.x,
    y: (1 - t) ** 2 * A.y + 2 * (1 - t) * t * C.y + t ** 2 * B.y,
  });
  const p = pt(Math.min(1, progress));
  const d = `M${A.x} ${A.y} Q${C.x} ${C.y} ${B.x} ${B.y}`;
  const len = 1000; // dash üçün kifayət qədər böyük
  const frame = useCurrentFrame();

  return (
    <svg width={1020} height={640} viewBox="0 0 1020 640" style={{ overflow: "visible" }}>
      {/* xəritə toru */}
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 80} x2={1020} y2={i * 80} stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
      ))}
      {Array.from({ length: 14 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 80} y1={0} x2={i * 80} y2={640} stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
      ))}
      {/* "quru" ləkələri */}
      <path d="M40 600 q120-220 320-180 t300-140 t320-60 v420 z" fill="rgba(255,255,255,0.035)" />
      {/* marşrut — kölgə + xətt */}
      <path d={d} stroke="rgba(0,0,0,0.4)" strokeWidth={22} fill="none" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
      <path d={d} stroke={colors.orange} strokeWidth={12} fill="none" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
      {/* şəhər nöqtələri */}
      {[{ P: A, label: from }, { P: B, label: to }].map(({ P, label }, i) => (
        <g key={i} transform={`translate(${P.x}, ${P.y})`}>
          <circle r={26 + Math.sin(frame / 6 + i) * 3} fill="rgba(255,102,0,0.25)" />
          <circle r={14} fill={colors.white} stroke={colors.orange} strokeWidth={6} />
          <text y={i === 0 ? 62 : -36} textAnchor="middle" fontFamily="Inter, Arial" fontWeight={900} fontSize={40} fill={colors.white}>{label}</text>
        </g>
      ))}
      {/* hərəkət edən nöqtə (maşın) */}
      <g transform={`translate(${p.x}, ${p.y})`}>
        <circle r={30} fill={colors.orange} stroke={colors.white} strokeWidth={6} />
        <text y={9} textAnchor="middle" fontSize={28}>🚚</text>
      </g>
    </svg>
  );
};
