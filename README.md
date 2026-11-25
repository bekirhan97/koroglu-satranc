# Köroğlu Satranç

Köroğlu Satranç Akademi'nin çalışma uygulaması (Electron, Windows + macOS). Sürüm 0.3.

**İndir:** [Son sürüm](https://github.com/bekirhan97/koroglu-satranc/releases/latest) – Windows için `…Windows-Setup.exe`, Mac için `…Mac-arm64.zip` (Apple Silicon) ya da `…Mac-x64.zip` (Intel).

## Bölümler
- **Hamleyi Tahmin Et** – usta oyunlarında hamle tahmini, ChessTempo benzeri puanlama
- **Açılış Tekrarı** – varyantlı PGN repertuvar + aralıklı tekrar
- **Bulmacalar** – Lichess'ten 60.653 bulmaca, tema analizi, kaçırılan bulmacaların tekrarı, PGN setleri
- **Pozisyondan Oyna** – Stockfish (8 seviye) ya da Maia (1100–1900), satranç saati
- **Öğretmen** (Ayarlar → Öğretmen modu) – ödev paketi (`.kpaket`) hazırlama, öğrenci raporlarını (`.krapor`) görme

Veriler öğrencinin bilgisayarında JSON olarak durur (`userData/data`); her gün `userData/backups` altına otomatik yedek alınır.

## Geliştirme
```
npm ci
scripts/fetch-engines.sh linux-x64        # ya da win32-x64 / darwin-arm64 / darwin-x64
npm start                                 # derle ve çalıştır
npm test                                  # birim testleri
```
Veri dosyalarını yeniden üretmek için: `scripts/build-puzzles.py`, `scripts/build-openings.mjs`, `scripts/build-maia.cjs`.

## Sürüm çıkarma
1. `package.json` içindeki `version` değerini artırın, `docs/surum-notlari/vX.Y.Z.md` dosyasını yazın.
2. `release/vX.Y.Z` adlı bir dal gönderin (ya da GitHub'da Actions → Sürüm → Run workflow).
3. İş akışı Windows ve Mac'te paketleri derler, her paketi kendi işletim sisteminde öz test modunda açar
   (motor, Maia, bulmacalar, arayüz) ve GitHub sürümüne yükler. Windows kurulumları yeni sürümü kendiliğinden alır.

Öz test: `KOROGLU_SELFTEST=sonuc.json` ortam değişkeniyle açılan uygulama kontrolleri yapıp kapanır.

## Yapı
- `src/main/` – ana süreç: pencere, JSON deposu, UCI motor yöneticisi, yedekleme (`backup.cjs`), kayıt (`log.cjs`), güncelleme (`updater.cjs`)
- `src/renderer/core/` – ortak parçalar: tahta, PGN, motor, Glicko, aralıklı tekrar (`srs.js`), çalışma günlüğü (`activity.js`), ödev/rapor (`assign.js`)
- `src/renderer/modules/<id>/` – her bölüm bir modül; `registry.js`'de listelenir

Lisans: GPL-3.0-or-later (Stockfish, chessground, Maia GPL-3). Lichess bulmacaları ve açılış isimleri CC0.
