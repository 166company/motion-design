# Yük.az gündəlik Reels (real kadrlar)

Hər gün 00:01 (Bakı) Claude-un planlı tapşırığı:

1. `day.json` yazır: ekran mətnləri, cover başlığı, caption (nümunə formatında).
2. `python3 daily.py day.json` — real stok kadrlardan (Pexels, pulsuz lisenziya) video, cover və caption hazırlayır.
3. Nəticəni `reels-drop` branch-inə `YYYY-MM-DD/` qovluğu kimi qoyur (hər gün yenidən yazılır).
4. Google Apps Script (`apps_script/Code.gs`) hər saat həmin qovluğu Drive-da
   `Yük.az Reels/YYYY-MM-DD/` qovluğuna köçürür.

Kompüter açıq olmasa da işləyir. Bu branch (`yukaz-reels-real`) əsas `main` sisteminə toxunmur.

- `clips/` — Pexels kadrları (Pexels License, ticari istifadə pulsuz)
- `assets/music/` — Mixkit trekləri (Mixkit License)
- `assets/logo.png` — orijinal loqo
