# Instagram görselleri

Köroğlu renkleri ve logosuyla 1080×1350 (gönderi), 1080×1920 (hikâye) ya da 1080×1080 görseller.
Siteyle bağlantısı yok: yalnızca `resources/` altındaki konumları okur, siteye yüklenmez.

```bash
cd tools/instagram && npm install            # bir kez
node sec.mjs strateji --seviye 2 --adet 3    # aday göster (strateji | oyunsonu | bulmaca)
node sec.mjs strateji --id st-b7acdb5551 --tarif out/t.json   # tarif yaz + kullanilanlar.txt'ye ekle
node render.mjs out/t.json out/                # PNG'leri üret
```

`sec.mjs` seçenekleri: `--seviye 1–6`, `--bolum <id>` (strateji: merkez, piyon…; oyunsonu: mat, piyon, kale…),
`--tema <lichess teması>` ve `--puan 1200-1600` (bulmaca), `--id`, `--adet`, `--handle "@hesap"`,
`--hepsi` (oyunsonunda genel açıklamalı konumlar da). Paylaşılanlar `kullanilanlar.txt`'de tutulur ve bir daha seçilmez
— bu dosyayı commit et.

## Tarif alanları (render.mjs)

| Alan | Anlamı |
|---|---|
| `size` | `post` (varsayılan), `story`, `square` |
| `tag` | Üstteki küçük etiket, ör. "Strateji · Merkez ve alan" |
| `title` | Büyük başlık (2 satıra kadar) |
| `fen` | Konum |
| `move` | Önce oynanacak UCI hamle(ler); son hamle vurgulanır (bulmacada rakibin ilk hamlesi) |
| `orient` | `white`/`black`; verilmezse sırası gelen taraf |
| `turn` | "Beyaz oynar" yazısı; `false` gizler |
| `level` | Sağ üstte, ör. "Seviye 2 · Temel" ya da "Puan 1424" |
| `arrows` | `[["c3","d5","green"]]` (renk: gold, green, red ya da #hex) |
| `marks` | Yeşil halka çizilecek kareler |
| `choices` | `[{"label":"Ad5","state":"ok"}]` — state: yok / `ok` / `bad`; 1-2-3-4 diye numaralanır |
| `text`, `textSize` | Tahtanın altındaki açıklama |
| `footer`, `handle` | Alt satır sol / sağ |
| `out` | Dosya adı |

Taşlar: chessground cburnett (GPL). Yazı tipi: Inter (SIL OFL), `fonts/` içinde.
