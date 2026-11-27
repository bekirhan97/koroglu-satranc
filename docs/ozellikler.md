# Öğrenci Sistemi — özellikler ve kullanım (ayrıntılı)

Site: https://ogrenci.koroglusatranc.com/ · Kısa özet claude.ai projesindeki "site bilgileri" notunda.
Bu dosya o notun eski "Nasıl kullanılır" bölümüdür (27.11.2026'da taşındı). Güncellerken ilgili maddeyi düzenle.

## Hesaplar
- **İlk kurulum:** siteyi ilk açan "İlk kurulum"da antrenör hesabını oluşturur (bir kez).
- **Öğrenci hesabı:** Antrenör → Hesaplar → "+ Öğrenci hesabı aç". Kullanıcı adı addan önerilir (Şükrü → sukru), şifre otomatik. "Bilgileri kopyala" → WhatsApp.
- **Şifre unutulursa:** Hesaplar → Yeni şifre ver → **"Yeni şifreyi kaydet"e basınca** geçerli olur → Bilgileri kopyala. Mevcut şifre görüntülenemez; pencerede çıkan öneri kaydedilmeden çalışmaz. Girişte baştaki/sondaki boşluk ve büyük İ sorun çıkarmaz. Öğrenci Ayarlar → "Şifremi değiştir".
- **Antrenörler** (yalnız akademi sahibi Bekir): Antrenör → Antrenörler → "+ Antrenör hesabı aç"; Düzenle / Şifre / Sil. Silinenin ödev, video, duyuruları başantrenöre geçer. Antrenörler akademinin bütün öğrencilerini görür; videolar ortak; duyurular yalnız hocası olduğu öğrencilere (başantrenörünki herkese). Alber Kadir Zor'un unvanı "Başantrenör" (yalnız unvan, `profiles.title`, Claude veritabanından değiştiriyor).
- **Ders türü ve hocalar:** öğrencide Ders türü (Grup/Özel), Grup, Hocaları (çoklu). Hesaplar, Öğrencilerim, ödev gönderme: Bütün / Benim öğrencilerim / Özel ders / Grup: … filtresi.

## Ödev ve takip
- **Ödev ver:** başlık, not, son gün, günlük hedef, bulmacalar (Lichess tema ya da PGN set), Lichess bağlantıları, bulmaca sınavı, videolar, oyunsonu, açılış repertuvarı → "Öğrencilere gönder…" (hepsi / grup / tek tek).
- **Ödev akışı:** öğrenci ana sayfasında en üstte "Yeni ödevin var / Kaldığın yerden devam et"; bulmaca kısmı doğrudan seti açar, set bitince sıradakine geçer. Antrenörde "8/15 bulmaca denendi · 5 ilk denemede doğru" (ilk deneme ayrı saklanır).
- **Ödevler sekmesi:** bitirdi / yarıda / başlamadı, öğrenci ayrıntısı, ödevi veren hoca, "Benim verdiklerim"; **Geri al** ödevi siler (çözülen bulmacalar ve puan kalır); veren ya da başantrenör geri alabilir.
- **Öğrencilerim (↻ Yenile):** puan, seri, son 28 gün, ödev %, zayıf temalar, rozetler, sınavlar. **Veli raporu (PDF)**: öğrenci sayfası → yazdır → "PDF olarak kaydet".
- **Duyurular:** herkese ya da gruba; 1 gün … süresiz; öğrenci ✓ ile gizler.
- **Antrenör uyarıları (ana sayfa):** son 2+ derse gelmeyen (mazeretli hariç), 7 gündür çalışmayan/hiç girmeyen, son günü 2 gün içinde olup ödevi açmayan, 14 günde bulmaca puanı 100+ düşen. Ders kartında grubun zayıf temaları.
- **Çalışmalar (Antrenör → Çalışmalar):** dönem (Bugün … Geçen ay) × öğrenci/grup × filtre. Sütunlar: Bulmaca, Tekrar, Hız oyunu, Açılış, Tahmin Et, Motor/Maia, Video, Lichess, Oyunsonu, Aktif gün, Ders, Puan. Sıralanır; "Excel'e aktar" (CSV). Rakamlar öğrencinin son raporundan (70 gün).
- **Hata kaydı:** Ayarlar → "Hata kaydı (son 7 gün)": kim, ne zaman, hangi ekran/cihaz. Öğrenci "çalışmıyor" derse önce buraya bak.

## Program ve dersler
- **Program → Gruplar ve özel dersler:** gün, saat, süre, yer/ders bağlantısı, hocalar, öğrenciler; her hafta tekrarlanır. Grup dersinin adı öğrencinin grup bilgisi olur. Haftalık takvim (Bütün akademi / Benim derslerim).
- Derse tıkla → **yoklama** (geldi / gelmedi / mazeretli, "Hepsi geldi"), ders notu, Dersi iptal et / geri al. "+ Tek seferlik ders" (telafi işaretlenebilir). Grup düzenlemede öğrenci başına devam oranı.
- **Ders bağlantısı:** Zoom/Meet/Lichess linki → öğrencide yeşil "🎥 Derse katıl" (iptalde çıkmaz). Bütün dersler online.
- **Haftada birden çok saat:** "+ Gün / saat ekle" (aynı güne iki saat olmaz). Öğrenci birden çok gruba + özel derse girebilir; etiket "Cumartesi 10:00 · Salı-Perşembe 18:00 · Özel ders". Ana grup = ilk grup.
- **Ders hocası = öğrencinin hocası:** ders kaydedilince hocaları dersteki öğrencilere eklenir (yalnız eklenir; kaldırma Hesaplar → Düzenle'den).
- **Güne göre hoca:** her gün/saat satırında "Hoca"; o gün yalnız o hocanın programında. Şu anki dağılım: **Magnus Carlsen** Pzt 18:00 Alber, Çar 18:00 Bekir; **Mikhail Tal** Sal 19:00 Alber, Per 19:00 + Cum 19:30 Bekir; **Garry Kasparov** Pzt 19:30 + Per 19:30 Alber, Çar 19:30 Bekir. Ömer Yavaş ve Emir Kemal Cankul özel ders.
- **Kim neyi görür:** öğrenci yalnız kendi derslerini; Bekir bütün programı (seçimli); diğer antrenörler (Alber dahil) yalnız hocası oldukları dersleri.
- **Bu dersten ödev ver:** ders kartından; dersin öğrencileri seçili gelir. Sonraki dersin kartında "Önceki dersin ödevi": bitiren/yarıda/başlamadı + en çok hata yapılan 3 soru ("Tahtada aç").
- **Ders sonu raporu ("Dersi bitir ▸"):** Konu, Derste ne yaptık, Kritik konum (tahta ya da FEN + açıklama), Ödev, Sonraki ders, kişisel not (yalnız o öğrenci görür), gelmeyenlere telafi paketi (temadan 5/8/10 bulmaca). "Kaydet ve paylaş" → grup mesajı ve öğrenci öğrenci (Kopyala / WhatsApp / PDF / "Hepsi tek PDF"). Sonra ders kartında "📋 Ders raporu", telafi takibi. Öğrencide "Son dersinin raporu" / "Kaçırdığın dersin özeti" kartı (10 gün), kritik konum tahtada denenebilir.

## Çalışma bölümleri (öğrenci)
- **Bulmacalar:** puanlı antrenman, ⚡ Storm (3/5 dk), 🏃 Rush (3 can; 3 dk, 5 dk, Hayatta kal), 🔥 Streak (ilk yanlışta biter, 1 atlama), Tekrar, Temalar, Setlerim, İstatistikler; **Oyunlarım** (son 30 Lichess oyunundaki hatalardan + turnuva maçı hatalarından bulmaca). Storm/Rush/Streak puanı değiştirmez, günlük hedefe sayılır. Bulmaca verisi (~6,7 MB) girişten 5 sn sonra arka planda iner; ilerleme ve "Tekrar dene" var.
- **Premove (ön hamle):** rakip oynarken hamle sıraya konur (yeşil kareler), rakip oynayınca hemen oynanır; boş kareye tıklayınca iptal. Bulmacalar (antrenman, Storm, Rush/Streak), Pozisyondan Oyna, Oyunsonu ve Lichess'te Oyna'da açık; sınav, Tahmin Et ve açılış tekrarında kapalı. Yanlış hamleyle konum geri alınırsa ya da premove geçersiz kalırsa sessizce düşer.
- **Videolar:** "+ Video ekle" (YouTube liste dışı, başlık, konu, not). %85 izlenince ya da "İzledim" ile sayılır; antrenör "X/Y öğrenci izledi" görür.
- **Hamleyi Tahmin Et:** PGN içe aktar ya da 📚 Hazır koleksiyonlar. Ödeve eklemeden önce **"Önceden analiz et"** (yoksa öğrencinin telefonu analiz eder, yavaş).
- **Açılış Tekrarı:** repertuvar içe aktar (PGN, varyantlı), aralıklı tekrar.
- **Pozisyondan Oyna:** Maia (1100–1900) ya da Stockfish seviyeleri, saatli/saatsiz.
- **Lichess bağlantısı:** "Lichess ile bağlan" → antrenör Blitz/Rapid/Bulmaca puanlarını, profil/oyun linklerini, "Maç teklif et"i görür.
- **♞ Lichess'te Oyna:** sitenin içinde gerçek Lichess maçı (Board API; "Puanlı" seçilirse puanı etkiler). İzin yalnız o cihazda. Meydan oku (sınıf arkadaşları + antrenör ya da herhangi bir kullanıcı adı; 3+2, 5+3, 10+0, 10+5, 15+10). Rakip bul yalnız 10+0, 10+5, 15+10, 30+0 (Lichess kuralı: Board API'de blitz yalnız davetle, bullet hiç). Davetler her ekranda bildirim. Maç ekranı açıkken motor kapalı ve başka bölüme geçilemez.
- **♔ Oyunsonu:** 717 konum (Silman, de la Villa, Theoryhack kitaplarından yalnız konumlar; açıklamalar bizim). Teorik (≤7 taş, Lichess tablosu): Temel matlar 30, Şah-piyon 149, Kale 162, Kale-hafif taş 35, Fil 86, At 34, Fil-at 20, Vezir 52. Pratik (>7 taş, rakip Stockfish): piyon 31, kale 43, hafif taş 41, vezir 18, karışık 16. Seviyeler Başlangıç … Usta ölçülen zorluğa göre (74/151/156/154/111/71). Hedef: Mat et / Kazan / Beraberliği tut (teoride 12, pratikte 15 hamle). Yıldız: 3 hatasız, 2 en çok 2 hata, 1 bitirdi. Hocanın konumları: "+ Konum ekle", "⇪ PGN'den içe aktar" (yalnız [FEN]'li oyunlar, klasör adıyla).
- **🧭 Strateji:** 856 plan sorusu, 10 bölüm, 6 seviye; 3–4 aday hamle, yanlışta neden, doğruda yıldız + bütün seçeneklerin açıklaması + "▶ Devamı göster". Kaynak: Bekir'in 11 strateji kitabının PGN'i (yalnız konum ve kitabın hamlesi; açıklamalar bizim). Her konum Stockfish ile süzüldü (2.449 → 856). Soru başına 3 puan, günde en çok 20 soru.
- **♜ Turnuva Maçları:** maç ekle (rakip ad/puan/FIDE ID/kulüp, turnuva, tur, tarih, süre, hamleler — PGN ya da tahtada gir) ya da bütün turnuva PGN'i (öğrencilerimiz adlarından bulunur). Açılış adı (ECO) otomatik. "Stockfish ile analiz et": ??/?/?!, isabet %, grafik, daha iyi hamle oku. Hoca hamleye yorum yazar. **Rakipler** veritabanı: beyazla/siyahla oynadığı açılışlar, akademiden onunla oynanan maçlar, not, FIDE linki, birleştirme. Öğrenciler hepsini görür (başkalarının adı yerine "Takım arkadaşın"). Analizli maçtaki ?? ve ? hamleleri öğrenci maçı açınca Oyunlarım'a bulmaca olur. **Hazırlık:** rakip sayfası → "♟ Hazırlık: Açılış Tekrarı'na ekle".

## Sıralama ve puan
- Varsayılan **Genel puan:** bulmaca 1 (günde en çok 60), tekrar 1 (30), açılış pozisyonu 1 (30), oyunsonu 5 (50), strateji 3 (60), video 10 (30), Tahmin Et oyunu 15 (45), Pozisyondan Oyna 8 (40; en az 8 hamle ya da mat), Lichess'te Oyna 10 (40; iptaller sayılmaz) → günde en çok 385. "Puanlar nasıl hesaplanır?" penceresi.
- Ayrı sıralamalar: Bulmacalar (Antrenman, Storm, Rush, Hayatta kal, Streak), Çalışmalar (Oyunsonu, Strateji, Videolar, Tahmin Et, Açılış, Pozisyondan Oyna, Lichess'te Oyna). Bu hafta / Bu ay / Tüm zamanlar × Grubum / Akademi geneli. Hafta pazartesi, ay ayın 1'inde başlar.
- **Yalnız velisi açık rıza veren öğrenciler görünür:** Hesaplar → "Sıralamada" kutusu (varsayılan kapalı). Adlar "Ayşe Y.".
- **🎓 Hocalar sıralaması:** yalnız antrenörler görür; antrenör cihazları da rapor gönderir.

## Diğer
- **Bildirimler:** Ayarlar → Bildirimler → "Bildirimleri aç" (her cihazda ayrı, deneme bildirimi gelir). Öğrenciye: yeni ödev, duyuru, ders iptali/geri alma, ders raporu. iPhone'da yalnız ana ekrana eklenmiş sitede (iOS 16.4+). Gerçek telefonda henüz denenmedi.
- **Ana ekrana ekle:** "Uygulama gibi kullan" kartı.
- **Yedek:** Ayarlar → Yedek → "Akademinin yedeğini indir" (yalnız hocalar; 20 tablo tek JSON; Bekir ham kv'yi de alır). 7 günde bir hatırlatma. Haftada bir indirip Drive'da sakla (Free planda Supabase yedek almıyor). Geri yüklemeyi Claude dosyadan yapar.
- **Giriş ekranı:** Kullanıcı adı / Şifre, Göster/Gizle, "Giriş yardımı". İletişim ve KVKK bağlantıları hukukçu onaylı metin gelince eklenecek.
- **Tablet:** iPad dikey/yatay ve Android tablette taşma yok.

## Bilinen sınırlar
- Tarayıcıdaki Stockfish (lite, tek çekirdek) masaüstündekinden zayıf; derin analiz 2,5–4 sn ile sınırlı.
- Telefonda alt menüde 4 bölüm + "Diğer".
- Aynı öğrenci iki cihazda aynı anda çalışırsa son kaydeden geçerli.
- ChatGPT vb. botların siteyi okuyamaması normal (girişli + noindex).
