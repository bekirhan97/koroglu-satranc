# Öğrenci Sistemi (web) — teknik ayrıntılar

Bu dosya eskiden claude.ai projesindeki "site bilgileri" notunun "Teknik özet" bölümüydü (27.11.2026'da buraya taşındı).
Güncellerken bütün dosyayı yeniden yazma; ilgili maddeyi düzenle.

## Kabuk ve veri
- `web/src/main.js` kabuk + giriş + ödev/rapor eşitleme; `api.js` masaüstünün `window.api`'sini tarayıcıda taklit eder (her JSON dosyası = `kv` tablosunda bir satır; girişte hepsi yüklenir, yazmalar 0,7 sn gecikmeli). Masaüstü modülleri değişmeden çalışır; web'e özel yerler `window.api.web` ve `window.webHooks` ile ayrılır. `coach.js`: hesap yönetimi, ödev gönderme, rapor çekme. `web.css`: giriş ekranı + telefon düzeni.
- Tablolar: `profiles` (rol coach/student, username, display_name, coach_id, group_name), `kv`, `assignments` (paket JSON), `assignment_targets`, `reports` (öğrencinin son raporu). RLS açık; yardımcı fonksiyonlar `private` şemasında.
- Giriş: kullanıcı adı → `<ad>@kullanici.koroglu-satranc.app` (sahte e-posta, mail gitmez).
- Edge Function **`hesap`** (`web/supabase/functions/hesap/index.ts`, verify_jwt kapalı, kendi yetki kontrolü var): `durum`, `kurulum` (yalnız hiç antrenör yokken), `ogrenci_ac`, `ogrenci_guncelle` (ad/grup/şifre, lesson_type, coach_ids), `ogrenci_sil`, `antrenor_ac/guncelle/sil` (yalnız başantrenör).
- Yayın: `main`'e push → `.github/workflows/web.yml` (test + `node scripts/build-web.mjs --minify` → GitHub Pages). Bulmacalar `data/puzzles.json` (6,7 MB).

## 2. aşama dosyaları
- `web/src/engine.js` (Stockfish 19 lite-single WASM, Web Worker; masaüstü engine.cjs ile aynı iş kuyruğu), `web/vendor/stockfish/` (GPL), `videos.js` (kütüphane + oynatıcı, YouTube IFrame API), `lichess.js` (OAuth PKCE, client_id `koroglu-ogrenci-sistemi`, token yalnızca kullanıcı adını öğrenmek için kullanılıp iptal edilir). Maia ağları `data/maia/`, `maia-worker.js` sitenin kökünde.
- Lichess'te Oyna: `web/src/lichess-play.js` (/api/stream/event, /api/board/seek, /api/challenge, /api/board/game/stream + move/draw/resign/abort; ndjson okuyucu). Kapsamlar `board:play challenge:read challenge:write`, localStorage `koroglu-lichess-oyun`. Tablo `lichess_accounts` (user_id, coach_id, display_name, username) yalnızca `set_lichess_username(uname)` RPC'siyle yazılır; aynı antrenörün öğrencileri birbirini görür.
- Tablo `videos` (coach_id, title, youtube_id, topic, note). İzlemeler kv `videos/watched`, Lichess bağlantısı kv `lichess` {username, perfs}; rapora `videos` ve `lichess` eklenir.
- Duyurular `announcements` (coach_id, body, group_name, expires_at); RLS: öğrenci yalnızca kendi antrenörünün, kendi grubuna/herkese olan ve süresi dolmamış duyurularını görür.
- PWA: `manifest.webmanifest`, `sw.js` (yalnızca sayfa için ağ öncelikli, offline yedek), simgeler `web/vendor/icon-*.png`; `web/src/install.js`.
- Ödev geri alma: öğrenci girişte `assignments`'ı okur; listede olmayanlar `removeAssignment()` ile kalkar (ödevle gelen set/oyun/repertuvar da).
- Ödevden sete giden yol: rota `asg:<ödevId>` → `puzzles.mount(root, { openSets, onSetDone })`.

## Testler
- `npm test` (kökte; node:test, `test/*.test.mjs`, ~50 test). Saf mantık `*-core.js` dosyalarında ve testli.
- Uçtan uca: sahte Supabase `web/test/mock-supa.mjs` + `web/test/web-e2e.mjs` (sahte Lichess dahil; `REAL=1` gerçek veritabanı içindir ama kurulum adımı artık geçmez). Canlı site: `web/test/live-smoke.mjs` (girişsiz; motor + Maia).

## Akademi modeli
- Başantrenör = `role='coach'` ve `coach_id` boş; diğer antrenörlerin ve bütün öğrencilerin `coach_id` = başantrenör. `profiles.lesson_type` ('grup'|'ozel'), `profiles.title` (unvan), tablo `student_coaches(student_id, coach_id)`.
- Yardımcılar: `private.my_academy()`, `in_my_academy(uid)`, `is_coach_of(student)` (akademideki her antrenör), `is_my_coach(cid)` (duyurular).
- Supabase bağlayıcısında DROP/UPDATE içeren migration'lar onay istiyor ve otomatik iptal oluyor → politikalar `alter policy` ile değiştirilir.

## Program
- `classes` (academy_id, name, kind grup|ozel, weekday 1=Pzt, start_time, duration_min, location, coach_ids[], slots), `class_members`, `sessions` (bir dersin belirli günü — yoklama/not/iptal girilince `upsert(class_id,date)`; ya da class_id boş tek seferlik ders: title, student_ids[], makeup; status planned|cancelled; note), `attendance` (geldi|gelmedi|mazeretli). RPC `class_sync(cid, old_name)` / `class_release(old_name)` grup adını profiles.group_name'e yazar/kaldırır. Kod: `web/src/schedule.js` (`expandLessons()`).
- Çok saat / çok grup: `classes.slots` jsonb [{wd 1=Pzt, start 'HH:MM', dur, coaches?: [uuid]}] (coaches = o güne giren hoca; boşsa classes.coach_ids; classes.coach_ids = işaretliler ∪ gün hocaları). weekday/start_time/duration_min = ilk saat (eski kayıtlar için yedek; `slotsOf(c)`). Oturumlar unique(class_id, date) → aynı güne tek saat. `private.my_groups()` (ana grup + üye olunan grup dersleri) → `ann_select` politikası ve `leaderboard2`. `class_sync` dersin coach_ids'ini dersteki öğrencilere `student_coaches` olarak ekler (silmez). `private.regroup(acad, cid, old_name)` (yalnızca class_sync/class_release'ten). İstemci: `coach.js` st.groups / st.hasOzel / st.label, `groupsOf`, `allGroups`, `classOf`. Ders bağlantısı 300 karakter.

