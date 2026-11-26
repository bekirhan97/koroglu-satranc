// Oyunsonu dersleri. Every position has at most 7 pieces, so the Lichess tablebase knows the exact result
// and the best moves (the computer defends perfectly, mistakes are recognised exactly).
// goal: 'mate' (mat et) | 'win' (kazan: mat ya da kazanan konumda terfi) | 'draw' (beraberliği tut)
// oppFirst: the computer makes the first move (the student plays the other side).
// All positions were checked with Stockfish (scripts: see notes) — wins win, draws hold.
export const CHAPTERS = [
  ['mat', 'Temel matlar', 'Tek başına kalan şahı kenara itip mat etmeyi öğren.'],
  ['piyon', 'Şah ve piyon', 'Kare kuralı, opozisyon, kale piyonu: bütün oyunsonlarının temeli.'],
  ['vezir', 'Vezir oyunsonları', 'Vezir, son satıra yaklaşmış piyonu nasıl durdurur, ne zaman duramaz?'],
  ['kale', 'Kale oyunsonları', 'En sık karşılaşılan oyunsonları: Lucena ile kazan, Philidor ile beraberliği tut.'],
  ['hafif', 'Fil ve at oyunsonları', 'Doğru renkli fil, farklı renkli filler ve piyonu durduran hafif taşlar.'],
  ['ileri', 'İleri oyunsonları', 'Fil ve at ile mat, vezir kaleye karşı, Vancura ve zor savunmalar.'],
];

const L = (id, ch, title, fen, goal, text, extra = {}) => ({ id, ch, title, fen, goal, text, ...extra });

