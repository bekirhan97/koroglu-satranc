#!/usr/bin/env python3
"""Builds resources/endgames.json (Oyunsonu curriculum) from verified book positions.

Input: a JSON list of positions extracted from the coach's endgame PGN books (positions + chapter labels only;
no annotations) and verified with the Lichess tablebase (<= 7 pieces) or Stockfish (practical positions):
  [{ book, i, chap, sub, fen, n, src: 'tb'|'sf', result: 'win'|'draw'|'loss'|'unclear', dtm, cp }]
Usage: python3 scripts/build-endgames.py verified.json resources/endgames.json scripts/endgame-difficulty.json
Titles and explanations are written here (Turkish, our own words)."""
import json, re, sys, collections
import chess

src, dst = sys.argv[1], sys.argv[2]
P = json.load(open(src))

CHAPTERS = [
    ('mat', 'Temel matlar', 'Tek kalan şahı mat etmek: vezir, kale, iki fil, fil ve at.', '♚', 'teori'),
    ('piyon', 'Şah ve piyon', 'Kare kuralı, opozisyon, anahtar kareler, üçgenleme, piyon yarışları.', '♟', 'teori'),
    ('kale', 'Kale oyunsonları', 'Lucena, Philidor, şahı kesmek, kale piyona karşı.', '♜', 'teori'),
    ('kale-hafif', 'Kale hafif taşa karşı', 'Kale file ya da ata karşı; kale ve fil kaleye karşı.', '♖', 'teori'),
    ('fil', 'Fil oyunsonları', 'Doğru ve yanlış renkli fil, aynı ve farklı renkli filler.', '♝', 'teori'),
    ('at', 'At oyunsonları', 'At piyonu durdurur mu? Atla mat ve atın zayıf kareleri.', '♞', 'teori'),
    ('hafif', 'Fil ve at', 'Hafif taşlar birbirine ve piyonlara karşı.', '♗', 'teori'),
    ('vezir', 'Vezir oyunsonları', 'Vezir piyona, kaleye ve hafif taşlara karşı.', '♛', 'teori'),
    ('p-piyon', 'Pratik piyon oyunsonları', 'Ustaların maçlarından ve kitap alıştırmalarından piyon oyunsonları.', '♟', 'pratik'),
    ('p-kale', 'Pratik kale oyunsonları', 'Gerçek maçlardan kale oyunsonları: aktif kale, 7. sıra, şahın gücü.', '♜', 'pratik'),
    ('p-hafif', 'Pratik hafif taş oyunsonları', 'Fil ve at oyunsonları: iyi fil – kötü fil, at mı fil mi?', '♝', 'pratik'),
    ('p-vezir', 'Pratik vezir oyunsonları', 'Vezir oyunsonlarında şah güvenliği ve geçer piyon.', '♛', 'pratik'),
    ('p-karisik', 'Pratik karışık oyunsonları', 'Farklı taşların karşılaştığı oyunsonları.', '♚', 'pratik'),
]

def material(fen):
    b = chess.Board(fen)
    side = {chess.WHITE: collections.Counter(), chess.BLACK: collections.Counter()}
    for sq, pc in b.piece_map().items():
        if pc.piece_type != chess.KING:
            side[pc.color][pc.symbol().lower()] += 1
    return b, side

def chapter_of(o):
    b, side = material(o['fen'])
    allp = side[True] + side[False]
    kinds = set(allp)
    if o['src'] == 'sf':
        if kinds <= {'p'}: return 'p-piyon'
        if 'q' in kinds: return 'p-vezir'
        if kinds <= {'r', 'p'}: return 'p-kale'
        if kinds <= {'b', 'n', 'p'}: return 'p-hafif'
        return 'p-karisik'
    # theory
    for col in (True, False):
        if not side[not col] and 'p' not in side[col] and side[col]:
            return 'mat'
    if kinds <= {'p'}: return 'piyon'
    if 'q' in kinds: return 'vezir'
    if kinds <= {'r', 'p'}: return 'kale'
    if 'r' in kinds: return 'kale-hafif'
    if kinds <= {'b', 'p'}: return 'fil'
    if kinds <= {'n', 'p'}: return 'at'
    return 'hafif'

