import { useCurrentFrame, useVideoConfig } from "remotion";
import { colors, safeArea, type, radius, spacing } from "../brand/theme";
import { font } from "../brand/fonts";

export type Word = { w: string; start: number; dur: number };

/** Sözləri qısa sətirlərə yığır — telefonda 2 sətirdən çox oxunmur */
const buildLines = (words: Word[], maxChars = 30, maxWords = 4) => {
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
 * Söz-səviyyəsində sinxron altyazı (karaoke).
 * Vaxtlar birbaşa TTS-in WordBoundary hadisələrindən gəlir — təxmin yoxdur.
 */
export const Caption: React.FC<{ words: Word[]; offset?: number }> = ({ words, offset = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + offset;

  const lines = buildLines(words);
  const active =
    lines.find((l) => {
      const s = l[0].start;
      const e = l[l.length - 1].start + l[l.length - 1].dur;
      return t >= s - 0.08 && t <= e + 0.22;
    }) ?? null;

  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: safeArea.side,
        right: safeArea.side,
        bottom: safeArea.bottom,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: spacing.xs,
        fontFamily: font,
      }}
    >
      {active.map((word, i) => {
        const isOn = t >= word.start - 0.04 && t <= word.start + word.dur + 0.06;
        return (
          <span
            key={`${word.start}-${i}`}
            style={{
              fontSize: type.caption,
              fontWeight: 800,
              lineHeight: 1.18,
              color: isOn ? colors.graphite : colors.white,
              backgroundColor: isOn ? colors.orange : "rgba(30,33,36,0.62)",
              padding: `6px ${spacing.xs + 6}px`,
              borderRadius: radius.md,
              transform: isOn ? "translateY(-4px) scale(1.06)" : "none",
              boxShadow: isOn ? "0 10px 26px rgba(255,102,0,0.35)" : "0 4px 14px rgba(0,0,0,0.35)",
              transition: "none",
            }}
          >
            {word.w}
          </span>
        );
      })}
    </div>
  );
};