## Ödev ↔ ders, ders sonu raporu
- Ayrı tablo yok: paket içinde `package.lesson` = `{class_id, date}` (tek seferlik derste `{session_id, date}`). "Bu dersten ödev ver" `window.__lessonCtx` ile Antrenör modülüne geçer; dersin `sessions` satırı yoksa oluşturulur. Özet: raporda `assignments[].parts[].miss` = `[[setSırası, bulmacaSırası], …]` (ilk denemede yanlışlar), `first` = ilk denemede doğru sayısı. İlk sonuç `progress[setId]['~' + bulmacaId]`.
- Ders sonu raporu: `sessions` + `topic`, `critical` jsonb {fen, comment}, `next_plan`, `finished_at` (özet = `note`). `session_notes(session_id, student_id, note)` (antrenör hepsini, öğrenci kendisininkini görür), `session_reads(session_id, student_id, read_at)`. Telafi paketi = normal ödev, `package.makeup = true`, `package.lesson.session_id`. Kod `web/src/lessonReport.js` (finishDialog, shareDialog, reportText, reportHtml → `api.savePdf`, fenSvg, positionModal, makeupStatus, openStudentReport); `coach.js` `createAssignment(pkg, ids, me)`.

## Sıralama ve puan
- `scores` (student_id, kind storm3|storm5|rush3|rush5|survival|streak, score) — `api.scoreRun()`; RPC `leaderboard2(kind, period week|month|all, scope group|academy|coaches, grp)`; kod `web/src/ranking.js`. Eski `leaderboard()` kullanılmıyor. `set_leaderboard_ok(student, ok)` yalnızca öğrencinin antrenörü.
- **Çalışma puanı iki yerde, ikisi aynı tutulmalı:** `src/renderer/core/points.js` (POINTS, dayPoints, pointsSummary; `test/points.test.mjs`) ↔ SQL `private.day_points(jsonb)`. Yeni çalışma türü eklenince ikisi de ve `leaderboard2` güncellenir. Rapor `points` {total, by}. scope 'coaches' yalnızca role=coach çağırabilir. Activity anahtarı `lichessGames` (`lichess-play.js countGame`, localStorage `koroglu-lichess-sayilan`).
- Supabase güvenlik uyarıları bilerek kabul edildi: `leaderboard`, `set_leaderboard_ok`, `set_lichess_username` (kendi içinde yetki kontrolü), `app_secrets` (RLS açık politika yok → yalnız service role).

