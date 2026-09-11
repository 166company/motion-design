/** Əlaqə məlumatı — bir yerdə. Caption və CTA buradan oxuyur. */
export const contact = {
  phone: "050 209 62 99",
  phoneTel: "+994502096299",
  site: "yuk.az",
} as const;

/** Səsləndirmə səsləri — hər video üçün ID hash-inə görə seçilir */
export const voices = ["marin", "coral", "cedar", "ash"] as const;

/**
 * Sabit hash → səs. `id % 4` işləmir: WordPress ID-ləri çox vaxt 4-ün mislidir
 * (10764, 10736…) və hamısı eyni səsə düşür. Sətir hash-i bunu qarışdırır.
 */
export const pickVoice = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return voices[h % voices.length];
};
