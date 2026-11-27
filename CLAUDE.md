# Köroğlu Satranç — Claude için çalışma kuralları

Bekir (akademi sahibi) ile Türkçe konuş; teknik terimleri sade anlat. Arayüz metinleri Türkçe, notasyon Türkçe (Ş V K F A).

## Depo
- **Masaüstü uygulaması** (Electron 33 + esbuild): `src/main` (ana süreç), `src/renderer/core` (ortak mantık), `src/renderer/modules/<id>` (modüller, `registry.js`). Sürüm 0.4.0. Mimari: claude.ai projesindeki `koroglu-satranc-mimari.md`.
- **Öğrenci Sistemi (web)**: `web/` — https://ogrenci.koroglusatranc.com/ — masaüstü modüllerini tarayıcıda çalıştırır (`web/src/api.js` `window.api`'yi taklit eder), veri Supabase'de (proje `ajghkdqwgcgzscweckoo`, Frankfurt).
- Ayrıntılar: `docs/teknik/web.md` (tablolar, RPC'ler, dosyalar), `docs/ozellikler.md` (kullanıcı gözünden her özellik). Önce ilgili bölümü ara (`grep`), bütün dosyayı okuma.
- `tools/instagram/`: Instagram görsel aracı (Köroğlu renkli tahta görselleri; siteyle bağlantısı yok, yayına girmez). Kullanım `tools/instagram/README.md`.
- Veri: `resources/puzzles.json` (60.653 Lichess bulmacası, puana göre sıralı), `endgames.json` (717), `strategy.json` (856). Büyük dosyaları `cat` etme; `python3 -c`/`node -e` ile özetle.

## Komutlar
- `npm ci --ignore-scripts` (Electron indirmeden), `npm test` (node:test, ~50 test; değişiklikten sonra çalıştır).
- Web derleme: `node scripts/build-web.mjs` → `web/dist`. Uçtan uca: derledikten sonra `cd web/dist && python3 -m http.server 8765 &` ve `node web/test/web-e2e.mjs` (sahte Supabase + sahte Lichess). Canlı kontrol: `node web/test/live-smoke.mjs`.
- Ekran kontrolü Playwright ile (xvfb); `scratch/` git'e girmez.

## Yayın
- `main`'e push = **canlı siteye yayın** (`.github/workflows/web.yml`: test → build → GitHub Pages). Yalnız `web/**`, `src/renderer/**`, `resources/puzzles.json`, `scripts/build-web.mjs`, `test/**`, `package.json` değişince tetiklenir.
- Masaüstü sürümü: `package.json` sürümü + `docs/surum-notlari/vX.Y.Z.md` → `release/vX.Y.Z` dalını gönder (`release.yml`). Bu ortamdan etiket gönderilemiyor.
- Push'tan önce `npm test` geçmeli; yayından sonra Actions durumunu kontrol et (GitHub API kimliksiz okunabiliyor).

## Supabase kuralları
- Şema değişikliği `apply_migration` ile; önce `list_tables` ile mevcut yapıya bak. DROP/UPDATE içeren migration'lar bağlayıcıda onay isteyip iptal olabiliyor → politikayı `alter policy` ile değiştir.
- RLS her tabloda açık. Akademi kalıbı: `private.my_academy()`, `private.is_coach_of(uid)`, `in_my_academy(uid)`. Yeni tabloda bunları kullan; `security definer` fonksiyonda yetkiyi kendin kontrol et.
- Yeni tablo eklenince `web/src/backup.js` içindeki `TABLES` listesine ekle.
- **Çalışma puanı iki yerde:** `src/renderer/core/points.js` ↔ SQL `private.day_points(jsonb)` (+ `leaderboard2`). Biri değişirse öteki de değişir, `test/points.test.mjs` güncellenir.
- Asla isteme/yazma: veritabanı şifresi, service_role/secret anahtar, antrenör şifresi. Yayınlanabilir anahtar sitede zaten var.
- Edge Function'lar `web/supabase/functions/` (`hesap`, `bildirim`); verify_jwt kapalı, yetki içeride. Arka kapı (gizli anahtarla hesap açma vb.) ekleme.

## Kalıplar
- Saf mantık `*-core.js` dosyasına + `test/` altında test; arayüz ayrı dosyada.
- Web'e özel yerler `window.api.web` ve `window.webHooks`; masaüstü modüllerini web için bozma.
- Çocuk verisi (KVKK): yeni kişisel veri alanı eklerken Bekir'e söyle; aydınlatma metnine girmesi gerekebilir.

## Bekir'in bilgisayarı
- Dosya silme yetkisi yok; silinecekleri ona bırak. Büyük dosyalar `SendUserFile` + `device_commit_files` ile.

## Not tutma
- Yeni özellik bitince: kısa satır `docs/ozellikler.md`'ye, teknik ayrıntı `docs/teknik/web.md`'ye (Edit ile, ilgili madde). claude.ai projesindeki "site bilgileri" notu yalnız kısa özet; ona yalnızca durum/açık iş değişince dokun.