TOPICS = [  # (regex on chapter+subtitle, Turkish topic)
    (r'two queens', 'İki vezirle mat'), (r'staircase|two rooks vs\. lone|king and two rooks', 'İki kale ile mat'),
    (r'queen and rook vs\. lone', 'Vezir ve kale ile mat'), (r'stalemate', 'Pata dikkat'), (r'the box', 'Kutu yöntemi'),
    (r'king and queen vs\. lone|queen vs\. lone|queen checkmate', 'Vezir ile mat'),
    (r'king and rook vs\. lone|rook vs\. lone king|mating with the rook', 'Kale ile mat'),
    (r'two bishops', 'İki fil ile mat'), (r'b\+n|bishop and knight|knight \+ bishop', 'Fil ve at ile mat'),
    (r'king \+ knight checkmate|knight checkmate', 'Atla mat'),
    (r'minor piece vs\.? queen', 'Hafif taş vezire karşı'), (r'what can', 'Hangi taşlar mat edebilir?'),
    (r'understanding the king|king is a fighting', 'Şahın gücü'), (r'triangulation', 'Üçgenleme'),
    (r'tr[ée]buchet', 'Karşılıklı zugzwang (trebuşe)'), (r'key square', 'Anahtar kareler'),
    (r'distant opposition', 'Uzak opozisyon'), (r'opposition', 'Opozisyon'),
    (r'square', 'Kare kuralı'), (r'outside passed', 'Uzak geçer piyon'), (r'breakthrough', 'Piyon kırılması'),
    (r'strange races|reti|race', 'Piyon yarışları'), (r'doubled', 'Çift piyonlar'),
    (r'two healthy pawns|connected passed pawns|connected pawns', 'Bağlı piyonlar'),
    (r'pawns on one side', 'Aynı kanatta piyonlar'), (r'protected passed', 'Korunan geçer piyon'),
    (r'wrong colou?red|wrong corner|wrong colour', 'Yanlış renkli fil'), (r'right corner', 'Doğru köşe'),
    (r'opposite colou?rs|opposite bishops', 'Farklı renkli filler'), (r'centurini', 'Centurini'),
    (r'bishop and pawn|bishop and two pawns|same colou?r', 'Aynı renkli filler'),
    (r'lucena', 'Lucena'), (r'philidor', 'Philidor'), (r'vancura', 'Vancura'), (r'saavedra', 'Saavedra'),
    (r'flowchart', 'Kale oyunsonu yol haritası'), (r'7th rank|seventh', '7. sıra'),
    (r'rook in front', 'Kale piyonun önünde'), (r'rook and two connected', 'Kale ve iki bağlı piyon'),
    (r'trap the enemy king|cut off|imprisoning', 'Şahı kesmek'), (r'frontal defence|short side|lateral', 'Savunma teknikleri'),
    (r'fortress', 'Kale (fortress) kurmak'),
    (r'queen vs\.? (king and )?pawn|queen vs\.? pawn|pawn on 6th|pawn on the 7th|7th-rank (rook|bishop)', 'Vezir piyona karşı'),
    (r'queen vs\.? rook|blockade', 'Vezir kaleye karşı'),
    (r'rook vs\.? lone pawn|pawn wins against the rook|kings play|rook vs\.? pawn', 'Kale piyona karşı'),
    (r'knight vs\.? lone pawn|knight\'?s pawn|knight - |knight\'s dumb|dumb square', 'At piyona karşı'),
    (r'bishop vs\.? lone pawn|bishop v', 'Fil piyona karşı'),
    (r'rook-pawn|rook\'?s pawn|rook pawn', 'Kale piyonu'),
    (r'king and pawn vs\. lone king', 'Şah ve piyon tek şaha karşı'), (r'king and pawn vs\. king and pawn', 'Şah ve piyon şah ve piyona karşı'),
    (r'rook and pawn \(on 4th', 'Kale ve piyon kaleye karşı'), (r'entombed|dominated|deep freeze', 'Taşı hapsetmek'),
    (r'queen and pawn|queen endgames', 'Vezir oyunsonu'), (r'fox in the chicken', 'Tavuk kümesindeki tilki'),
    (r'tactic', 'Oyunsonu taktikleri'), (r'\btest\b|^exercise', 'Kendini sına'),
]
MATERIAL_TOPIC = {'piyon': 'Şah ve piyon', 'kale': 'Kale ve piyonlar', 'kale-hafif': 'Kale hafif taşa karşı', 'fil': 'Fil oyunsonu',
                  'at': 'At oyunsonu', 'hafif': 'Fil ve at', 'vezir': 'Vezir oyunsonu', 'mat': 'Temel matlar'}
