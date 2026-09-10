import { loadFont } from "@remotion/google-fonts/Inter";

/**
 * latin-ext subset MÜTLƏQdir — azərbaycan hərfləri (ə ğ ı ş)
 * Unicode U+0100–U+02AF aralığındadır və yalnız bu subset-də var.
 */
const { fontFamily } = loadFont("normal", {
  subsets: ["latin", "latin-ext"],
  weights: ["400", "600", "700", "800", "900"],
});

export const font = fontFamily;
