/**
 * Foto istehsalı açarı. Fotoları SMM agent (yukaz-smm-agent) hazırlayır; bu agent yalnız hərəkət verir.
 * Kod silinməyib — `PHOTOS=on` (repo Variables və ya .env) yazanda poster/karusel/illüstrasiya yenidən işləyir.
 * Stok video (Pexels), kodla çəkilmiş Explainer və şəkil → video (nvImageToVideo) bu açardan asılı deyil.
 */
export const photosEnabled = () => (process.env.PHOTOS ?? "off").trim().toLowerCase() === "on";

export const assertPhotos = (what: string) => {
  if (photosEnabled()) return;
  throw new Error(
    `⏸ ${what}: foto istehsalı söndürülüb (PHOTOS=off). Fotoları SMM agent hazırlayır — ` +
      `bu agent yalnız motion edir. Açmaq üçün repo Variables → PHOTOS=on.`
  );
};