GAME = re.compile(r"^([A-Z][\w.'\- ]+?) vs\.? ([A-Z][\w.'\- ]+?)(,.*)?$")

PIECEW = re.compile(r'^(king|queen|rook|bishop|knight|pawn|two|minor|lone|the)\b', re.I)
def is_game(o):
    m = GAME.match(o['sub'].strip())
    return m if (m and not PIECEW.match(m.group(1)) and not PIECEW.match(m.group(2))) else None

def topic_of(o, ch):
    s = (o['chap'] + ' | ' + o['sub']).lower()
    if is_game(o): return 'Ustaların oyunlarından'
    for rx, t in TOPICS:
        if re.search(rx, s): return t
    return MATERIAL_TOPIC.get(ch, 'Pratik oyunsonları' if ch.startswith('p-') else 'Oyunsonu')

TEXT = {
    'Vezir ile mat': 'Vezirle şahın kutusunu küçült, sonra kendi şahını yaklaştır. Vezir şaha çok yaklaşıp pat yapmasın.',
    'Kale ile mat': 'Kale bir çizgiyi keser, şahın karşı şahla karşı karşıya gelerek onu geri iter. Kenara gelince kaleyle mat et.',
    'İki kale ile mat': 'Kaleler sırayla şah çekip merdiven gibi ilerler. Şah bir kaleye yaklaşırsa o kaleyi öbür uca kaçır.',
    'İki vezirle mat': 'İki vezir merdiven gibi birlikte ilerler; birkaç hamlede mat edersin.',
    'Vezir ve kale ile mat': 'Ağır taşlar sırayla sıraları keser; şahını getirmene bile gerek kalmaz.',
    'Kutu yöntemi': 'Kalenin ya da vezirin kesdiği alan bir kutudur. Her hamlede kutuyu küçült.',
    'Pata dikkat': 'Rakip şaha hiç kaçacak kare bırakmazsan ve şah çekmiyorsan pat olur. Mat eden kareyi dikkatle seç.',
    'İki fil ile mat': 'İki fil yan yana duvar örer. Şahını da kullanarak rakip şahı köşeye sür; mat yalnızca köşede olur.',
    'Fil ve at ile mat': 'Rakip şahı önce kenara, sonra filinle aynı renkteki köşeye sür. Şah, fil ve at birlikte çalışmalı.',
    'Atla mat': 'Tek atla mat ancak rakibin kendi taşları şahını sıkıştırırsa olur. Doğru kareyi bul.',
    'Hafif taş vezire karşı': 'Vezir genelde kazanır: önce şahları ayır, sonra çatal ya da mat ara.',
    'Hangi taşlar mat edebilir?': 'Hangi taşların tek şaha mat yapabileceğini bilmek, değiş tokuş kararlarını kolaylaştırır.',
    'Şahın gücü': 'Oyunsonunda şah en güçlü taşlardan biridir. Merkezileştir ve rakip şahın önünü kes.',
    'Opozisyon': 'Şahlar aynı hatta, aralarında tek kare varken sırası gelen geri çekilmek zorundadır. Opozisyonu ele geçir.',
    'Uzak opozisyon': 'Şahlar arasında tek sayıda kare varken de opozisyon geçerlidir. Uzaktan doğru kareyi seç.',
    'Kare kuralı': 'Piyondan terfi karesine kadar bir kare çiz: şah bu karenin içine girebiliyorsa piyonu yakalar.',
    'Anahtar kareler': 'Şahın anahtar karelerden birine ulaşırsa piyon terfi eder. O kareye giden yolu bul.',
    'Üçgenleme': 'Şahını üç karelik bir üçgende dolaştırarak sırayı rakibe ver; rakip geri çekilmek zorunda kalsın.',
    'Karşılıklı zugzwang (trebuşe)': 'Sırası gelen kaybeder. Hamle sırasını rakibe bırakacak yolu bul.',
    'Uzak geçer piyon': 'Uzaktaki geçer piyon rakip şahı kendine çeker; o sırada senin şahın öbür kanatta piyonları toplar.',
    'Piyon kırılması': 'Piyon fedasıyla rakip piyon zincirini kır ve bir piyonunu terfiye gönder.',
    'Piyon yarışları': 'Hamleleri say! Bazen şah iki işi birden yapar: kendi piyonunu destekler, rakibinkini yakalar.',
    'Çift piyonlar': 'Çift piyonlar zayıf görünür ama tempo kazanmak için işe yarayabilir. Doğru zamanlamayı bul.',
    'Bağlı piyonlar': 'Bağlı piyonlar birbirini korur. Şahını yaklaştır ve birlikte ilerlet.',
    'Aynı kanatta piyonlar': 'Fazla piyonu kullanmak için şahını aktifleştir, piyon çoğunluğunla geçer piyon yarat.',
    'Korunan geçer piyon': 'Korunan geçer piyon rakip şahı bağlar; sen şahınla öbür tarafta iş yaparsın.',
    'Yanlış renkli fil': 'Kale piyonu ve terfi karesini kontrol edemeyen fil: savunan şah köşeye ulaşırsa beraberlik.',
    'Doğru köşe': 'Fil ile kale piyonunda terfi karesi filin renginde ise kazanırsın. Şahı köşeden uzak tut.',
    'Farklı renkli filler': 'Farklı renkli fillerde savunan taraf piyonların önündeki kareleri tutarak çoğu zaman berabere kalır.',
    'Aynı renkli filler': 'Aynı renkli fillerde piyonu filin kontrol etmediği renge koy ve rakip fili tek köşegene sıkıştır.',
    'Centurini': 'Aynı renkli fillerde savunan fil, piyonun önündeki iki köşegeni tutabiliyorsa beraberlik olur.',
    'Lucena': 'Kaleni dördüncü sıraya getirip köprü kur; şahın çıkınca kale şahları kesecek ve piyon vezir olacak.',
    'Philidor': 'Savunanın kalesi 3. sırayı (6. sıra) tutar; piyon ilerleyince kale arkaya geçip şah çeker.',
    'Vancura': 'Kale piyonuna karşı kale yandan piyona saldırır, rakip şah yaklaşınca şah çeker.',
    'Saavedra': 'Ünlü çalışma: terfi ederken doğru taşı seç, pat tuzağına düşme.',
    'Kale oyunsonu yol haritası': 'Kale oyunsonlarında önce temel konumları (Lucena, Philidor) hatırla, sonra planını kur.',
    '7. sıra': 'Yedinci sıraya giren kale piyonlara saldırır ve rakip şahı hapseder.',
    'Kale piyonun önünde': 'Kale piyonun önündeyken şahın piyonu desteklemeli; rakip kale yandan şah çekecek.',
    'Kale ve iki bağlı piyon': 'İki bağlı piyon kaleyle birlikte ilerler; rakip şahı uzak tut.',
    'Şahı kesmek': 'Kaleyle rakip şahı bir hat boyunca kes; kesik şah piyonu durduramaz.',
    'Savunma teknikleri': 'Doğru savunma yöntemini seç: önden, yandan ya da arkadan şah çekmek.',
    'Kale (fortress) kurmak': 'Fazla taşa rağmen rakibin geçemeyeceği bir kale (fortress) kur.',
    'Vezir piyona karşı': 'Şah çekerek ya da terfi karesini tutarak rakip şahı piyonun önüne sok, her seferinde şahını yaklaştır.',
    'Vezir kaleye karşı': 'Rakip şahı kenara it, kaleyi şahından ayır; çatal ya da mat ara.',
    'Kale piyona karşı': 'Hamleleri say: şahın zamanında yetişebilecek mi? Kaleyle piyonu arkadan ya da önden durdur.',
    'At piyona karşı': 'At piyonun önündeki kareleri tutabilir; kale piyonu ise at için en zor olanıdır.',
    'Fil piyona karşı': 'Fil uzaktan terfi karesini kontrol eder. Doğru köşegeni bul.',
    'Kale piyonu': 'Kale piyonunda savunan şah köşeye ulaşırsa çoğu zaman beraberlik olur.',
    'Oyunsonu taktikleri': 'Oyunsonunda da taktikler belirleyicidir: çatal, açmaz, piyon terfisi. Hamleleri hesapla.',
    'Şah ve piyon tek şaha karşı': 'Şahını piyonun önüne getir ve opozisyonu kullan. Savunan taraf piyonun önündeki kareyi tutarsa beraberlik olur.',
    'Şah ve piyon şah ve piyona karşı': 'Rakip piyonu toplamak mı, kendi piyonunu ilerletmek mi? Hamleleri say ve opozisyonu unutma.',
    'Kale ve piyon kaleye karşı': 'Şahın piyonu desteklesin, kalen rakip şahı kessin. Doğru anda Lucena köprüsü kur.',
    'Taşı hapsetmek': 'Rakip taşın hareket alanını kapat; hapsolan taş oyundan çıkar ve sen fazla taşla oynarsın.',
    'Tavuk kümesindeki tilki': 'Şahın rakip piyonların arasına girer ve onları bir bir toplar.',
    'Kendini sına': 'Bu bölümde öğrendiklerini sına: konumu değerlendir ve en iyi planı bul.',
    'Ustaların oyunlarından': 'Ünlü bir maçtan oyunsonu. Ustanın planını bulmaya çalış: aktif şah, aktif taşlar, zayıf piyonlar.',
}
DEFAULT_TEXT = {
    'win': 'Avantajı kazanca çevir: şahını aktifleştir, piyonlarını ilerlet ve rakibin karşı oyununu engelle.',
    'mate': 'Rakip şahı kenara it ve mat et.',
    'draw': 'Konumu tut: aktif savun, rakibe ilerleme fırsatı verme.',
}
GOAL_ADD = {'draw': ' Hedefin beraberliği tutmak.', 'win': '', 'mate': ''}

