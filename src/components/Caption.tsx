import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, safeArea, type, radius, spacing } from "../brand/theme";
import { font } from "../brand/fonts";

export type Word = { w: string; start: number; dur: number };

/** Sözləri qısa sətirlərə yığır — telefonda 2 sətirdən çox oxunmur */
const buildLines = (words: Word[], maxChars = 28, maxWords = 5) => {
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
 * Söz-səviyyəsində sinxron altyazı.
 * Bir tam sətir tünd lövhədə, aktiv söz narıncı və bir az böyük — səpələnmiş
 * qutular yox, bir bütöv blok. Vaxtlar TTS/Whisper-dən gəlir.
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

  // sətir dəyişəndə yumşaq giriş
  const lineStart = active[0].start - 0.08;
  // Eyni anda YALNIZ bir söz aktiv olsun: başlanğıcı keçilmiş sonuncu söz.
  // Əks halda qonşu sözlər birlikdə böyüyüb bir-birinə toxunur.
  let onIdx = -1;
  active.forEach((w, i) => { if (t >= w.start - 0.04) onIdx = i; });
  const enter = interpolate(t, [lineStart, lineStart + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        left: safeArea.side,
        right: safeArea.side,
        bottom: safeArea.bottom,
        display: "flex",
        justifyContent: "center",
        fontFamily: font,
      }}
    >
      <div
        style={{
          background: "rgba(20,22,24,0.78)",
          borderRadius: radius.lg,
          padding: `${spacing.sm - 4}px ${spacing.md}px`,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: 26,
          rowGap: 4,
          maxWidth: "100%",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          backdropFilter: "blur(6px)",
          transform: `translateY(${(1 - enter) * 14}px)`,
          opacity: enter,
        }}
      >
        {active.map((word, i) => {
          const isOn = i === onIdx;
          const past = i < onIdx;
          return (
            <span
              key={`${word.start}-${i}`}
              style={{
                fontSize: type.caption,
                fontWeight: 800,
                lineHeight: 1.22,
                color: isOn ? colors.orange : past ? colors.white : "rgba(255,255,255,0.72)",
                transform: isOn ? "scale(1.05)" : "scale(1)",
                display: "inline-block",
                textShadow: isOn ? "0 0 24px rgba(255,102,0,0.55)" : "none",
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
