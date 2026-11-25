# Köroğlu Satranç

Modüler satranç çalışma uygulaması (Electron), sürüm 0.2. Modüller:
- **Hamleyi Tahmin Et** (ChessTempo "Guess the Move" benzeri)
- **Bulmacalar** (Lichess CC0 veritabanından 60.653 bulmaca + PGN setleri)
- **Açılış Tekrarı** (varyantlı PGN repertuvar + aralıklı tekrar)
- **Pozisyondan Oyna** (Stockfish 8 seviye + Maia 1100–1900, saf JavaScript)

## Geliştirme
```
npm install
# motorları resources/engines/<platform-arch>/ altına koyun (Stockfish 17.1, GitHub releases):
#   win32-x64/stockfish.exe   (stockfish-windows-x86-64-sse41-popcnt)
#   darwin-arm64/stockfish    (stockfish-macos-m1-apple-silicon)
#   darwin-x64/stockfish      (stockfish-macos-x86-64-sse41-popcnt)
#   linux-x64/stockfish       (geliştirme için)
node scripts/build-openings.mjs <lichess chess-openings tsv klasörü> resources/openings.json
python3 scripts/build-puzzles.py lichess_db_puzzle.csv.zst resources/puzzles.json 2500
node scripts/build-maia.cjs <maia-chess/maia_weights> <lc0tables.json> resources/maia   # protobufjs gerekir
npm start
```

## Paketleme
```
node scripts/build.mjs --minify && rm -f dist/*.map
node scripts/package.mjs win32-x64
scripts/package-mac.sh arm64 <electron-vX-darwin-arm64.zip> "out/Koroglu Satranc-win32-x64/resources/app.asar"
scripts/package-mac.sh x64   <electron-vX-darwin-x64.zip>   "out/Koroglu Satranc-win32-x64/resources/app.asar"
```

## Yapı
- `src/main/` – Electron ana süreç: pencere, JSON veri deposu (userData/data), UCI motor yöneticisi (öncelikli iş kuyruğu).
- `src/renderer/core/` – ortak parçalar: tahta (chessground + chess.js), PGN, açılış kitabı, motor istemcisi, Glicko.
- `src/renderer/modules/` – her çalışma alanı bir modül. `registry.js`'e eklenir.
  - `gtm/` – Hamleyi Tahmin Et: `scoring.js` (0–12 puanlama, ChessTempo verisine kalibre), `analysis.js`
    (hamle başına motor analizi, diske önbellek), `play.js`, `review.js`, `list.js`, `stats.js`.

## Yeni modül eklemek
`modules/<id>/index.js` dosyası `{ id, title, icon, description, ready: true, mount(root, ctx) }` döndürür;
`mount` bir `{ unmount }` nesnesi verir. Tahta için `core/board.js`, motor için `core/engine.js` kullanılır.
Profil puanları `store.profile.ratings.<modül>` altında tutulur.

Lisans: GPL-3.0-or-later (Stockfish ve chessground GPL-3).
