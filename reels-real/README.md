# Yük.az gündəlik Reels (real kadrlar)

Hər gün 00:01 (Bakı) Claude-un planlı tapşırığı:

1. `day.json` yazır: ekran mətnləri, cover başlığı, caption (nümunə formatında).
2. `python3 daily.py day.json` — real stok kadrlardan (Pexels, pulsuz lisenziya) video, cover və caption hazırlayır.
3. Nəticəni `reels-drop` branch-inə `YYYY-MM-DD/` qovluğu kimi qoyur (hər gün yenidən yazılır).
4. Google Apps Script (`apps_script/Code.gs`, 156evakuasiyayt@gmail.com) hər saat həmin qovluğu Drive-da
   `Yük.az Reels/YYYY-MM-DD/` qovluğuna köçürür.

Kompüter açıq olmasa da işləyir. Bu branch (`yukaz-reels-real`) əsas `main` sisteminə toxunmur.

- `clips/` — Pexels kadrları (Pexels License, ticari istifadə pulsuz)
- `assets/music/` — Mixkit trekləri (Mixkit License)
- `assets/logo.png` — orijinal loqo

## Keyfiyyət qaydaları (2026-10-28-dən)
- Videoya YALNIZ `clip_review.json`-da "ok" olan kliplər düşür; yoxlanmamış ("pending") kliplər heç vaxt istifadə olunmur.
  Hər gün `python3 review.py` bütün pending klipləri vərəqlərə (review_sheet*.png) çıxarır — hamısına baxıb ok/bad yaz.
- "ok" yalnız birbaşa köçmə/daşıma görünən kadrlara: qutular, paketləmə, mebel daşıma, furqon yükləmə, yeni evdə/ofisdə qutular.
  Yol/şosse, təbiət, paltar/qarderob, yemək, idman, daşınmaz əmlak agenti, ümumi ofis iclası, rəqib loqosu — "bad".
- `day.json`-da `"prefer": ["office", ...]` — günün mövzusuna uyğun klip sorğusu açar sözləri (əvvəl seçilir).
- Cover: premium tərtibat (kiçik ağ loqo, eyebrow xətti, ağ + narıncı başlıq, şüşə telefon pill), kadr avtomatik ən kəskin seçilir.
- Keçidlər yumşaq (dissolve / soft push / slide + qaralma), flash zəif, mətn yumşaq kənarla açılır.