export const LESSONS = [
  // ---- Temel matlar ----
  L('mat-vezir-1', 'mat', 'Vezir ile mat', '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'mate',
    'Veziri atın gidişi gibi kullanıp siyah şahın kutusunu küçült. Şah kenara gelince kendi şahını yaklaştır ve mat et.'),
  L('mat-vezir-2', 'mat', 'Vezir ile mat (2)', '8/2k5/8/8/8/8/6Q1/6K1 w - - 0 1', 'mate',
    'Önce veziri şahın kaçabileceği kareleri kesecek yere koy, sonra şahını yürüt. Vezirin şaha çok yaklaşıp pat yapmamasına dikkat.'),
  L('mat-vezir-3', 'mat', 'Vezir ile mat (3)', '8/8/8/8/2K5/8/5k2/1Q6 w - - 0 1', 'mate',
    'Siyah şah zaten kenara yakın. Kutuyu kapat, şahını getir, mat et.'),
  L('mat-pat', 'mat', 'Pata dikkat!', 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1', 'mate',
    'Siyah şah köşede. Acele edip yanlış kareye gidersen siyahın hiç hamlesi kalmaz ve oyun pat (beraberlik) olur. Mat eden kareyi bul.'),
  L('mat-kale-1', 'mat', 'Kale ile mat', '8/8/8/4k3/8/8/8/4K2R w - - 0 1', 'mate',
    'Kale bir çizgiyi keser, şahın da karşı şahla karşı karşıya gelerek (opozisyon) onu geri iter. Şah kenara gelince kale ile mat et.'),
  L('mat-kale-2', 'mat', 'Kale ile mat (2)', '8/8/2k5/8/8/8/8/R5K1 w - - 0 1', 'mate',
    'Kaleyle siyah şahın kutusunu küçült. Kale saldırıya uğrarsa onu uzağa, aynı çizgide kaçır.'),
  L('mat-kale-3', 'mat', 'Kale ile mat (3)', '8/8/8/8/8/3k4/8/R3K3 w - - 0 1', 'mate',
    'Siyah şah senin şahına yakın. Kaleyle bir sıra keserek onu yukarıdaki kenara doğru it.'),
  L('mat-kale-4', 'mat', 'Kale ile mat (4)', '8/8/8/8/8/8/k7/2R1K3 w - - 0 1', 'mate',
    'Şah zaten kenarda. Şahını yaklaştır, uygun anda kale ile son sırada mat et.'),
  L('mat-2kale', 'mat', 'İki kale ile merdiven matı', '8/8/8/3k4/8/8/8/R3K2R w - - 0 1', 'mate',
    'Kaleler sırayla şah çekerek merdiven gibi yukarı çıkar. Şah bir kaleye yaklaşırsa o kaleyi diğer kenara kaçır.'),
  L('mat-2fil', 'mat', 'İki fil ile mat', '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', 'mate',
    'İki fil yan yana bir duvar örer. Şahını da kullanarak siyah şahı köşeye sür; mat yalnızca köşede olur.'),
  L('mat-2fil-2', 'mat', 'İki fil ile mat (2)', '8/8/3k4/8/8/8/2BB4/4K3 w - - 0 1', 'mate',
    'Filler birlikte çalışınca şah onların çizgilerini geçemez. Sabırla köşeye it, pata dikkat et.'),

  // ---- Şah ve piyon ----
  L('p-kare-1', 'piyon', 'Kare kuralı: piyon kaçar', '8/8/8/8/P6k/8/8/K7 w - - 0 1', 'win',
    'Piyondan terfi karesine kadar bir kare çiz. Siyah şah bu karenin içine giremiyorsa piyon tek başına vezir olur.'),
  L('p-kare-3', 'piyon', 'Kare kuralı (2)', '8/8/8/8/k7/8/6P1/7K w - - 0 1', 'win',
    'Başlangıç karesindeki piyon ilk hamlede iki kare gidebilir; kareyi piyon bir kare ilerideymiş gibi say.'),
  L('p-kare-2', 'piyon', 'Kare kuralı: piyonu yakala', '8/8/8/8/P3k3/8/8/7K b - - 0 1', 'draw',
    'Bu kez sen siyahsın. Şahını piyonun karesine sok ve piyonu yakala.'),
  L('p-onde-6', 'piyon', 'Şah piyonun önünde', '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', 'win',
    'Şahın piyonun önünde ve 6. sırada: bu konum her zaman kazanır. Şahını yana çekip piyonu ilerlet, siyah şahı terfi karesinden uzak tut.'),
  L('p-opp-3', 'piyon', 'Opozisyon: rakip başlar', '8/8/8/3k4/8/3K4/3P4/8 b - - 0 1', 'win',
    'Siyah ilk hamleyi yapar. Şahlar karşı karşıya, aralarında bir kare varken sırası gelen geri çekilmek zorunda kalır. Opozisyonu koru ve şahınla öne geç.', { oppFirst: true }),
  L('p-opp-4', 'piyon', 'Opozisyon (2): rakip başlar', '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1', 'win',
    'Opozisyon sende. Siyah şah çekildikçe sen ilerle; piyonun önünde yer kazan.', { oppFirst: true }),
  L('p-iki', 'piyon', 'İki bağlı piyon', '8/8/8/8/2k5/8/3PP3/4K3 w - - 0 1', 'win',
    'Bağlı piyonlar birbirini korur. Şahınla destekle ve birini terfi ettir.'),
  L('p-sav-1', 'piyon', 'Savunma: önden durdur', '4k3/8/8/4P3/4K3/8/8/8 b - - 0 1', 'draw',
    'Sen siyahsın. Beyaz şah piyonun arkasında. Şahını piyonun önünde tut, opozisyonu bırakma.'),
  L('p-sav-2', 'piyon', 'Savunma: geri çekilme', '8/4k3/8/4PK2/8/8/8/8 b - - 0 1', 'draw',
    'Piyonun tam önüne geç. Geri çekilmen gerekirse dümdüz geri çekil ki beyaz şah ilerleyince karşısına çıkabilesin.'),
  L('p-sav-3', 'piyon', 'Savunma: opozisyonu tut', '8/4k3/8/8/4K3/4P3/8/8 b - - 0 1', 'draw',
    'Beyaz şah öne geçmek istiyor. Doğru anda karşısına çıkarak opozisyonu al.'),
  L('p-kale-pyn', 'piyon', 'Kale piyonu beraberliği', '8/8/8/3k4/8/8/P7/K7 b - - 0 1', 'draw',
    'Kale piyonunda savunan şah köşeye ulaşırsa beyaz kazanamaz. Köşeye koş.'),
  L('p-kale-pyn-2', 'piyon', 'Kale piyonu: köşeyi tut', '8/8/8/8/2k5/P7/8/1K6 b - - 0 1', 'draw',
    'Piyonun önündeki köşeye gir ve oradan çıkma; beyaz ya pat yapar ya da ilerleyemez.'),
  L('p-kale-pyn-3', 'piyon', 'Kale piyonu: rakip kazanamaz', '7k/8/6K1/7P/8/8/8/8 b - - 0 1', 'draw',
    'Köşedesin. Sadece köşe ile yanındaki kare arasında gidip gel.'),

  // ---- Vezir ----
  L('v-pyn-merkez', 'vezir', 'Vezir piyonu durdurur', '8/8/8/7Q/8/1K6/3p4/4k3 w - - 0 1', 'mate',
    'Şah çekerek ya da piyonun önündeki kareyi tutarak siyah şahı piyonun önüne girmeye zorla. Her seferinde şahınla bir adım yaklaş.'),
  L('v-pyn-at', 'vezir', 'Vezir piyona karşı: yaklaş', '8/8/8/8/7Q/K7/4p3/5k2 w - - 0 1', 'mate',
    'Merkez ve at piyonlarına karşı vezir kazanır: siyah şahı piyonun önüne sokunca kazandığın zamanla şahını yaklaştır.'),
  L('v-pyn-fil-pat', 'vezir', 'Fil piyonuyla pat savunması', '8/8/8/8/K7/8/2p5/1k5Q b - - 0 1', 'draw',
    'Sen siyahsın. Fil piyonunda şah köşeye kaçınca vezir piyonu alırsa pat olur. Bu kurtarıcı yolu bul ve beraberliği tut.'),

  // ---- Kale ----
  L('k-pyn-1', 'kale', 'Kale piyonu durdurur', '8/1k6/8/8/8/5p2/8/R5K1 w - - 0 1', 'mate',
    'Siyah şah piyondan uzakta. Piyonu al, sonra kale ile mat et.'),
  L('k-pyn-2', 'kale', 'Kale piyona karşı: beraberliği tut', '8/8/8/8/8/2k5/2p5/R5K1 w - - 0 1', 'draw',
    'Piyon şahının desteğiyle ilerliyor ve şahın uzakta. Kalenle piyonu durdurmaya çalış; gerekirse kaleyi piyona ver ama yenilme.'),
  L('k-pyn-3', 'kale', 'Kale piyona karşı (2)', '8/8/8/8/8/1k6/1p6/1R4K1 w - - 0 1', 'draw',
    'Piyon terfi karesine çok yakın. Kalenle terfi karesini tut, şahını yaklaştır.'),
  L('k-kes', 'kale', 'Şahı kes ve kazan', '8/8/8/3k4/8/8/4PK2/7R w - - 0 1', 'win',
    'Kale ile siyah şahı bir dikey hat boyunca kes. Kesik şah piyonu durduramaz; piyonu şahınla birlikte ilerlet.'),
  L('k-kes-2', 'kale', 'Şahı kes (2)', '8/8/8/8/4k3/8/3PK3/R7 w - - 0 1', 'win',
    'Siyah şah piyonun önünde. Önce kaleyle yandan şah çekip onu uzaklaştır, sonra piyonu ilerlet.'),
  L('k-lucena', 'kale', 'Lucena: köprü kur', '3K4/3P2k1/8/8/8/8/4r3/5R2 w - - 0 1', 'win',
    'Kaleni dördüncü sıraya getir (köprü). Şahın piyonun önünden çıkınca siyah kale şah çeker; köprüdeki kalen araya girer ve piyon vezir olur.'),
  L('k-lucena-2', 'kale', 'Lucena (2)', '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'win',
    'Önce siyah şahı kaleyle bir hat öteye it, sonra köprüyü kur.'),
  L('k-philidor', 'kale', 'Philidor: 3. sıra savunması', '4k3/8/r7/4PK2/8/8/8/7R b - - 0 1', 'draw',
    'Sen siyahsın. Kaleni 6. sırada tut, beyaz şahı geçirme. Piyon 6. sıraya gelince kaleni en alta indir ve arkadan şah çek.'),

  // ---- Hafif taşlar ----
  L('h-dogru-fil', 'hafif', 'Doğru renkli fil', '8/8/8/3k4/8/8/P7/1B4K1 w - - 0 1', 'win',
    'Filin terfi karesiyle (a8) aynı renkte: siyah şah köşeden çıkarılabilir. Piyonu filinle ve şahınla destekle.'),
  L('h-yanlis-fil', 'hafif', 'Yanlış renkli fil', '8/8/8/3k4/8/8/P7/B5K1 b - - 0 1', 'draw',
    'Sen siyahsın. Beyazın fili a8 karesini kontrol edemiyor. Köşeye ulaşırsan beyaz kazanamaz.'),
  L('h-fil-kazan', 'hafif', 'Fil ve piyon kazanır', '8/8/8/8/4k3/8/3PK3/2B5 w - - 0 1', 'win',
    'Filinle piyonun önündeki kareleri kontrol et, şahınla yol aç ve piyonu terfi ettir.'),
  L('h-at-kazan', 'hafif', 'At ve piyon kazanır', '8/8/8/8/4k3/8/3PK3/1N6 w - - 0 1', 'win',
    'At kısa adımlarla yaklaşır; piyonu korumaya ve siyah şahı uzak tutmaya kullan.'),
  L('h-farkli-fil', 'hafif', 'Farklı renkli filler', '8/8/3k4/8/3P4/3K4/6b1/2B5 b - - 0 1', 'draw',
    'Sen siyahsın. Filler farklı renkte: piyonun önündeki açık renkli kareleri filinle ve şahınla tut, beyaz geçemez.'),
  L('h-at-pyn', 'hafif', 'At piyonu durdurur', '8/8/8/8/8/5k2/p7/2N3K1 w - - 0 1', 'draw',
    'Atınla terfi karesini kontrol et ya da piyonun önüne geç. Piyonu durdurursan beraberlik.'),
  L('h-fil-pyn', 'hafif', 'Fil piyonu durdurur', '8/8/8/8/8/6k1/1p6/3B2K1 w - - 0 1', 'draw',
    'Fil uzaktan terfi karesini tutar. Filini piyonun yolundaki köşegene koy.'),
  L('h-2at', 'hafif', 'İki at mat edemez', '8/8/8/4k3/8/8/8/1N2K1N1 b - - 0 1', 'draw',
    'Sen siyahsın. İki at tek başına mat edemez; ama köşeye sıkışırsan dikkatsizlikle mat olabilirsin. Merkezde kal.'),

  // ---- İleri ----
  L('mat-filat', 'ileri', 'Fil ve at ile mat', '8/8/8/4k3/8/8/8/1N2KB2 w - - 0 1', 'mate',
    'En zor temel mat. Siyah şahı önce kenara, sonra filinle aynı renkteki köşeye sür. At, fil ve şah birlikte çalışmalı.'),
  L('i-filat-2', 'ileri', 'Fil ve at ile mat (2)', '7k/8/8/8/8/8/8/2B1KN2 w - - 0 1', 'mate',
    'Siyah şah yanlış (filinle farklı renkteki) köşede. Onu kenar boyunca doğru köşeye taşı.'),
  L('v-kale', 'ileri', 'Vezir kaleye karşı', '8/8/4k3/8/2r5/8/8/3QK3 w - - 0 1', 'mate',
    'Vezir kazanır ama sabır ister. Siyah şahı kenara it, kaleyi şahından ayırıp çatalla kazanmayı ya da mat etmeyi ara.'),
  L('i-vezir-kp', 'ileri', 'Vezir, kale ve piyona karşı', '8/8/8/3k4/3p4/3r4/8/3QK3 w - - 0 1', 'mate',
    'Kale ve piyon birbirine bağlı. Şah çekerek ve çatal arayarak bu bağı kopar.'),
  L('k-vancura', 'ileri', 'Vancura savunması', 'R7/6k1/P4r2/8/8/8/6K1/8 b - - 0 1', 'draw',
    'Sen siyahsın. Kaleni piyonun yanında, 6. sırada tut ki piyona yandan saldırsın; beyaz şah yaklaşınca şah çek.'),
  L('i-kale-fil', 'ileri', 'Kale ve file karşı savunma', '8/8/8/4k3/8/8/2r5/4KB1R b - - 0 1', 'draw',
    'Sen siyahsın. Kale ve fil çoğu zaman kaleye karşı kazanamaz. Şahını kenardan uzak tut, tehlikede kaleyle şah çek.'),
  L('i-kale-fil-2', 'ileri', 'Kale file karşı: savunma', '8/8/8/8/8/5k2/8/2b1K2R b - - 0 1', 'draw',
    'Sen siyahsın (filin var). Şahını filinle farklı renkteki köşeye götür; orada mat ağı kurulamaz.'),
  L('i-kale-fil-3', 'ileri', 'Kale ve file karşı savunma (2)', '8/8/8/8/8/2k5/2r5/4KB1R b - - 0 1', 'draw',
    'Kaleni şahına yakın ve aktif tut. Taşların birbirini korusun.'),
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);
export const GOAL_TEXT = { mate: 'Mat et', win: 'Kazan (mat et ya da piyonu güvenle terfi ettir)', draw: 'Beraberliği tut' };
