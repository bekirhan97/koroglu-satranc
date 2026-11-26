#!/usr/bin/env python3
"""Measures how hard each Oyunsonu lesson is, so levels and order can follow real difficulty.

For every lesson the solution is played out (student best move, opponent best defence) and at each student turn
we count how many moves keep the goal (win/mate: still winning; draw: still holding):
  only  = turns where exactly one move works (and there was a choice)
  frac  = average share of moves that work (low = easy to go wrong)
  first = 1 if the very first move is the only one
  L     = solution length in student moves (mate/win: from DTM/DTZ, draw: the holding length)
≤ 7 pieces: Lichess tablebase (exact). More pieces: Stockfish MultiPV (practical judgement).
Usage: python3 scripts/measure-endgames.py resources/endgames.json out.json [stockfish.js]
Resumable: already measured FENs in out.json are skipped."""
import json, sys, time, os, math, urllib.request, urllib.parse
import chess, chess.engine

src, dst = sys.argv[1], sys.argv[2]
sf_path = sys.argv[3] if len(sys.argv) > 3 else '/tmp/sf/node_modules/stockfish/src/stockfish-17.1-lite-51f59da.js'
cur = json.load(open(src))
out = json.load(open(dst)) if os.path.exists(dst) else {}
MAX_TURNS = 10
WINC = {'win', 'syzygy-win', 'maybe-win', 'cursed-win'}
LOSSC = {'loss', 'syzygy-loss', 'maybe-loss', 'blessed-loss'}

cache = {}
def tb(fen):
    if fen in cache: return cache[fen]
    url = 'https://tablebase.lichess.ovh/standard?fen=' + urllib.parse.quote(fen)
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'koroglu-satranc endgame difficulty (contact via github bekirhan97)'})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.load(r)
            cache[fen] = data
            time.sleep(0.12)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(61); continue
            time.sleep(3)
        except Exception:
            time.sleep(3)
    raise RuntimeError('tablebase unreachable')

def good_tb(move, goal):
    c = move.get('category')  # from the opponent's view after the move
    return c in LOSSC if goal in ('win', 'mate') else (c in LOSSC or c == 'draw' or c in {'cursed-win', 'blessed-loss'})

def measure_tb(l):
    b = chess.Board(l['fen'])
    if l.get('oppFirst'):
        d = tb(b.fen())
        if not d.get('moves'): return None
        b.push_uci(d['moves'][0]['uci'])
    root = tb(b.fen())
    dtm, dtz = root.get('dtm'), root.get('dtz')
    if l['goal'] == 'draw': L = 12
    elif dtm is not None: L = math.ceil(abs(dtm) / 2)
    elif dtz is not None: L = math.ceil(abs(dtz) / 2) + 3
    else: L = 20
    only = 0; fracs = []; first = 0
    for t in range(MAX_TURNS):
        if b.is_game_over(): break
        d = tb(b.fen()) if t else root
        moves = d.get('moves') or []
        if not moves: break
        g = sum(1 for m in moves if good_tb(m, l['goal']))
        if g == 0: break
        fracs.append(g / len(moves))
        if g == 1 and len(moves) > 1:
            only += 1
            if t == 0: first = 1
        b.push_uci(moves[0]['uci'])            # student: best move
        if b.is_game_over(): break
        o = tb(b.fen()).get('moves') or []
        if not o: break
        b.push_uci(o[0]['uci'])                # opponent: best defence
        if chess.popcount(b.occupied) <= 3 and l['goal'] != 'mate' and not any(p.piece_type == chess.PAWN for p in b.piece_map().values()):
            break                              # bare-king endings: nothing left to learn
    return {'only': only, 'frac': round(sum(fracs) / len(fracs), 3) if fracs else 1, 'first': first, 'L': L, 'turns': len(fracs), 'src': 'tb'}

eng = None
def sf_eval_moves(b, n):
    info = eng.analyse(b, chess.engine.Limit(depth=12, time=1.0), multipv=n)
    res = []
    for i in info:
        if 'pv' not in i or not i['pv']: continue
        sc = i['score'].pov(b.turn).score(mate_score=10000)
        res.append((i['pv'][0], sc))
    return res

def measure_sf(l):
    global eng
    if eng is None: eng = chess.engine.SimpleEngine.popen_uci(['node', sf_path])
    b = chess.Board(l['fen'])
    if l.get('oppFirst'):
        r = sf_eval_moves(b, 1)
        if not r: return None
        b.push(r[0][0])
    only = 0; fracs = []; first = 0
    for t in range(6):
        if b.is_game_over(): break
        legal = b.legal_moves.count()
        r = sf_eval_moves(b, min(legal, 8))
        if not r: break
        best = r[0][1]
        if l['goal'] == 'draw': g = sum(1 for _, s in r if s >= -80)
        else: g = sum(1 for _, s in r if s >= max(150, best - 80))
        g = max(g, 1)
        fracs.append(g / legal)                 # moves outside the top 8 are treated as not working
        if g == 1 and legal > 1:
            only += 1
            if t == 0: first = 1
        b.push(r[0][0])
        if b.is_game_over(): break
        o = sf_eval_moves(b, 1)
        if not o: break
        b.push(o[0][0])
    return {'only': only, 'frac': round(sum(fracs) / len(fracs), 3) if fracs else 1, 'first': first, 'L': 25, 'turns': len(fracs), 'src': 'sf'}

todo = [l for l in cur['lessons'] if l['fen'] not in out]
SHARD = os.environ.get('SHARD')  # "k/n": measure every n-th lesson (run several in parallel, then merge the outputs)
if SHARD:
    k, n = map(int, SHARD.split('/')); todo = todo[k::n]
print(len(todo), 'to measure', flush=True)
for i, l in enumerate(todo):
    try:
        m = measure_tb(l) if l['src'] == 'tb' else measure_sf(l)
        if m: out[l['fen']] = m
    except Exception as e:
        print('skip', l['id'], e, flush=True)
    if i % 20 == 0:
        json.dump(out, open(dst, 'w')); print(i, len(todo), flush=True)
json.dump(out, open(dst, 'w'))
if eng: eng.quit()
print('done', len(out), flush=True)