SILMAN_LEVEL = {1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 6}
def level_of(o, ch):
    if o['book'] == 'silman':
        m = re.search(r'Part (\d)', o['chap'])
        if m: return SILMAN_LEVEL.get(int(m.group(1)), 3)
    n = o['n']
    base = 1 if n <= 3 else 2 if n <= 4 else 3 if n <= 5 else 4 if n <= 7 else 5
    if ch in ('kale-hafif', 'vezir') and base < 3: base += 1
    if o['src'] == 'sf': base = max(base, 4)
    return min(base, 6)

SKIP = re.compile(r'preface|introduction|acknowledg|foreword|final thoughts|summing up|recommended', re.I)
lessons, counter = [], collections.Counter()
order = {'silman': 0, 'theory': 1, 'villa': 2}
for o in sorted(P, key=lambda x: (order.get(x['book'], 9), x['i'])):
    if o.get('result') not in ('win', 'draw', 'loss'): continue
    if o['n'] > 20 or SKIP.search(o['chap'] + ' ' + o['sub']): continue
    b = chess.Board(o['fen'])
    if b.is_game_over(): continue
    ch = chapter_of(o)
    opp = o['result'] == 'loss'
    if o['result'] == 'draw': goal = 'draw'
    else:
        winner = (not b.turn) if opp else b.turn
        _, side = material(o['fen'])
        goal = 'mate' if o['src'] == 'tb' and 'p' not in side[winner] and not any(side[not winner][k] for k in 'p') else 'win'
    t = topic_of(o, ch)
    m = is_game(o)
    counter[(ch, t)] += 1
    title = (re.sub(r'\s*\(.*$|\s+\d+$', '', m.group(1).strip()) + ' – ' + re.sub(r'\s*\(.*$|\s+\d+$', '', m.group(2).strip())) if m else f"{t} {counter[(ch, t)]}"
    text = TEXT.get(t, DEFAULT_TEXT[goal]) + GOAL_ADD[goal]
    if opp: text += ' Rakip ilk hamleyi yapar.'
    lessons.append({'id': f"eg-{o['book'][0]}{o['i']}", 'ch': ch, 'topic': t, 'title': title, 'fen': o['fen'], 'goal': goal,
                    'oppFirst': opp, 'text': text, 'level': level_of(o, ch), 'src': o['src']})

