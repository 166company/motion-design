import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, safeArea, type, radius, spacing } from "../brand/theme";
import { font } from "../brand/fonts";

export type Word = { w: string; start: number; dur: number };

/** Sözləri qısa sətirlərə yığır — telefonda 2 sətirdən çox oxunmur */
const buildLines = (words: Word[], maxChars = 24, maxWords = 4) => {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let len = 0;
  for (const word of words) {
    const next = len + word.w.length + (cur.length ? 1 : 0);
    if (cur.length && (next > maxChars || cur.length >= maxWords)) {
      lines.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(word);
    len += word.w.length + 1;
  }
  if (cur.length) lines.push(cur);
  return lines;
};

/**
 * "Karaoke pop" altyazı: sətrin sözləri deyildikcə görünür; aktiv söz narıncı
 * pill-in içində spring ilə sıçrayır; deyilmiş sözlər ağ qalır.
 * Vaxtlar TTS/Whisper-dən gəlir. Blok sağ ikon sütununa dəyməyəcək qədər dardır.
 */
export const Caption: React.FC<{ words: Word[]; offset?: number }> = ({ words, offset = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + offset;

  const lines = buildLines(words);
  const idx = lines.findIndex((l) => {
    const s = l[0].start;
    const e = l[l.length - 1].start + l[l.length - 1].dur;
    return t >= s - 0.08 && t <= e + 0.25;
  });
  if (idx < 0) return null;
  const active = lines[idx];

  let onIdx = -1;
  active.forEach((w, i) => { if (t >= w.start - 0.04) onIdx = i; });

  const lineStart = active[0].start - 0.08;
  const enter = interpolate(t, [lineStart, lineStart + 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: safeArea.bottom,
        display: "flex",
        justifyContent: "center",
        fontFamily: font,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: safeArea.captionMaxWidth,
          background: "rgba(16,18,20,0.72)",
          borderRadius: radius.lg,
          padding: `${spacing.sm - 2}px ${spacing.md - 6}px`,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          columnGap: 10,
          rowGap: 8,
          boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          transform: `translateY(${(1 - enter) * 18}px) scale(${0.96 + enter * 0.04})`,
          opacity: enter,
        }}
      >
        {active.map((word, i) => {
          const isOn = i === onIdx;
          const said = i <= onIdx;
          // aktiv sözün sıçrayışı — söz başlayan andan spring
          const sinceStart = Math.max(0, (t - (word.start - 0.04)) * fps);
          const pop = spring({ frame: sinceStart, fps, config: { damping: 9, stiffness: 240, mass: 0.5 } });
          const scale = isOn ? 1 + 0.12 * (1 - Math.abs(pop - 1)) + 0.04 : 1;
          return (
            <span
              key={`${word.start}-${i}`}
              style={{
                display: "inline-block",
                fontSize: type.caption,
                fontWeight: 800,
                lineHeight: 1.15,
                padding: "4px 12px",
                borderRadius: 16,
                color: isOn ? colors.graphite : said ? colors.white : "rgba(255,255,255,0.45)",
                background: isOn ? colors.orange : "transparent",
                transform: `scale(${scale}) translateY(${isOn ? -2 : 0}px)`,
                boxShadow: isOn ? "0 8px 24px rgba(255,102,0,0.45)" : "none",
                opacity: said ? 1 : 0.55,
              }}
            >
              {word.w}
            </span>
          );
        })}
      </div>
    </div>
  );
};
