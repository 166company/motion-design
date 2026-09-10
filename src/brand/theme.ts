/**
 * Yuk.az brend sistemi — bütün vizual qərarlar burada.
 * Rəng/şrift dəyişəndə yalnız bu fayl redaktə olunur.
 */

export const colors = {
  orange: "#FF6600",
  graphite: "#1E2124",
  white: "#FFFFFF",
  neutral: "#F5F5F3",
  // törəmələr
  graphiteSoft: "#2A2E32",
  overlay: "rgba(30, 33, 36, 0.72)",
  overlayStrong: "rgba(30, 33, 36, 0.88)",
} as const;

/** Instagram Reels kətanı */
export const canvas = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/**
 * Instagram UI-nin örtdüyü sahələr.
 * Heç bir mətn bu zonalara girməməlidir — QA bunu yoxlayır.
 */
export const safeArea = {
  top: 220,     // profil adı, "Reels" başlığı
  bottom: 380,  // caption, səs adı, düymələr
  side: 80,     // sağ tərəfdəki like/share sütunu üçün də ehtiyat
} as const;

export const type = {
  hook: 104,     // açılış başlığı
  title: 78,     // səhnə başlığı
  body: 52,      // izahat
  caption: 62,   // altyazı
  badge: 96,     // nömrə
  cta: 66,
} as const;

export const spacing = { xs: 12, sm: 24, md: 40, lg: 64, xl: 96 } as const;

export const radius = { md: 28, lg: 44, pill: 999 } as const;

/** Bütün animasiyalar üçün vahid ritm */
export const motion = {
  springConfig: { damping: 200, stiffness: 120, mass: 0.6 },
  sceneCross: 8,   // səhnələr arası keçid kadrı
  enterStagger: 4, // elementlərin ardıcıl görünmə fərqi
} as const;