# ids: unique in source order (stable — students' progress is keyed by id)
seen = collections.Counter()
for l in lessons:
    seen[l['id']] += 1
    if seen[l['id']] > 1: l['id'] += f"-{seen[l['id']]}"

# ---- difficulty: measured (scripts/measure-endgames.py) → level + order ----
DIFF = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
def kinds(fen):
    return len({p.piece_type for p in chess.Board(fen).piece_map().values() if p.piece_type != chess.KING})
def raw_score(l):
    m = DIFF.get(l['fen'])
    if not m: return None
    return (1.3 * m['only'] + 1.0 * m['first'] + 3.0 * (1 - m['frac']) + 0.06 * min(m['L'], 40)
            + 0.35 * kinds(l['fen']) + (0.8 if l['src'] == 'sf' else 0))
src_level = {l['id']: l['level'] for l in lessons}          # book-based guess (Silman part / piece count)
scored = [(raw_score(l), l) for l in lessons]
vals = sorted(v for v, _ in scored if v is not None)
def pct(v):
    import bisect
    return bisect.bisect_left(vals, v) / max(1, len(vals) - 1)
for v, l in scored:
    p = pct(v) if v is not None else (src_level[l['id']] - 1) / 5
    if l['id'].startswith('eg-s') and v is not None:             # Silman's own rating of the chapter still counts a little
        p = 0.75 * p + 0.25 * (src_level[l['id']] - 1) / 5
    l['_d'] = round(p, 4)
