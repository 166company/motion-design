"""
Rəqəmləri azərbaycan sözlərinə çevirir — TTS ingiliscə "three" deməsin.

  "3 otaq"        → "üç otaq"
  "4-cü mərtəbə"  → "dördüncü mərtəbə"
  "050 209 62 99" → "sıfır əlli, iki yüz doqquz, altmış iki, doxsan doqquz"
  "25%"           → "iyirmi beş faiz"
  "120 m²"        → "yüz iyirmi kvadrat metr"
"""
import re

ONES = ["sıfır", "bir", "iki", "üç", "dörd", "beş", "altı", "yeddi", "səkkiz", "doqquz"]
TENS = ["", "on", "iyirmi", "otuz", "qırx", "əlli", "altmış", "yetmiş", "səksən", "doxsan"]

BACK_VOWELS = "aıou"
FRONT_VOWELS = "eəiöü"


def cardinal(n: int) -> str:
    if n < 10:
        return ONES[n]
    if n < 100:
        t, o = divmod(n, 10)
        return TENS[t] + (" " + ONES[o] if o else "")
    if n < 1000:
        h, r = divmod(n, 100)
        head = ("yüz" if h == 1 else ONES[h] + " yüz")
        return head + (" " + cardinal(r) if r else "")
    if n < 1_000_000:
        k, r = divmod(n, 1000)
        head = ("min" if k == 1 else cardinal(k) + " min")
        return head + (" " + cardinal(r) if r else "")
    m, r = divmod(n, 1_000_000)
    return cardinal(m) + " milyon" + (" " + cardinal(r) if r else "")


def ordinal(n: int) -> str:
    """Sait ahəngi ilə sıra sayı: bir→birinci, üç→üçüncü, altı→altıncı, on→onuncu"""
    w = cardinal(n)
    last_vowel = next((ch for ch in reversed(w) if ch in BACK_VOWELS + FRONT_VOWELS), "i")
    if last_vowel in "aı":
        suf = "ncı" if w[-1] in "aı" else "ıncı"
    elif last_vowel in "eəi":
        suf = "nci" if w[-1] in "eəi" else "inci"
    elif last_vowel in "ou":
        suf = "ncu" if w[-1] in "ou" else "uncu"
    else:
        suf = "ncü" if w[-1] in "öü" else "üncü"
    return w + suf


def phone_words(s: str) -> str:
    """Telefon: hər qrup ayrıca oxunur, 0 ilə başlayan qrupda 'sıfır' deyilir"""
    groups = re.findall(r"\d+", s)
    out = []
    for g in groups:
        if g.startswith("0") and len(g) > 1:
            out.append("sıfır " + cardinal(int(g[1:])))
        else:
            out.append(cardinal(int(g)))
    return ", ".join(out)


UNITS = [
    (r"m²|m2|kv\.?\s*m", "kvadrat metr"),
    (r"km", "kilometr"),
    (r"kq|kg", "kiloqram"),
    (r"%", "faiz"),
    (r"₼|AZN", "manat"),
]


def normalize(text: str) -> str:
    # telefon nömrəsi: 3+ rəqəm qrupu, boşluq/defis ilə
    text = re.sub(r"\b0\d{2}[ \-]\d{3}[ \-]\d{2}[ \-]\d{2}\b", lambda m: phone_words(m.group()), text)
    # sıra sayları: 4-cü, 3-cü, 1-ci, 10-cu, 5-ci
    text = re.sub(r"\b(\d+)\s*-\s*(cı|ci|cu|cü|ncı|nci|ncu|ncü|ıncı|inci|uncu|üncü)\b",
                  lambda m: ordinal(int(m.group(1))), text)
    # vahidlər
    for pat, word in UNITS:
        text = re.sub(r"(\d)\s*(" + pat + r")", lambda m, w=word: m.group(1) + " " + w, text)
    # qalan bütöv ədədlər (minlik ayırıcı ilə də: 1.500 / 1 500)
    text = re.sub(r"\b\d{1,3}(?:[ .]\d{3})+\b", lambda m: cardinal(int(re.sub(r"[ .]", "", m.group()))), text)
    text = re.sub(r"\b\d+\b", lambda m: cardinal(int(m.group())), text)
    return text


if __name__ == "__main__":
    for t in ["3 otaq, 4-cü mərtəbə", "050 209 62 99", "25% endirim", "120 m² ev", "1-ci addım, 2-ci addım, 10-cu mərtəbə", "1.500 kq yük"]:
        print(f"{t:36} → {normalize(t)}")
