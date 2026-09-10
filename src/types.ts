import { z } from "zod";

export const wordSchema = z.object({
  w: z.string(),
  start: z.number(),
  dur: z.number(),
});

export const mediaSchema = z.object({
  kind: z.enum(["video", "image"]),
  src: z.string(),
  /** video mənbəyinin uzunluğu (saniyə) — səhnədən qısadırsa təkrarlanır */
  duration: z.number().nullable().default(null),
});

export const sceneSchema = z.object({
  kind: z.enum(["hook", "item", "cta"]),
  /** səsləndirilən mətn (ekranda görünən mətndən fərqli ola bilər) */
  spoken: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  index: z.number().optional(),
  audio: z.string().nullable(),
  words: z.array(wordSchema),
  durationInFrames: z.number(),
  media: mediaSchema.nullable(),
});

export const reelSchema = z.object({
  id: z.string(),
  hook: z.string(),
  total: z.number(),
  cta: z.object({ line1: z.string(), line2: z.string() }),
  music: z.string().nullable(),
  musicVolume: z.number().default(0.12),
  scenes: z.array(sceneSchema),
});

export type Reel = z.infer<typeof reelSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Word = z.infer<typeof wordSchema>;