cuts = [0.15, 0.35, 0.55, 0.75, 0.9]
for l in lessons:
    l['level'] = 1 + sum(l['_d'] >= c for c in cuts)

# order inside a chapter: by level (easy → hard); inside a level concept by concept in teaching order, then difficulty.
TOPIC_ORDER = ['Vezir ile mat', 'Kale ile mat', 'Kutu yöntemi', 'Pata dikkat', 'İki kale ile mat', 'İki vezirle mat', 'Vezir ve kale ile mat',
    'Temel matlar', 'İki fil ile mat', 'Fil ve at ile mat', 'Atla mat', 'Hangi taşlar mat edebilir?',
    'Şahın gücü', 'Kare kuralı', 'Şah ve piyon tek şaha karşı', 'Opozisyon', 'Anahtar kareler', 'Kale piyonu', 'Uzak opozisyon',
    'Üçgenleme', 'Karşılıklı zugzwang (trebuşe)', 'Şah ve piyon şah ve piyona karşı', 'Şah ve piyon', 'Piyon yarışları', 'Uzak geçer piyon',
    'Korunan geçer piyon', 'Bağlı piyonlar', 'Çift piyonlar', 'Aynı kanatta piyonlar', 'Piyon kırılması', 'Tavuk kümesindeki tilki',
    'Şahı kesmek', 'Kale piyona karşı', 'Philidor', 'Lucena', 'Kale ve piyon kaleye karşı', 'Kale piyonun önünde', 'Vancura',
    'Savunma teknikleri', '7. sıra', 'Kale ve iki bağlı piyon', 'Kale ve piyonlar', 'Kale oyunsonu yol haritası',
    'Fil piyona karşı', 'Doğru köşe', 'Yanlış renkli fil', 'Aynı renkli filler', 'Centurini', 'Farklı renkli filler', 'Fil oyunsonu',
    'At piyona karşı', 'At oyunsonu', 'Fil ve at', 'Kale hafif taşa karşı', 'Hafif taş vezire karşı',
    'Vezir piyona karşı', 'Vezir kaleye karşı', 'Vezir oyunsonu', 'Taşı hapsetmek', 'Kale (fortress) kurmak', 'Saavedra', 'Oyunsonu taktikleri']
def tkey(l):
    t = l['topic']
    late = 2 if t == 'Kendini sına' else 1 if t == 'Ustaların oyunlarından' else 0
    return (late, TOPIC_ORDER.index(t) if t in TOPIC_ORDER else 99, t)
lessons.sort(key=lambda l: ([c[0] for c in CHAPTERS].index(l['ch']), l['level'], tkey(l), l['_d']))
# titles numbered in the new order
num = collections.Counter()
for l in lessons:
    if l['topic'] != 'Ustaların oyunlarından' or ' – ' not in l['title']:
        num[(l['ch'], l['topic'])] += 1
        l['title'] = f"{l['topic']} {num[(l['ch'], l['topic'])]}"
    l['diff'] = l.pop('_d')
chapters = [{'id': c[0], 'name': c[1], 'desc': c[2], 'icon': c[3], 'kind': c[4]} for c in CHAPTERS if any(l['ch'] == c[0] for l in lessons)]
json.dump({'chapters': chapters, 'lessons': lessons}, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(lessons), 'lessons', collections.Counter(l['ch'] for l in lessons))
print(collections.Counter(l['goal'] for l in lessons), collections.Counter(l['level'] for l in lessons))
