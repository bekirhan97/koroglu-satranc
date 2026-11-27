import chess, chess.pgn, glob, os, json, hashlib, re, io
D="/mnt/user-data/uploads/KÖROĞLU STRATEJİK SORULAR"
SHORT={'Bricard':'bricard','Build Up':'yusupov1','Chess Evolution':'yusupov3','Converting an Advantage':'kuljasevic',
'Converting Material':'zlat-mat','Converting Positional':'zlat-poz','Evaluation and Plan':'mct','Grooten':'grooten',
'Reassess':'silman','Defence Masterclass':'defence-mc','Closed Positions':'closed','Positional Play Part 1':'iypp1',
'Positional Play Part 2':'iypp2','Mastering Chess Defense':'defense','Hellsten':'hellsten','Initiative':'initiative',
"Amateur":'amateur','Winning_Chess':'wcs'}
def short(fn):
    for k,v in SHORT.items():
        if k in fn: return v
CHAPTER_BOOKS={'bricard','grooten','silman','defense','hellsten','initiative','amateur','wcs'}
out=[]; seen=set(); stats={}
for f in sorted(glob.glob(D+"/*.pgn")):
    b=short(os.path.basename(f)); n=0
    fh=open(f,encoding='utf-8',errors='replace')
    while True:
        try: g=chess.pgn.read_game(fh)
        except Exception: continue
        if g is None: break
        h=g.headers
        if 'FEN' not in h: continue
        try: board=g.board()
        except Exception: continue
        if not board.is_valid(): continue
        node=g.variations[0] if g.variations else None
        if node is None: continue
        mv=node.move
        if mv is None or mv==chess.Move.null() or mv not in board.legal_moves: continue
        if len(board.piece_map())<6: continue
        key=' '.join(board.fen().split()[:4])
        if key in seen: continue
        seen.add(key)
        w=h.get('White',''); bl=h.get('Black','')
        chap = w if b in CHAPTER_BOOKS else (bl if b.startswith('yusupov') else '')
        # second book move (opponent reply) and third for a short line
        line=[]; nd=g; bb=board.copy()
        for i in range(6):
            if not nd.variations: break
            nd=nd.variations[0]
            if nd.move is None or nd.move==chess.Move.null() or nd.move not in bb.legal_moves: break
            line.append(nd.move.uci()); bb.push(nd.move)
        out.append({'id':'st-'+hashlib.sha1(key.encode()).hexdigest()[:10],'book':b,'chap':chap.strip(),'fen':board.fen(),'move':mv.uci(),'line':line})
        n+=1
    stats[b]=n
json.dump(out,open('/home/claude/strat/candidates.json','w'),ensure_ascii=False)
print(len(out),stats)