## Uyarılar, hata kaydı, bildirimler, çalışmalar
- Uyarılar: `web/src/alerts-core.js` (saf, `test/alerts.test.mjs`) + `alerts.js`.
- Hata kaydı: `client_errors` (user_id, created_at, message ≤500, stack, page, ua, version); herkes kendi adına ekler, antrenörler akademisindekileri okur. `web/src/errlog.js` (sayfa başına en çok 10 farklı hata).
- Web Push: Edge Function **`bildirim`** (verify_jwt kapalı): `anahtar` (VAPID açık anahtarı), `gonder` (yalnız antrenör, kendi akademisine), `deneme`. Şifreleme `web/supabase/functions/bildirim/webpush.js` (Web Crypto; RFC 8291/8292; `test/webpush.test.mjs`). VAPID özel anahtarı `public.app_secrets`. Abonelikler `push_subs(endpoint, user_id, p256dh, auth, ua)`. İstemci `web/src/push.js`, `sw.js` push + notificationclick (`#sayfa`). Tetikler: `createAssignment` (telafi hariç), duyuru, `schedule.js` iptal/geri al, `lessonReport.js` ilk kayıt.
- Çalışmalar: `web/src/study-core.js` (saf; `test/study.test.mjs`) + `study.js` (`window.webHooks.studyTab`). Antrenörler `scores`'u okur (`scores_coach_select`). Rapor `activity.days` 70 gün. Lichess sayısı `lichess.org/api/games/user/<ad>?since&until` (ndjson satır sayısı, önbellekli).

## Oyunsonu
- `resources/endgames.json` ({chapters:[{id,name,desc,icon,kind teori|pratik}], lessons:[{id,ch,topic,title,fen,goal mate|win|draw,oppFirst,text,level 1–6,src tb|sf,diff}]}) → `data/endgames.json` (build-web kopyalar).
- Üretici: `scripts/build-endgames.py verified.json resources/endgames.json scripts/endgame-difficulty.json`; zorluk `scripts/measure-endgames.py` (SHARD=k/n paralel). Ders id'leri kaynak sırasından, değişmez. Girdi (kitaplardan çıkarılmış + doğrulanmış konumlar) repo dışında.
- `curriculum.js` (loadCurriculum, curriculum(), lessonById, GOAL_TEXT, LEVELS), `judge.js` (tablo ya da Stockfish derinlik 16 / 1,2 sn; HOLD_MOVES=12, PRACTICAL_HOLD=15, PRACTICAL_WIN_CP=800), `index.js` (modül `oyunsonu`, kv `endgame`), `src/renderer/core/fensvg.js`. Web: `web/src/endgame-web.js` (tablo `endgame_positions` + `collection`; parsePgnPositions, importDialog, editDialog). Rotalar `puzzles:theme:<tema>`, `egasg:<ödevId>`; paket alanı `endgames`.
- Masaüstü için endgames.json yükleme yolu henüz yok (`fetch('data/endgames.json')` yerine IPC/kaynak dosyası gerekecek).

## Turnuva maçları
- `opponents` (academy_id, name, norm_name unique, rating, fide_id, club, note, created_by), `tournament_games` (academy_id, student_id, color, opponent_id, opponent_rating, student_rating, tournament, round, played_on, result, time_control, start_fen, moves = SAN boşlukla, eco, opening, analysis jsonb {evals beyaz gözüyle cp, best uci, depth}), `game_comments` (game_id, ply unique, body, coach_id). RLS: akademi okur; maç: öğrenci kendi, hoca akademidekiler; rakip: herkes ekler, hoca ya da ekleyen düzenler, hoca siler; yorum yalnız hoca.
- Kod `web/src/tournament-core.js` (normName, displayName, matchStudent, parseTournamentPgn, playMoves, classify, opponentStats, prepLines/pgnLine; `test/tournament.test.mjs`) + `tournament.js` (modül `turnuva`). Turnuva bulmacaları `mygames/data` içinde `tg-<oyunId>-<ply>`; rota `puzzles:mine`.

## Strateji
- `resources/strategy.json` ({chapters:[{id,name,desc,icon}], items:[{id st-<sha1>, ch, title, level 1–6, diff, fen, choices:[{m uci, san Türkçe, ok, why}], line uci, src (gösterilmez)}]}) → `data/strategy.json`. Kod `web/src/strategy.js` (modül `strateji`, kv `strategy`, activity `strategy` yalnız ilk çözümde). Ödeve ekleme henüz yok.
- Yeniden üretmek: `scripts/extract-strategy.py` → `measure-strategy.py` (Stockfish, ~1,5 saat) → `build-strategy.py resources/strategy.json`. Ham analiz verisi Bekir'in bilgisayarında Masaüstü\Claude\strateji-analiz-verisi.tar.gz.

## Yedek
- `web/src/backup.js` (TABLES listesi; 1000'erli sayfalama; localStorage `koroglu-son-yedek`); RLS `kv_owner_select` (akademi sahibi). Yeni tablo eklenince TABLES'a da ekle.

## Güvenlik notu
- Edge Function'a test için "gizli anahtarla antrenör açma" eklemek kasıtlı olarak yapılmadı (arka kapı olurdu).
