# Builds resources/puzzles.json: a quality, rating-stratified sample of the Lichess puzzle database (CC0).
# Usage: python3 scripts/build-puzzles.py lichess_db_puzzle.csv.zst resources/puzzles.json [per_bucket]
import sys, csv, io, json, zstandard
from collections import Counter, defaultdict
src, out = sys.argv[1], sys.argv[2]
PER = int(sys.argv[3]) if len(sys.argv) > 3 else 2500
buckets = defaultdict(list)
themes_count = Counter()
with open(src, 'rb') as f:
    r = csv.reader(io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(f), encoding='utf-8'))
    header = next(r)
    for row in r:
        pid, fen, moves, rating, rd, pop, plays, themes = row[:8]
        rating, rd, pop, plays = int(rating), int(rd), int(pop), int(plays)
        if rd > 90 or pop < 85 or plays < 300:
            continue
        b = max(4, min(29, rating // 100))
        if len(buckets[b]) >= PER:
            continue
        th = themes.split()
        buckets[b].append((pid, fen, moves, rating, th))
        themes_count.update(th)
puz = [p for b in sorted(buckets) for p in buckets[b]]
theme_list = [t for t, _ in themes_count.most_common()]
idx = {t: i for i, t in enumerate(theme_list)}
data = {'themes': theme_list, 'puzzles': [[p[0], p[1], p[2], p[3], [idx[t] for t in p[4]]] for p in puz]}
json.dump(data, open(out, 'w'), separators=(',', ':'))
print('puzzles', len(puz), {b: len(v) for b, v in sorted(buckets.items())})
print('themes', len(theme_list), theme_list)
